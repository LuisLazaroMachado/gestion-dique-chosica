import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { accessExceptionInput, assignmentInput } from '@dique/shared';
import { sql } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { parse } from '../util.js';

export async function assignmentRoutes(app: FastifyInstance) {
  app.get('/assignments', async (req) => {
    const user = await authenticate(req);
    const q = req.query as { status?: string; inspectorId?: string };
    const onlyMine = user.role === 'inspector';
    const rows = await sql`
      SELECT a.*, s.code AS structure_code, s.name AS structure_name, s.watershed,
             ui.display_name AS inspector_name, ub.display_name AS assigned_by_name
        FROM assignments a
        JOIN structures s ON s.id = a.structure_id
        JOIN users ui ON ui.id = a.inspector_id
        JOIN users ub ON ub.id = a.assigned_by
       WHERE (NOT ${onlyMine} OR a.inspector_id = ${user.id})
         AND (${q.inspectorId ?? null}::uuid IS NULL OR a.inspector_id = ${q.inspectorId ?? null})
         AND (${q.status ?? null}::text IS NULL OR a.status = ${q.status ?? null})
       ORDER BY a.assigned_at DESC`;
    return {
      items: rows.map((r) => ({
        id: r.id, structureId: r.structure_id, structureCode: r.structure_code, structureName: r.structure_name,
        watershed: r.watershed, inspectorId: r.inspector_id, inspectorName: r.inspector_name,
        assignedBy: r.assigned_by, assignedByName: r.assigned_by_name, assignedAt: r.assigned_at,
        dueAt: r.due_at, instructions: r.instructions, status: r.status,
      })),
    };
  });

  app.post('/assignments', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(assignmentInput, req.body);
    const ids = await sql.begin(async (tx) => {
      const [insp] = await tx`SELECT id, role, can_inspect, active FROM users WHERE id = ${b.inspectorId}`;
      if (!insp || !insp.active || !(insp.role === 'inspector' || insp.can_inspect)) {
        throw badRequest('El usuario seleccionado no puede inspeccionar');
      }
      const out: string[] = [];
      for (const sid of b.structureIds) {
        const [s] = await tx`SELECT id FROM structures WHERE id = ${sid} AND active`;
        if (!s) throw badRequest(`Estructura inexistente o inactiva: ${sid}`);
        const [a] = await tx`
          INSERT INTO assignments (structure_id, inspector_id, assigned_by, due_at, instructions)
          VALUES (${sid}, ${b.inspectorId}, ${user.id}, ${b.dueAt ?? null}, ${b.instructions ?? null}) RETURNING id`;
        await audit(tx, { actorId: user.id, action: 'asignar', entityType: 'assignment', entityId: a.id, after: { structureId: sid, ...b } });
        out.push(a.id);
      }
      return out;
    });
    reply.code(201);
    return { ids };
  });

  app.patch('/assignments/:id', async (req) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    const b = parse(z.object({ status: z.enum(['asignada', 'en_curso', 'completada', 'cancelada']), reason: z.string().trim().optional() }), req.body);
    return sql.begin(async (tx) => {
      const [a] = await tx`SELECT * FROM assignments WHERE id = ${id} FOR UPDATE`;
      if (!a) throw notFound();
      const isOwner = a.inspector_id === user.id;
      if (user.role === 'inspector' && (!isOwner || b.status === 'cancelada')) throw forbidden();
      if (b.status === 'cancelada' && !b.reason) throw badRequest('Indique el motivo de la cancelación');
      await tx`UPDATE assignments SET status = ${b.status} WHERE id = ${id}`;
      await audit(tx, { actorId: user.id, action: 'cambiar_estado_asignacion', entityType: 'assignment', entityId: id,
        before: { status: a.status }, after: { status: b.status }, reason: b.reason ?? null });
      return { id, status: b.status };
    });
  });

  // Excepciones: autorización registrada para que un inspector acceda a una estructura no asignada.
  app.get('/access-exceptions', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const rows = await sql`
      SELECT x.*, s.code AS structure_code, u.display_name AS user_name, g.display_name AS granted_by_name
        FROM access_exceptions x JOIN structures s ON s.id = x.structure_id
        JOIN users u ON u.id = x.user_id JOIN users g ON g.id = x.granted_by ORDER BY x.granted_at DESC`;
    return { items: rows };
  });

  app.post('/access-exceptions', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(accessExceptionInput, req.body);
    const [x] = await sql`
      INSERT INTO access_exceptions (structure_id, user_id, reason, granted_by, expires_at)
      VALUES (${b.structureId}, ${b.userId}, ${b.reason}, ${user.id}, ${b.expiresAt ?? null}) RETURNING id`;
    await audit(sql, { actorId: user.id, action: 'registrar_excepcion', entityType: 'access_exception', entityId: x.id, after: b, reason: b.reason });
    reply.code(201);
    return { id: x.id };
  });
}
