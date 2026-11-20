import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { api, ApiError, getServerUrl } from './api';
import { getDb, saveBootstrap, kvSet, type OutboxInspection, type OutboxPhoto } from './db';

// Sincronización idempotente:
//  1. Inspecciones: POST con deviceRecordId = UUID local. Reenviar no duplica (el servidor responde la existente).
//  2. Fotos: cada una por separado (upload-url + PUT binario con checksum). Se reintentan sin afectar la inspección.
//  3. Correcciones: PATCH con motivo. Si el servidor rechaza, queda en error visible; nunca se sobrescribe en silencio.
// La copia local no se borra hasta que el servidor confirma.

const now = () => new Date().toISOString();
const isRetryable = (e: unknown) => e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.status === 429);

export async function downloadAssignments() {
  const data = await api('/sync/bootstrap');
  await saveBootstrap(data);
  await kvSet('user', JSON.stringify(data.user));
  return data;
}

function base64ToBytes(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0, bits = 0, idx = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | chars.indexOf(ch); bits += 6;
    if (bits >= 8) { bits -= 8; out[idx++] = (buffer >> bits) & 0xff; }
  }
  return out.subarray(0, idx);
}

async function sha256File(uri: string): Promise<{ hex: string; size: number }> {
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const bytes = base64ToBytes(b64);
  const hash = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { hex, size: bytes.length };
}

async function syncInspection(row: OutboxInspection) {
  const db = await getDb();
  await db.runAsync("UPDATE outbox_inspections SET status = 'enviado', updated_at = ? WHERE id = ?", now(), row.id);
  try {
    const payload = JSON.parse(row.payload);
    const res = await api('/inspections', { body: { ...payload, deviceRecordId: row.id } });
    await db.runAsync("UPDATE outbox_inspections SET status = 'confirmado', server_id = ?, error = NULL, validation_status = ?, updated_at = ? WHERE id = ?",
      res.id, res.validationStatus ?? 'Enviado', now(), row.id);
  } catch (e) {
    const msg = e instanceof ApiError ? e.full : String(e);
    await db.runAsync("UPDATE outbox_inspections SET status = ?, error = ?, updated_at = ? WHERE id = ?",
      isRetryable(e) ? 'pendiente' : 'error', msg, now(), row.id);
    if (isRetryable(e)) throw e; // sin conexión: detener el ciclo
  }
}

async function syncPhoto(p: OutboxPhoto, inspectionServerId: string) {
  const db = await getDb();
  try {
    const info = await FileSystem.getInfoAsync(p.file_uri);
    if (!info.exists) throw new ApiError(400, 'El archivo local de la foto ya no existe');
    const { hex, size } = await sha256File(p.file_uri);
    const meta = JSON.parse(p.meta);
    const up = await api('/evidence/upload-url', { body: {
      structureId: p.structure_id, inspectionId: inspectionServerId, evidenceType: p.evidence_type, contentType: 'image/jpeg',
      sizeBytes: size, checksumSha256: hex, capturedAt: meta.capturedAt, deviceRecordId: p.id, location: meta.location ?? null,
    } });
    if (up.uploadStatus !== 'confirmada') {
      const base = await getServerUrl();
      const r = await FileSystem.uploadAsync(`${base}${up.uploadUrl}`, p.file_uri, {
        httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': 'image/jpeg' },
      });
      if (r.status < 200 || r.status >= 300) {
        let m = `Error ${r.status}`; try { m = JSON.parse(r.body).error ?? m; } catch { /* */ }
        throw new ApiError(r.status, m);
      }
    }
    await db.runAsync("UPDATE outbox_photos SET status = 'confirmado', server_id = ?, error = NULL WHERE id = ?", up.evidenceId, p.id);
  } catch (e) {
    const msg = e instanceof ApiError ? e.full : String(e);
    await db.runAsync('UPDATE outbox_photos SET status = ?, error = ? WHERE id = ?', isRetryable(e) ? 'pendiente' : 'error', msg, p.id);
    if (isRetryable(e)) throw e;
  }
}

