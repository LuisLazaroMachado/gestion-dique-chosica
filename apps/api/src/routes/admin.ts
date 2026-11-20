import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userInput, userUpdate } from '@dique/shared';
import { sql } from '../db.js';
import { authenticate, hashPassword, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { parse } from '../util.js';

const publicUser = (u: Record<string, any>) => ({
  id: u.id, email: u.email, displayName: u.display_name, role: u.role,
  canInspect: u.can_inspect, canViewAll: u.can_view_all, active: u.active, createdAt: u.created_at,
});

export async function adminRoutes(app: FastifyInstance) {
  // ───── Usuarios ─────
  app.get('/users', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const rows = await sql`SELECT * FROM users ORDER BY active DESC, role, display_name`;
    return { items: rows.map(publicUser) };
  });

  app.post('/users', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(userInput, req.body);
    // El responsable tiene gestión limitada: solo crea inspectores.
    if (user.role === 'planner' && b.role !== 'inspector') throw forbidden('El responsable solo puede crear inspectores');
    const [exists] = await sql`SELECT 1 FROM users WHERE lower(email) = lower(${b.email})`;
    if (exists) throw conflict('Ya existe un usuario con ese correo');
    const [u] = await sql`
      INSERT INTO users (email, display_name, role, password_hash, can_inspect, can_view_all)
      VALUES (${b.email}, ${b.displayName}, ${b.role}, ${await hashPassword(b.password)}, ${b.canInspect ?? false}, ${b.canViewAll ?? false})
      RETURNING *`;
    await audit(sql, { actorId: user.id, action: 'crear_usuario', entityType: 'user', entityId: u.id, after: publicUser(u) });
    reply.code(201);
    return publicUser(u);
  });

  app.patch('/users/:id', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'admin');
    const { id } = req.params as { id: string };
    const b = parse(userUpdate, req.body);
    return sql.begin(async (tx) => {
      const [before] = await tx`SELECT * FROM users WHERE id = ${id} FOR UPDATE`;
      if (!before) throw notFound();
      if (id === user.id && (b.active === false || (b.role && b.role !== 'admin'))) throw badRequest('No puede desactivarse ni quitarse el rol de administrador a sí mismo');
      const [after] = await tx`
        UPDATE users SET display_name = COALESCE(${b.displayName ?? null}, display_name), role = COALESCE(${b.role ?? null}, role),
          can_inspect = COALESCE(${b.canInspect ?? null}, can_inspect), can_view_all = COALESCE(${b.canViewAll ?? null}, can_view_all),
          active = COALESCE(${b.active ?? null}, active),
          password_hash = COALESCE(${b.password ? await hashPassword(b.password) : null}, password_hash)
        WHERE id = ${id} RETURNING *`;
      // Desactivar no borra historial: el usuario sigue referenciado en sus registros.
      await audit(tx, { actorId: user.id, action: 'editar_usuario', entityType: 'user', entityId: id,
        before: publicUser(before), after: { ...publicUser(after), passwordChanged: Boolean(b.password) }, reason: b.reason });
      return publicUser(after);
    });
  });

  // ───── Auditoría ─────
  app.get('/audit', async (req) => {
    const user = await authenticate(req);
    const q = req.query as { entityType?: string; entityId?: string; actorId?: string; limit?: string };
    const limit = Math.min(Number(q.limit ?? 200), 1000);
    // El inspector solo consulta su propia actividad.
    const actor = user.role === 'inspector' ? user.id : (q.actorId ?? null);
    const rows = await sql`
      SELECT a.*, u.display_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       WHERE (${q.entityType ?? null}::text IS NULL OR a.entity_type = ${q.entityType ?? null})
         AND (${q.entityId ?? null}::uuid IS NULL OR a.entity_id = ${q.entityId ?? null})
         AND (${actor}::uuid IS NULL OR a.actor_id = ${actor})
       ORDER BY a.occurred_at DESC LIMIT ${limit}`;
    return { items: rows };
  });

  // ───── Configuración ─────
  app.get('/settings', async (req) => {
    await authenticate(req);
    return { items: await sql`SELECT key, value, notes, updated_at FROM settings ORDER BY key` };
  });

  app.put('/settings/:key', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { key } = req.params as { key: string };
    const allowed: Record<string, z.ZodTypeAny> = {
      inspection_interval_months: z.number().int().min(1).max(36),
      base_central: z.object({ name: z.string().min(2), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
    };
    if (!allowed[key]) throw badRequest('Parámetro no editable');
    const b = parse(z.object({ value: allowed[key], reason: z.string().trim().min(3) }), req.body);
    const [before] = await sql`SELECT value FROM settings WHERE key = ${key}`;
    await sql`UPDATE settings SET value = ${sql.json(b.value)}, updated_at = now() WHERE key = ${key}`;
    await audit(sql, { actorId: user.id, action: 'editar_configuracion', entityType: 'setting', before: { key, value: before?.value },
      after: { key, value: b.value }, reason: b.reason });
    return { key, value: b.value };
  });
}
