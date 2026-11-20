import * as SQLite from 'expo-sqlite';

// Base local (SQLite) para trabajar sin conexión. Nada se borra antes de que el servidor confirme.
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('priori-dique.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS structures (id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, structure_id TEXT NOT NULL, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS last_inspections (structure_id TEXT PRIMARY KEY, data TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS outbox_inspections (
          id TEXT PRIMARY KEY,               -- UUID local = deviceRecordId (idempotencia)
          structure_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | enviado | confirmado | error
          server_id TEXT,
          error TEXT,
          validation_status TEXT,
          validation_notes TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS outbox_photos (
          id TEXT PRIMARY KEY,               -- UUID local = deviceRecordId de la evidencia
          inspection_local_id TEXT NOT NULL,
          structure_id TEXT NOT NULL,
          file_uri TEXT NOT NULL,
          evidence_type TEXT NOT NULL,
          meta TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendiente',
          server_id TEXT,
          error TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS outbox_corrections (
          id TEXT PRIMARY KEY,
          inspection_local_id TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pendiente',
          error TEXT,
          created_at TEXT NOT NULL
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function kvGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}
export async function kvSet(key: string, value: string | null) {
  const db = await getDb();
  if (value === null) await db.runAsync('DELETE FROM kv WHERE key = ?', key);
  else await db.runAsync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

export interface LocalStructure {
  id: string; code: string; name: string; watershed: string; structureType: string; physicalStatus: string;
  location: { lat: number; lon: number; label: string; confidence: string; method: string | null } | null;
  sourceReference: string | null; originInventory: string;
}
export interface LocalAssignment { id: string; structureId: string; dueAt: string | null; instructions: string | null; status: string; assignedByName: string }
export interface OutboxInspection {
  id: string; structure_id: string; payload: string; status: string; server_id: string | null; error: string | null;
  validation_status: string | null; validation_notes: string | null; created_at: string; updated_at: string;
}
export interface OutboxPhoto {
  id: string; inspection_local_id: string; structure_id: string; file_uri: string; evidence_type: string; meta: string;
  status: string; server_id: string | null; error: string | null; created_at: string;
}

export async function saveBootstrap(data: { structures: LocalStructure[]; assignments: LocalAssignment[]; lastInspections: any[]; myRecentInspections: any[] }) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM structures');
    await db.runAsync('DELETE FROM assignments');
    await db.runAsync('DELETE FROM last_inspections');
    for (const s of data.structures) await db.runAsync('INSERT INTO structures (id, data) VALUES (?, ?)', s.id, JSON.stringify(s));
    for (const a of data.assignments) await db.runAsync('INSERT INTO assignments (id, structure_id, data) VALUES (?, ?, ?)', a.id, a.structureId, JSON.stringify(a));
    for (const l of data.lastInspections) await db.runAsync('INSERT INTO last_inspections (structure_id, data) VALUES (?, ?)', l.structure_id, JSON.stringify(l));
    // Estado de validación de mis inspecciones (observaciones del responsable).
    for (const r of data.myRecentInspections) {
      if (!r.device_record_id) continue;
      await db.runAsync('UPDATE outbox_inspections SET validation_status = ?, validation_notes = ?, server_id = COALESCE(server_id, ?) WHERE id = ?',
        r.validation_status, r.validation_notes ?? null, r.id, r.device_record_id);
    }
  });
  await kvSet('last_download', new Date().toISOString());
}

export async function listAssignments(): Promise<Array<LocalAssignment & { structure: LocalStructure | null; last: any | null }>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ data: string; sdata: string | null; ldata: string | null }>(
    `SELECT a.data, s.data AS sdata, l.data AS ldata FROM assignments a
       LEFT JOIN structures s ON s.id = a.structure_id LEFT JOIN last_inspections l ON l.structure_id = a.structure_id`);
  return rows.map((r) => ({ ...JSON.parse(r.data), structure: r.sdata ? JSON.parse(r.sdata) : null, last: r.ldata ? JSON.parse(r.ldata) : null }));
}

export async function getStructure(id: string): Promise<LocalStructure | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ data: string }>('SELECT data FROM structures WHERE id = ?', id);
  return r ? JSON.parse(r.data) : null;
}
export async function getLastInspection(structureId: string) {
  const db = await getDb();
  const r = await db.getFirstAsync<{ data: string }>('SELECT data FROM last_inspections WHERE structure_id = ?', structureId);
  return r ? JSON.parse(r.data) : null;
}

export async function queueCounts() {
  const db = await getDb();
  const ins = await db.getAllAsync<{ status: string; n: number }>('SELECT status, count(*) AS n FROM outbox_inspections GROUP BY status');
  const ph = await db.getAllAsync<{ status: string; n: number }>('SELECT status, count(*) AS n FROM outbox_photos GROUP BY status');
  const cor = await db.getAllAsync<{ status: string; n: number }>('SELECT status, count(*) AS n FROM outbox_corrections GROUP BY status');
  const to = (rows: { status: string; n: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  return { inspections: to(ins), photos: to(ph), corrections: to(cor) };
}
