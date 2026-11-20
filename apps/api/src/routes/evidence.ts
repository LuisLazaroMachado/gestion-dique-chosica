import type { FastifyInstance } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { evidenceMeta } from '@dique/shared';
import { sql } from '../db.js';
import { authenticate, canAccessStructure, requireRole, signPurposeToken, verifyPurposeToken } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { parse, toPoint } from '../util.js';
import { storage } from '../storage.js';

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

export async function evidenceRoutes(app: FastifyInstance) {
  // Las fotos llegan como binario crudo (máx. 15 MB).
  for (const ct of Object.keys(EXT)) {
    app.addContentTypeParser(ct, { parseAs: 'buffer', bodyLimit: 15 * 1024 * 1024 }, (_req, body, done) => done(null, body));
  }

  // Paso 1: registrar metadatos y obtener una URL temporal de carga (15 min). Idempotente por deviceRecordId.
  app.post('/evidence/upload-url', async (req, reply) => {
    const user = await authenticate(req);
    const b = parse(evidenceMeta, req.body);
    // Las fotos de una inspección propia se pueden subir aunque la asignación ya esté completada
    // (la sincronización offline puede llegar después).
    let ownInspection = false;
    if (b.inspectionId) {
      const [i] = await sql`SELECT inspector_id, structure_id FROM inspections WHERE id = ${b.inspectionId}`;
      if (!i || i.structure_id !== b.structureId) throw badRequest('La inspección no corresponde a la estructura');
      if (user.role === 'inspector' && i.inspector_id !== user.id) throw forbidden();
      ownInspection = i.inspector_id === user.id;
    }
    if (!ownInspection && !(await canAccessStructure(sql, user, b.structureId))) throw forbidden('Estructura no asignada');
    if (b.interventionId) requireRole(user, 'planner', 'admin');
    let row;
    if (b.deviceRecordId) [row] = await sql`SELECT id, upload_status FROM evidence WHERE device_record_id = ${b.deviceRecordId}`;
    if (!row) {
      const key = `${b.structureId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${EXT[b.contentType]}`;
      [row] = await sql`
        INSERT INTO evidence (structure_id, inspection_id, intervention_id, evidence_type, object_key, content_type,
          size_bytes, checksum_sha256, captured_at, geom, location_mock, device_record_id, uploaded_by)
        VALUES (${b.structureId}, ${b.inspectionId ?? null}, ${b.interventionId ?? null}, ${b.evidenceType}, ${key},
          ${b.contentType}, ${b.sizeBytes}, ${b.checksumSha256 ?? null}, ${b.capturedAt ?? null},
          ${b.location ? toPoint(b.location.lat, b.location.lon) : null}::geometry, ${b.location?.mock ?? null},
          ${b.deviceRecordId ?? null}, ${user.id})
        RETURNING id, upload_status`;
    }
    reply.code(201);
    const token = await signPurposeToken('evidence_upload', row.id);
    return {
      evidenceId: row.id, uploadStatus: row.upload_status, method: 'PUT',
      uploadUrl: `/api/v1/evidence/${row.id}/content?token=${encodeURIComponent(token)}`,
    };
  });

  // Paso 2: subir el archivo. Se verifica checksum (integridad) y tipo de contenido.
  app.put('/evidence/:id/content', async (req) => {
    const { id } = req.params as { id: string };
    const { token } = req.query as { token?: string };
    if (!token || (await verifyPurposeToken(token, 'evidence_upload')) !== id) throw forbidden('Token de carga inválido');
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Archivo vacío o tipo no permitido');
    const [ev] = await sql`SELECT * FROM evidence WHERE id = ${id}`;
    if (!ev) throw notFound();
    if (ev.upload_status === 'confirmada') return { evidenceId: id, uploadStatus: 'confirmada', duplicate: true };
    if (req.headers['content-type'] !== ev.content_type) throw badRequest('El tipo de archivo no coincide con lo declarado');
    const checksum = createHash('sha256').update(body).digest('hex');
    if (ev.checksum_sha256 && ev.checksum_sha256 !== checksum) throw badRequest('Checksum no coincide: el archivo llegó dañado, reintente');
    await storage.put(ev.object_key, body, ev.content_type);
    await sql`UPDATE evidence SET upload_status = 'confirmada', checksum_sha256 = ${checksum}, size_bytes = ${body.length} WHERE id = ${id}`;
    await audit(sql, { actorId: ev.uploaded_by, action: 'cargar_evidencia', entityType: 'evidence', entityId: id,
      after: { type: ev.evidence_type, size: body.length, checksum } });
    return { evidenceId: id, uploadStatus: 'confirmada', checksum };
  });

  // Descarga privada: requiere sesión y permiso sobre la estructura (nunca enlaces públicos permanentes).
  app.get('/evidence/:id/content', async (req, reply) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    const [ev] = await sql`SELECT * FROM evidence WHERE id = ${id}`;
    if (!ev || ev.upload_status !== 'confirmada') throw notFound('Evidencia no disponible');
    const isOwn = ev.uploaded_by === user.id;
    if (!isOwn && !(await canAccessStructure(sql, user, ev.structure_id))) throw forbidden();
    const data = await storage.get(ev.object_key);
    reply.header('Content-Type', ev.content_type).header('Cache-Control', 'private, max-age=300');
    return reply.send(data);
  });

  app.get('/evidence', async (req) => {
    const user = await authenticate(req);
    const q = req.query as { structureId?: string; inspectionId?: string; interventionId?: string };
    if (!q.structureId && !q.inspectionId && !q.interventionId) throw badRequest('Indique un filtro');
    const rows = await sql`
      SELECT e.id, e.structure_id, e.inspection_id, e.intervention_id, e.evidence_type, e.content_type, e.captured_at,
             e.upload_status, e.location_mock, e.checksum_sha256, u.display_name AS uploaded_by_name, e.created_at
        FROM evidence e JOIN users u ON u.id = e.uploaded_by
       WHERE (${q.structureId ?? null}::uuid IS NULL OR e.structure_id = ${q.structureId ?? null})
         AND (${q.inspectionId ?? null}::uuid IS NULL OR e.inspection_id = ${q.inspectionId ?? null})
         AND (${q.interventionId ?? null}::uuid IS NULL OR e.intervention_id = ${q.interventionId ?? null})
       ORDER BY e.created_at DESC`;
    const allowed = [];
    for (const r of rows) if (await canAccessStructure(sql, user, r.structure_id)) allowed.push(r);
    return { items: allowed };
  });
}
