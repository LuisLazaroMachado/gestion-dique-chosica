import type { FastifyInstance } from 'fastify';
import { structureInput, structureUpdate } from '@dique/shared';
import { sql, type Db } from '../db.js';
import { authenticate, canAccessStructure, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { forbidden, notFound } from '../errors.js';
import { mapStructure, parse, toPoint } from '../util.js';
import { recalculatePriorities } from '../services/priority.js';

const SELECT = (db: Db) => db`
  SELECT s.*, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon,
         li.inspected_at AS last_inspection_at,
         (li.inspected_at + make_interval(months => (SELECT (value)::int FROM settings WHERE key = 'inspection_interval_months'))) AS next_inspection_due
    FROM structures s
    LEFT JOIN LATERAL (
      SELECT inspected_at FROM inspections i
       WHERE i.structure_id = s.id AND i.validation_status = 'Validado'
       ORDER BY inspected_at DESC LIMIT 1) li ON true`;

export async function getStructure(db: Db, id: string) {
  const [r] = await db`${SELECT(db)} WHERE s.id = ${id}`;
  return r ? mapStructure(r) : null;
}

export async function structureRoutes(app: FastifyInstance) {
  app.get('/structures', async (req) => {
    const user = await authenticate(req);
    const q = req.query as { watershed?: string; origin?: string; includeInactive?: string };
    const restricted = user.role === 'inspector' && !user.canViewAll;
    const rows = await sql`
      ${SELECT(sql)}
      WHERE (${q.includeInactive === 'true'} OR s.active)
        AND (${q.watershed ?? null}::text IS NULL OR s.watershed = ${q.watershed ?? null})
        AND (${q.origin ?? null}::text IS NULL OR s.origin_inventory = ${q.origin ?? null})
        AND (NOT ${restricted} OR EXISTS (
              SELECT 1 FROM assignments a WHERE a.structure_id = s.id AND a.inspector_id = ${user.id}
                 AND a.status IN ('asignada','en_curso'))
             OR EXISTS (SELECT 1 FROM access_exceptions x WHERE x.structure_id = s.id AND x.user_id = ${user.id}
                 AND (x.expires_at IS NULL OR x.expires_at > now())))
      ORDER BY s.origin_inventory, s.watershed, s.source_number NULLS LAST, s.code`;
    return { items: rows.map(mapStructure) };
  });

  app.post('/structures', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(structureInput, req.body);
    const created = await sql.begin(async (tx) => {
      const [{ seq }] = await tx`SELECT nextval('structure_code_seq') AS seq`;
      // Formato provisional de código (pendiente de aprobación tras la conciliación): PDC-0001
      const code = `PDC-${String(seq).padStart(4, '0')}`;
      const loc = b.location;
      const [row] = await tx`
        INSERT INTO structures (code, name, aliases, structure_type, material, watershed, origin_inventory,
          source_reference, source_number, geom, location_confidence, location_label, location_method,
          location_source, location_date, location_precision_m, location_crs_original, location_responsible,
          notes, created_by)
        VALUES (${code}, ${b.name}, ${b.aliases}, ${b.structureType}, ${b.material}, ${b.watershed}, ${b.originInventory},
          ${b.sourceReference ?? null}, ${b.sourceNumber ?? null},
          ${loc ? toPoint(loc.lat, loc.lon) : null}::geometry,
          ${loc?.confidence ?? 'provisional'}, ${loc?.label ?? 'Provisional'}, ${loc?.method ?? null},
          ${loc?.source ?? null}, ${loc?.date ?? null}, ${loc?.precisionM ?? null}, ${loc?.crsOriginal ?? null},
          ${loc?.responsible ?? null}, ${b.notes ?? null}, ${user.id})
        RETURNING id`;
      await audit(tx, { actorId: user.id, action: 'crear_estructura', entityType: 'structure', entityId: row.id, after: { code, ...b } });
      // Agregar estructuras puede cambiar Nmax y el ranking relativo: se recalcula y versiona.
      await recalculatePriorities(tx, user.id, `Alta de estructura ${code}`);
      return getStructure(tx, row.id);
    });
    reply.code(201);
    return created;
  });

  app.get('/structures/:id', async (req) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    if (!(await canAccessStructure(sql, user, id))) throw forbidden('Estructura no asignada');
    const s = await getStructure(sql, id);
    if (!s) throw notFound('Estructura no encontrada');
    return s;
  });

  app.patch('/structures/:id', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const b = parse(structureUpdate, req.body);
    return sql.begin(async (tx) => {
      const [before] = await tx`SELECT *, ST_Y(geom) AS lat, ST_X(geom) AS lon FROM structures WHERE id = ${id} FOR UPDATE`;
      if (!before) throw notFound('Estructura no encontrada');
      const loc = b.location;
      await tx`
        UPDATE structures SET
          name = COALESCE(${b.name ?? null}, name),
          aliases = COALESCE(${b.aliases ?? null}, aliases),
          structure_type = COALESCE(${b.structureType ?? null}, structure_type),
          material = COALESCE(${b.material ?? null}, material),
          watershed = COALESCE(${b.watershed ?? null}, watershed),
          source_reference = CASE WHEN ${b.sourceReference !== undefined} THEN ${b.sourceReference ?? null} ELSE source_reference END,
          notes = CASE WHEN ${b.notes !== undefined} THEN ${b.notes ?? null} ELSE notes END,
          physical_status = COALESCE(${b.physicalStatus ?? null}, physical_status),
          reconciliation_status = COALESCE(${b.reconciliationStatus ?? null}, reconciliation_status),
          active = COALESCE(${b.active ?? null}, active),
          geom = CASE WHEN ${loc !== undefined} THEN ${loc ? toPoint(loc.lat, loc.lon) : null}::geometry ELSE geom END,
          location_confidence = CASE WHEN ${!!loc} THEN ${loc?.confidence ?? 'provisional'} ELSE location_confidence END,
          location_label = CASE WHEN ${!!loc} THEN ${loc?.label ?? 'Provisional'} ELSE location_label END,
          location_method = CASE WHEN ${!!loc} THEN ${loc?.method ?? null} ELSE location_method END,
          location_source = CASE WHEN ${!!loc} THEN ${loc?.source ?? null} ELSE location_source END,
          location_date = CASE WHEN ${!!loc} THEN ${loc?.date ?? null}::date ELSE location_date END,
          location_precision_m = CASE WHEN ${!!loc} THEN ${loc?.precisionM ?? null}::numeric ELSE location_precision_m END,
          location_crs_original = CASE WHEN ${!!loc} THEN ${loc?.crsOriginal ?? null} ELSE location_crs_original END,
          location_responsible = CASE WHEN ${!!loc} THEN ${loc?.responsible ?? user.displayName} ELSE location_responsible END
        WHERE id = ${id}`;
      const after = await getStructure(tx, id);
      const { reason, ...changes } = b;
      await audit(tx, {
        actorId: user.id, action: 'editar_estructura', entityType: 'structure', entityId: id,
        before: mapStructure(before), after: { changes, result: after }, reason,
      });
      if (b.active !== undefined && b.active !== before.active) {
        await recalculatePriorities(tx, user.id, `${b.active ? 'Reactivación' : 'Desactivación'} de ${before.code}`);
      }
      return after;
    });
  });

  app.get('/structures/:id/history', async (req) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    if (!(await canAccessStructure(sql, user, id))) throw forbidden('Estructura no asignada');
    const [inspections, interventions, exposures, priorities, urgencies, audits, scenarios] = await Promise.all([
      sql`SELECT i.id, i.inspected_at, i.damage_score, i.clogging_score, i.active_process_score, i.physical_status, i.machinery_access, i.access_obstacles, i.access_notes, ST_Y(i.vehicle_point) AS veh_lat, ST_X(i.vehicle_point) AS veh_lon,
                 i.access_status, i.validation_status, i.data_label, i.source_reference, u.display_name AS inspector_name
            FROM inspections i JOIN users u ON u.id = i.inspector_id WHERE i.structure_id = ${id} ORDER BY i.inspected_at DESC`,
      sql`SELECT * FROM interventions WHERE structure_id = ${id} ORDER BY created_at DESC`,
      sql`SELECT id, method, affected_homes, persons_per_home, estimated_persons, persons_low, persons_high, method_notes,
                 source, data_label, confidence, valid_from, change_reason, created_at
            FROM exposure_estimates WHERE structure_id = ${id} ORDER BY valid_from DESC, created_at DESC`,
      sql`SELECT pc.*, pb.reason FROM priority_calculations pc JOIN priority_batches pb ON pb.id = pc.batch_id
           WHERE pc.structure_id = ${id} ORDER BY pc.calculated_at DESC LIMIT 50`,
      sql`SELECT ur.*, u.display_name AS author FROM urgencies ur JOIN users u ON u.id = ur.created_by
           WHERE ur.structure_id = ${id} ORDER BY ur.created_at DESC`,
      user.role === 'inspector' ? Promise.resolve([]) :
        sql`SELECT a.*, u.display_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
             WHERE a.entity_id = ${id} ORDER BY a.occurred_at DESC LIMIT 100`,
      sql`SELECT id, scenario_type, name, validation_level, data_label, created_at FROM scenarios WHERE structure_id = ${id}`,
    ]);
    return { inspections, interventions, exposures, priorities, urgencies, audits, scenarios };
  });
}
