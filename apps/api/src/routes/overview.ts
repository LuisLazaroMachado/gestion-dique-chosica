import type { FastifyInstance } from 'fastify';
import { sql } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { notFound } from '../errors.js';
import { mapStructure } from '../util.js';

export async function overviewRoutes(app: FastifyInstance) {
  // Tablero del responsable.
  app.get('/dashboard', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const [inv] = await sql`
      SELECT count(*) FILTER (WHERE active) AS total,
             count(*) FILTER (WHERE active AND origin_inventory = 'linea_base_2024') AS linea_base,
             count(*) FILTER (WHERE active AND origin_inventory = 'ampliacion') AS ampliacion,
             count(*) FILTER (WHERE active AND location_label = 'Documentado') AS ubic_documentada,
             count(*) FILTER (WHERE active AND location_label <> 'Documentado') AS ubic_estimada
        FROM structures`;
    const physical = await sql`SELECT physical_status AS status, count(*)::int AS n FROM structures WHERE active GROUP BY 1`;
    const intervention = await sql`SELECT intervention_status AS status, count(*)::int AS n FROM structures WHERE active GROUP BY 1`;
    const [insp] = await sql`
      WITH cfg AS (SELECT (value)::int AS months FROM settings WHERE key = 'inspection_interval_months'),
      last AS (
        SELECT s.id, max(i.inspected_at) AS last_at FROM structures s
          LEFT JOIN inspections i ON i.structure_id = s.id AND i.validation_status = 'Validado'
         WHERE s.active GROUP BY s.id)
      SELECT count(*) FILTER (WHERE last_at IS NOT NULL AND last_at + make_interval(months => cfg.months) > now() + interval '30 days') AS vigentes,
             count(*) FILTER (WHERE last_at IS NOT NULL AND last_at + make_interval(months => cfg.months) BETWEEN now() AND now() + interval '30 days') AS proximas,
             count(*) FILTER (WHERE last_at IS NOT NULL AND last_at + make_interval(months => cfg.months) < now()) AS vencidas,
             count(*) FILTER (WHERE last_at IS NULL) AS sin_inspeccion
        FROM last, cfg`;
    const [pending] = await sql`SELECT count(*)::int AS n FROM inspections WHERE validation_status = 'Enviado'`;
    const [assign] = await sql`SELECT count(*)::int AS n FROM assignments WHERE status IN ('asignada','en_curso')`;
    const [batch] = await sql`SELECT id, calculated_at, n_max, inventory_count, warnings FROM priority_batches ORDER BY calculated_at DESC LIMIT 1`;
    const top = batch ? await sql`
      SELECT pc.structure_id, s.code, s.name, s.watershed, pc.p, pc.e, pc.x, pc.warnings
        FROM priority_calculations pc JOIN structures s ON s.id = pc.structure_id
       WHERE pc.batch_id = ${batch.id} ORDER BY pc.p DESC LIMIT 10` : [];
    const byWatershed = await sql`
      SELECT watershed, origin_inventory, count(*)::int AS n,
             count(*) FILTER (WHERE physical_status = 'Crítico')::int AS criticos
        FROM structures WHERE active GROUP BY 1, 2 ORDER BY 2, 1`;
    return { inventory: inv, physical, intervention, inspections: insp, pendingReview: pending.n,
      openAssignments: assign.n, latestBatch: batch ?? null, top, byWatershed };
  });

  // Capas del mapa en GeoJSON.
  app.get('/map/structures.geojson', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const rows = await sql`
      SELECT s.*, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon,
             pc.p, ur.level AS urgency
        FROM structures s
        LEFT JOIN LATERAL (SELECT p FROM priority_calculations x WHERE x.structure_id = s.id
                            AND x.batch_id = (SELECT id FROM priority_batches ORDER BY calculated_at DESC LIMIT 1)) pc ON true
        LEFT JOIN LATERAL (SELECT level FROM urgencies u WHERE u.structure_id = s.id ORDER BY created_at DESC LIMIT 1) ur ON true
       WHERE s.active AND s.geom IS NOT NULL`;
    return {
      type: 'FeatureCollection',
      features: rows.map((r) => {
        const s = mapStructure(r);
        return {
          type: 'Feature', id: s.id,
          geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
          properties: {
            id: s.id, code: s.code, name: s.name, watershed: s.watershed, structureType: s.structureType,
            physicalStatus: s.physicalStatus, interventionStatus: s.interventionStatus, originInventory: s.originInventory,
            locationLabel: s.location?.label, locationConfidence: s.location?.confidence, p: r.p ?? null, urgency: r.urgency ?? null,
          },
        };
      }),
    };
  });

  app.get('/map/exposure.geojson', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const rows = await sql`
      SELECT DISTINCT ON (e.structure_id) e.structure_id, s.code, e.estimated_persons, e.data_label, e.confidence,
             ST_AsGeoJSON(e.polygon, 6)::json AS geom
        FROM exposure_estimates e JOIN structures s ON s.id = e.structure_id
       WHERE e.polygon IS NOT NULL AND s.active
       ORDER BY e.structure_id, e.valid_from DESC, e.created_at DESC`;
    return { type: 'FeatureCollection', features: rows.map((r) => ({
      type: 'Feature', geometry: r.geom,
      properties: { structureId: r.structure_id, code: r.code, n: r.estimated_persons, label: r.data_label, confidence: r.confidence },
    })) };
  });

  app.get('/map/reference.geojson', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const rows = await sql`SELECT id, layer, name, properties, data_label, source, ST_AsGeoJSON(geom, 6)::json AS geom
                             FROM reference_features ORDER BY layer, name`;
    return { type: 'FeatureCollection', features: rows.map((r) => ({
      type: 'Feature', id: r.id, geometry: r.geom,
      properties: { ...r.properties, layer: r.layer, name: r.name, label: r.data_label, source: r.source },
    })) };
  });

  // Escenarios de simulación nivel A (visualizador geográfico; no es predicción hidráulica).
  app.get('/scenarios', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const q = req.query as { structureId?: string };
    const rows = await sql`
      SELECT sc.id, sc.structure_id, s.code, s.name AS structure_name, sc.scenario_type, sc.name, sc.parameters,
             sc.engine_version, sc.validation_level, sc.data_label, sc.limitations, sc.sources, sc.created_at,
             ST_AsGeoJSON(sc.corridor, 6)::json AS corridor, ST_AsGeoJSON(sc.zone, 6)::json AS zone
        FROM scenarios sc JOIN structures s ON s.id = sc.structure_id
       WHERE (${q.structureId ?? null}::uuid IS NULL OR sc.structure_id = ${q.structureId ?? null})
       ORDER BY s.code, sc.scenario_type`;
    return { label: 'Escenario hipotético — no es alerta oficial', items: rows };
  });

  app.get('/scenarios/:id', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const [r] = await sql`
      SELECT sc.*, s.code, ST_AsGeoJSON(sc.corridor, 6)::json AS corridor_geojson, ST_AsGeoJSON(sc.zone, 6)::json AS zone_geojson
        FROM scenarios sc JOIN structures s ON s.id = sc.structure_id WHERE sc.id = ${id}`;
    if (!r) throw notFound();
    return r;
  });

  // Paquete inicial para la app móvil: asignaciones activas, sus estructuras e historial resumido.
  app.get('/sync/bootstrap', async (req) => {
    const user = await authenticate(req);
    const assignments = await sql`
      SELECT a.id, a.structure_id, a.due_at, a.instructions, a.status, a.assigned_at, ub.display_name AS assigned_by_name
        FROM assignments a JOIN users ub ON ub.id = a.assigned_by
       WHERE a.inspector_id = ${user.id} AND a.status IN ('asignada','en_curso') ORDER BY a.due_at NULLS LAST, a.assigned_at`;
    const ids = [...new Set(assignments.map((a) => a.structure_id))];
    const exc = await sql`SELECT structure_id FROM access_exceptions WHERE user_id = ${user.id} AND (expires_at IS NULL OR expires_at > now())`;
    for (const e of exc) if (!ids.includes(e.structure_id)) ids.push(e.structure_id);
    const structures = ids.length ? await sql`
      SELECT s.*, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon FROM structures s WHERE s.id = ANY(${ids})` : [];
    const history = ids.length ? await sql`
      SELECT DISTINCT ON (structure_id) structure_id, inspected_at, damage_score, clogging_score, active_process_score,
             physical_status, access_status, validation_status, data_label
        FROM inspections WHERE structure_id = ANY(${ids}) ORDER BY structure_id, inspected_at DESC` : [];
    const myRecent = await sql`
      SELECT id, structure_id, device_record_id, validation_status, validation_notes, inspected_at
        FROM inspections WHERE inspector_id = ${user.id} ORDER BY created_at DESC LIMIT 50`;
    return {
      serverTime: new Date().toISOString(), user,
      assignments: assignments.map((a) => ({ id: a.id, structureId: a.structure_id, dueAt: a.due_at, instructions: a.instructions,
        status: a.status, assignedAt: a.assigned_at, assignedByName: a.assigned_by_name })),
      structures: structures.map(mapStructure),
      lastInspections: history,
      myRecentInspections: myRecent,
    };
  });
}
