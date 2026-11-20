import type { Db } from './db.js';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/** Registra un evento de auditoría (tabla de solo inserción). */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  await db`
    INSERT INTO audit_log (actor_id, action, entity_type, entity_id, before_data, after_data, reason)
    VALUES (${e.actorId}, ${e.action}, ${e.entityType}, ${e.entityId ?? null},
            ${e.before === undefined ? null : db.json(e.before as never)},
            ${e.after === undefined ? null : db.json(e.after as never)},
            ${e.reason ?? null})`;
}