export async function syncAll(): Promise<{ ok: boolean; message: string }> {
  const db = await getDb();
  try {
    // Reintentar también los marcados "enviado" que quedaron a medias (p. ej. app cerrada durante el envío).
    const inspections = await db.getAllAsync<OutboxInspection>(
      "SELECT * FROM outbox_inspections WHERE status IN ('pendiente','enviado','error') ORDER BY created_at");
    for (const row of inspections) await syncInspection(row);

    const photos = await db.getAllAsync<OutboxPhoto & { server_inspection: string | null }>(
      `SELECT p.*, i.server_id AS server_inspection FROM outbox_photos p JOIN outbox_inspections i ON i.id = p.inspection_local_id
        WHERE p.status IN ('pendiente','error') AND i.status = 'confirmado' ORDER BY p.created_at`);
    for (const p of photos) if (p.server_inspection) await syncPhoto(p, p.server_inspection);

    const corrections = await db.getAllAsync<{ id: string; inspection_local_id: string; payload: string; server_id: string | null }>(
      `SELECT c.*, i.server_id FROM outbox_corrections c JOIN outbox_inspections i ON i.id = c.inspection_local_id
        WHERE c.status IN ('pendiente','error') AND i.status = 'confirmado' ORDER BY c.created_at`);
    for (const c of corrections) {
      try {
        await api(`/inspections/${c.server_id}`, { method: 'PATCH', body: JSON.parse(c.payload) });
        await db.runAsync("UPDATE outbox_corrections SET status = 'confirmado', error = NULL WHERE id = ?", c.id);
      } catch (e) {
        await db.runAsync('UPDATE outbox_corrections SET status = ?, error = ? WHERE id = ?',
          isRetryable(e) ? 'pendiente' : 'error', e instanceof ApiError ? e.full : String(e), c.id);
        if (isRetryable(e)) throw e;
      }
    }
    await downloadAssignments().catch(() => undefined);
    await kvSet('last_sync', now());
    return { ok: true, message: 'Sincronización completa' };
  } catch (e) {
    return { ok: false, message: e instanceof ApiError ? e.full : String(e) };
  }
}

/** Guarda una inspección en el teléfono (sin conexión) junto con sus fotos. */
export async function saveInspectionLocally(structureId: string, payload: Record<string, unknown>,
  photos: Array<{ uri: string; type: string; capturedAt: string; location: { lat: number; lon: number; mock?: boolean } | null }>) {
  const db = await getDb();
  const id = Crypto.randomUUID();
  const dir = `${FileSystem.documentDirectory}evidencias/${id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  await db.withTransactionAsync(async () => {
    await db.runAsync('INSERT INTO outbox_inspections (id, structure_id, payload, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, structureId, JSON.stringify(payload), 'pendiente', now(), now());
    for (const p of photos) {
      const pid = Crypto.randomUUID();
      const dest = `${dir}${pid}.jpg`;
      // Copia permanente: la caché de la cámara puede limpiarse.
      await FileSystem.copyAsync({ from: p.uri, to: dest });
      await db.runAsync('INSERT INTO outbox_photos (id, inspection_local_id, structure_id, file_uri, evidence_type, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        pid, id, structureId, dest, p.type, JSON.stringify({ capturedAt: p.capturedAt, location: p.location }), now());
    }
  });
  return id;
}

export async function queueCorrection(inspectionLocalId: string, reason: string, changes: Record<string, unknown>) {
  const db = await getDb();
  await db.runAsync('INSERT INTO outbox_corrections (id, inspection_local_id, payload, created_at) VALUES (?, ?, ?, ?)',
    Crypto.randomUUID(), inspectionLocalId, JSON.stringify({ reason, changes }), now());
}
