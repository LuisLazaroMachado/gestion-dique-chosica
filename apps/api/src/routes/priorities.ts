import type { FastifyInstance } from 'fastify';
import { exposureInput, priorityDecisionInput, urgencyInput } from '@dique/shared';
import { z } from 'zod';
import { sql } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, notFound } from '../errors.js';
import { parse } from '../util.js';
import { recalculatePriorities } from '../services/priority.js';

export async function priorityRoutes(app: FastifyInstance) {
  // ───── Exposición versionada ─────
  app.get('/exposure-estimates', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const q = req.query as { structureId?: string };
    const rows = await sql`
      SELECT e.id, e.structure_id, s.code AS structure_code, e.method, e.affected_homes, e.persons_per_home,
             e.estimated_persons, e.persons_low, e.persons_high, e.method_notes, e.source, e.data_label, e.confidence,
             e.valid_from, e.polygon_version, e.change_reason, e.created_at, u.display_name AS author,
             CASE WHEN e.polygon IS NULL THEN NULL ELSE ST_AsGeoJSON(e.polygon, 6)::json END AS polygon
        FROM exposure_estimates e JOIN structures s ON s.id = e.structure_id LEFT JOIN users u ON u.id = e.created_by
       WHERE (${q.structureId ?? null}::uuid IS NULL OR e.structure_id = ${q.structureId ?? null})
       ORDER BY s.code, e.valid_from DESC, e.created_at DESC`;
    return { items: rows };
  });

  app.post('/exposure-estimates', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(exposureInput, req.body);
    const n = b.method === 'VxH' ? (b.affectedHomes as number) * (b.personsPerHome as number) : (b.estimatedPersons as number);
    const result = await sql.begin(async (tx) => {
      const [prev] = await tx`SELECT id, estimated_persons FROM exposure_estimates WHERE structure_id = ${b.structureId}
                               ORDER BY valid_from DESC, created_at DESC LIMIT 1`;
      if (prev && !b.changeReason) throw badRequest('Indique el motivo de la actualización de N');
      const [row] = await tx`
        INSERT INTO exposure_estimates (structure_id, method, affected_homes, persons_per_home, estimated_persons,
          persons_low, persons_high, method_notes, source, data_label, confidence, valid_from, previous_id, change_reason, created_by)
        VALUES (${b.structureId}, ${b.method}, ${b.affectedHomes ?? null}, ${b.personsPerHome ?? null}, ${n},
          ${b.personsLow ?? null}, ${b.personsHigh ?? null}, ${b.methodNotes}, ${b.source}, ${b.dataLabel}, ${b.confidence},
          ${b.validFrom}, ${prev?.id ?? null}, ${b.changeReason ?? null}, ${user.id})
        RETURNING id`;
      await audit(tx, { actorId: user.id, action: 'registrar_exposicion', entityType: 'exposure', entityId: row.id,
        before: prev ? { id: prev.id, estimatedPersons: prev.estimated_persons } : null, after: { ...b, estimatedPersons: n },
        reason: b.changeReason ?? 'Primera estimación' });
      const priority = await recalculatePriorities(tx, user.id, `Actualización de exposición de estructura ${b.structureId}`);
      return { id: row.id, estimatedPersons: n, priority };
    });
    reply.code(201);
    return result;
  });

  // ───── Prioridad ─────
  app.get('/priorities', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const [batch] = await sql`SELECT * FROM priority_batches ORDER BY calculated_at DESC LIMIT 1`;
    if (!batch) return { batch: null, items: [], notCalculated: [] };
    const items = await sql`
      SELECT pc.*, s.code, s.name, s.watershed, s.physical_status, s.intervention_status, s.origin_inventory,
             s.location_label, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon,
             i.inspected_at, i.data_label AS inspection_label, e.data_label AS exposure_label, e.confidence AS exposure_confidence,
             ur.level AS urgency_level, ur.justification AS urgency_justification,
             ia.access_status
        FROM priority_calculations pc
        JOIN structures s ON s.id = pc.structure_id
        JOIN inspections i ON i.id = pc.inspection_id
        JOIN exposure_estimates e ON e.id = pc.exposure_id
        LEFT JOIN LATERAL (SELECT level, justification FROM urgencies u WHERE u.structure_id = s.id
                            ORDER BY created_at DESC LIMIT 1) ur ON true
        LEFT JOIN LATERAL (SELECT access_status FROM inspections x WHERE x.structure_id = s.id
                            ORDER BY inspected_at DESC LIMIT 1) ia ON true
       WHERE pc.batch_id = ${batch.id}
       ORDER BY pc.p DESC, s.code`;
    // Estructuras activas sin P en este lote, con el motivo.
    const notCalculated = await sql`
      SELECT s.id, s.code, s.name, s.watershed, s.physical_status,
        CASE
          WHEN NOT EXISTS (SELECT 1 FROM inspections i WHERE i.structure_id = s.id AND i.validation_status = 'Validado')
            THEN 'Falta una inspección aprobada'
          WHEN NOT EXISTS (SELECT 1 FROM exposure_estimates e WHERE e.structure_id = s.id) THEN 'Falta el número de personas expuestas'
          ELSE 'La última inspección aprobada no evaluó daño, material o erosión'
        END AS reason
        FROM structures s
       WHERE s.active AND NOT EXISTS (SELECT 1 FROM priority_calculations pc WHERE pc.batch_id = ${batch.id} AND pc.structure_id = s.id)
       ORDER BY s.code`;
    // Empates exactos de P: se señalan para decisión manual justificada.
    const ties: Record<string, string[]> = {};
    for (const r of items) (ties[String(r.p)] ??= []).push(r.code);
    return {
      batch,
      items: items.map((r) => ({
        structureId: r.structure_id, code: r.code, name: r.name, watershed: r.watershed, originInventory: r.origin_inventory,
        physicalStatus: r.physical_status, interventionStatus: r.intervention_status,
        location: r.lat == null ? null : { lat: r.lat, lon: r.lon, label: r.location_label },
        d: r.d, c: r.c, a: r.a, n: r.n_persons, nMax: r.n_max, e: r.e, x: r.x, p: r.p,
        warnings: r.warnings, formulaVersion: r.formula_version, calculatedAt: r.calculated_at,
        inspectedAt: r.inspected_at, inspectionLabel: r.inspection_label, exposureLabel: r.exposure_label,
        exposureConfidence: r.exposure_confidence, urgency: r.urgency_level ? { level: r.urgency_level, justification: r.urgency_justification } : null,
        accessStatus: r.access_status, tie: (ties[String(r.p)]?.length ?? 0) > 1,
      })),
      notCalculated,
    };
  });

  app.post('/priorities/recalculate', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(z.object({ reason: z.string().trim().min(3).default('Recálculo manual') }).partial(), req.body ?? {});
    return sql.begin((tx) => recalculatePriorities(tx, user.id, b.reason ?? 'Recálculo manual'));
  });

  app.get('/priorities/batches', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    return { items: await sql`SELECT * FROM priority_batches ORDER BY calculated_at DESC LIMIT 100` };
  });

  app.get('/priorities/batches/:id', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const [batch] = await sql`SELECT * FROM priority_batches WHERE id = ${id}`;
    if (!batch) throw notFound();
    const items = await sql`SELECT pc.*, s.code, s.name FROM priority_calculations pc JOIN structures s ON s.id = pc.structure_id
                             WHERE pc.batch_id = ${id} ORDER BY pc.p DESC`;
    return { batch, items };
  });

  app.post('/priorities/decisions', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(priorityDecisionInput, req.body);
    const [batch] = await sql`SELECT id FROM priority_batches ORDER BY calculated_at DESC LIMIT 1`;
    const [row] = await sql`INSERT INTO priority_decisions (batch_id, structure_ids, decision, justification, created_by)
                            VALUES (${batch?.id ?? null}, ${b.structureIds}, ${b.decision}, ${b.justification}, ${user.id}) RETURNING id`;
    await audit(sql, { actorId: user.id, action: 'decision_prioridad', entityType: 'priority_decision', entityId: row.id, after: b, reason: b.justification });
    reply.code(201);
    return { id: row.id };
  });

  app.get('/priorities/decisions', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    return { items: await sql`SELECT d.*, u.display_name AS author FROM priority_decisions d JOIN users u ON u.id = d.created_by ORDER BY d.created_at DESC` };
  });

  // ───── Urgencia operativa (no altera P) ─────
  app.post('/urgencies', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(urgencyInput, req.body);
    const [row] = await sql`INSERT INTO urgencies (structure_id, level, justification, created_by)
                            VALUES (${b.structureId}, ${b.level}, ${b.justification}, ${user.id}) RETURNING id`;
    await audit(sql, { actorId: user.id, action: 'registrar_urgencia', entityType: 'urgency', entityId: row.id, after: b, reason: b.justification });
    reply.code(201);
    return { id: row.id };
  });

  app.get('/urgencies', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const q = req.query as { structureId?: string };
    return { items: await sql`
      SELECT u.*, s.code, us.display_name AS author FROM urgencies u JOIN structures s ON s.id = u.structure_id
        JOIN users us ON us.id = u.created_by
       WHERE (${q.structureId ?? null}::uuid IS NULL OR u.structure_id = ${q.structureId ?? null})
       ORDER BY u.created_at DESC` };
  });
}
