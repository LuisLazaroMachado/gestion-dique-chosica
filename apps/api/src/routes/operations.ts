import type { FastifyInstance } from 'fastify';
import { interventionInput, interventionUpdate, routeInput, routeReorder } from '@dique/shared';
import { sql, type Db } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, notFound } from '../errors.js';
import { parse, toPoint } from '../util.js';
import { optimizeRoute, routeInOrder, type Pt } from '../services/routing.js';
import { z } from 'zod';

// Intervenciones y rutas: planificación operativa del responsable.

async function syncInterventionStatus(db: Db, structureId: string, actorId: string) {
  // El estado de intervención de la estructura refleja su intervención más reciente.
  // Es independiente del estado físico: "Finalizada" NO convierte la estructura en "Operativo".
  const [last] = await db`SELECT status FROM interventions WHERE structure_id = ${structureId} ORDER BY created_at DESC LIMIT 1`;
  const status = last?.status ?? 'Sin intervención';
  const [s] = await db`SELECT intervention_status FROM structures WHERE id = ${structureId}`;
  if (s && s.intervention_status !== status) {
    await db`UPDATE structures SET intervention_status = ${status} WHERE id = ${structureId}`;
    await audit(db, { actorId, action: 'actualizar_estado_intervencion', entityType: 'structure', entityId: structureId,
      before: { intervention_status: s.intervention_status }, after: { intervention_status: status } });
  }
}

function mapRoute(r: Record<string, any>) {
  return {
    id: r.id, name: r.name, baseName: r.base_name, base: { lat: r.base_lat, lon: r.base_lon }, machinery: r.machinery,
    structureIdsCalc: r.structure_ids_calc, structureIdsFinal: r.structure_ids_final, editJustification: r.edit_justification,
    geometry: r.geojson, distanceM: r.distance_m, durationS: r.duration_s, provider: r.provider, providerProfile: r.provider_profile,
    warnings: r.warnings, createdBy: r.created_by_name, createdAt: r.created_at,
  };
}

async function getBase(db: Db): Promise<{ name: string; lat: number; lon: number }> {
  const [row] = await db`SELECT value FROM settings WHERE key = 'base_central'`;
  const v = row?.value as { name: string; lat: number | null; lon: number | null } | undefined;
  if (!v || v.lat == null || v.lon == null) throw badRequest('Configure la base central (Configuración) antes de calcular rutas');
  return { name: v.name, lat: v.lat, lon: v.lon };
}

export async function operationsRoutes(app: FastifyInstance) {
  // ───── Intervenciones ─────
  app.get('/interventions', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const q = req.query as { structureId?: string; status?: string };
    const rows = await sql`
      SELECT i.*, s.code AS structure_code, s.name AS structure_name, s.physical_status, u.display_name AS created_by_name
        FROM interventions i JOIN structures s ON s.id = i.structure_id JOIN users u ON u.id = i.created_by
       WHERE (${q.structureId ?? null}::uuid IS NULL OR i.structure_id = ${q.structureId ?? null})
         AND (${q.status ?? null}::text IS NULL OR i.status = ${q.status ?? null})
       ORDER BY i.created_at DESC`;
    return { items: rows };
  });

  app.post('/interventions', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(interventionInput, req.body);
    const row = await sql.begin(async (tx) => {
      const [r] = await tx`
        INSERT INTO interventions (structure_id, intervention_type, description, status, assigned_team, machinery,
          planned_start, planned_end, created_by)
        VALUES (${b.structureId}, ${b.interventionType}, ${b.description ?? null}, ${b.status}, ${b.assignedTeam ?? null},
          ${b.machinery ?? null}, ${b.plannedStart ?? null}, ${b.plannedEnd ?? null}, ${user.id}) RETURNING *`;
      await audit(tx, { actorId: user.id, action: 'crear_intervencion', entityType: 'intervention', entityId: r.id, after: b });
      await syncInterventionStatus(tx, b.structureId, user.id);
      return r;
    });
    reply.code(201);
    return row;
  });

  app.patch('/interventions/:id', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const b = parse(interventionUpdate, req.body);
    return sql.begin(async (tx) => {
      const [before] = await tx`SELECT * FROM interventions WHERE id = ${id} FOR UPDATE`;
      if (!before) throw notFound();
      if (b.status === 'Verificada' && !(b.verificationNotes ?? before.verification_notes)) {
        throw badRequest('Para verificar una intervención registre las notas de verificación');
      }
      const set = (k: keyof typeof b, col: string) => (b[k] !== undefined ? b[k] : before[col]);
      const [after] = await tx`
        UPDATE interventions SET
          status = ${set('status', 'status')}, description = ${set('description', 'description')},
          assigned_team = ${set('assignedTeam', 'assigned_team')}, machinery = ${set('machinery', 'machinery')},
          planned_start = ${set('plannedStart', 'planned_start')}, planned_end = ${set('plannedEnd', 'planned_end')},
          actual_start = ${set('actualStart', 'actual_start')}, actual_end = ${set('actualEnd', 'actual_end')},
          verification_notes = ${set('verificationNotes', 'verification_notes')},
          verified_by = CASE WHEN ${b.status === 'Verificada'} THEN ${user.id}::uuid ELSE verified_by END,
          verified_at = CASE WHEN ${b.status === 'Verificada'} THEN now() ELSE verified_at END,
          updated_at = now()
        WHERE id = ${id} RETURNING *`;
      await audit(tx, { actorId: user.id, action: 'editar_intervencion', entityType: 'intervention', entityId: id,
        before, after, reason: b.reason });
      await syncInterventionStatus(tx, before.structure_id, user.id);
      return after;
    });
  });

  // ───── Rutas ─────
  const ROUTE_SELECT = (db: Db) => db`
    SELECT r.*, ST_Y(r.base_geom) AS base_lat, ST_X(r.base_geom) AS base_lon,
           CASE WHEN r.geom IS NULL THEN NULL ELSE ST_AsGeoJSON(r.geom, 6)::json END AS geojson,
           u.display_name AS created_by_name
      FROM routes r JOIN users u ON u.id = r.created_by`;

  app.get('/routes', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const rows = await sql`${ROUTE_SELECT(sql)} ORDER BY r.created_at DESC LIMIT 50`;
    return { items: rows.map(mapRoute) };
  });

  app.get('/routes/:id', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const [r] = await sql`${ROUTE_SELECT(sql)} WHERE r.id = ${id}`;
    if (!r) throw notFound();
    const history = await sql`SELECT a.occurred_at, a.before_data, a.after_data, a.reason, u.display_name AS actor_name
                               FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
                              WHERE a.entity_type = 'route' AND a.entity_id = ${id} ORDER BY a.occurred_at`;
    return { ...mapRoute(r), history };
  });

  // Carga las estructuras de una ruta y verifica que tengan coordenadas.
  async function loadStops(ids: string[]) {
    const rows = await sql`
      SELECT s.id, s.code, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon, s.location_label,
             (SELECT access_status FROM inspections i WHERE i.structure_id = s.id ORDER BY inspected_at DESC LIMIT 1) AS access_status
        FROM structures s WHERE s.id = ANY(${ids}) AND s.active`;
    if (rows.length !== new Set(ids).size) throw badRequest('Alguna estructura no existe o está inactiva');
    const noGeom = rows.filter((r) => r.lat == null);
    if (noGeom.length) throw badRequest(`Sin ubicación: ${noGeom.map((r) => r.code).join(', ')}`);
    const byId = new Map(rows.map((r) => [r.id as string, r]));
    return { rows, byId, pts: (list: string[]): Pt[] => list.map((i) => ({ id: i, lat: byId.get(i)!.lat, lon: byId.get(i)!.lon })) };
  }

  function routeNotes(rows: Array<Record<string, any>>, providerWarnings: string[]) {
    const notes = [...providerWarnings];
    for (const r of rows) {
      if (r.access_status === 'Difícil' || r.access_status === 'Restringido') notes.push(`${r.code}: el último inspector reportó acceso ${r.access_status.toLowerCase()}. Se incluye igual; revisa cómo llegar.`);
    }
    return notes;
  }

  // Propone el orden más corto desde la base central y lo guarda. El acceso difícil NO excluye estructuras.
  app.post('/routes', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(routeInput, req.body);
    const base = await getBase(sql);
    const { rows, pts } = await loadStops(b.structureIds);
    const basePt: Pt = { id: 'base', lat: base.lat, lon: base.lon };
    const geo = await optimizeRoute(basePt, pts(b.structureIds));
    const warnings = routeNotes(rows, geo.warnings);
    const ids = geo.order.map((p) => p.id);
    const line = `SRID=4326;LINESTRING(${geo.coordinates.map(([x, y]) => `${x} ${y}`).join(',')})`;
    const created = await sql.begin(async (tx) => {
      const [r] = await tx`
        INSERT INTO routes (name, base_name, base_geom, machinery, structure_ids_calc, structure_ids_final, geom,
          distance_m, duration_s, provider, provider_profile, warnings, created_by)
        VALUES (${b.name}, ${base.name}, ${toPoint(base.lat, base.lon)}::geometry, ${b.machinery ?? null}, ${ids}, ${ids},
          ${line}::geometry, ${geo.distanceM}, ${geo.durationS}, ${geo.provider}, ${geo.profile}, ${warnings}, ${user.id})
        RETURNING id`;
      await audit(tx, { actorId: user.id, action: 'calcular_ruta', entityType: 'route', entityId: r.id, after: { ...b, order: ids } });
      const [full] = await tx`${ROUTE_SELECT(tx)} WHERE r.id = ${r.id}`;
      return mapRoute(full);
    });
    reply.code(201);
    return created;
  });

  // Vista previa de un orden (no guarda nada): permite que el mapa se actualice al reordenar.
  app.post('/routes/preview', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const b = parse(z.object({ structureIds: z.array(z.string().uuid()).min(1).max(30) }), req.body);
    const base = await getBase(sql);
    const { rows, pts } = await loadStops(b.structureIds);
    const geo = await routeInOrder({ id: 'base', lat: base.lat, lon: base.lon }, pts(b.structureIds));
    return {
      structureIds: b.structureIds, geometry: { type: 'LineString', coordinates: geo.coordinates },
      distanceM: geo.distanceM, durationS: geo.durationS, provider: geo.provider, warnings: routeNotes(rows, geo.warnings),
    };
  });

  // Guarda el orden final elegido por el responsable: se conserva el orden propuesto y se exige justificación.
  app.patch('/routes/:id/order', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const b = parse(routeReorder, req.body);
    const [r] = await sql`SELECT *, ST_Y(base_geom) AS base_lat, ST_X(base_geom) AS base_lon FROM routes WHERE id = ${id}`;
    if (!r) throw notFound();
    const same = [...b.structureIdsFinal].sort().join() === [...r.structure_ids_calc].sort().join();
    if (!same) throw badRequest('El orden final debe contener las mismas estructuras');
    const { pts } = await loadStops(b.structureIdsFinal);
    const geo = await routeInOrder({ id: 'base', lat: r.base_lat, lon: r.base_lon }, pts(b.structureIdsFinal));
    const line = `SRID=4326;LINESTRING(${geo.coordinates.map(([x, y]) => `${x} ${y}`).join(',')})`;
    return sql.begin(async (tx) => {
      await tx`UPDATE routes SET structure_ids_final = ${b.structureIdsFinal}, edit_justification = ${b.justification},
               geom = ${line}::geometry, distance_m = ${geo.distanceM}, duration_s = ${geo.durationS},
               provider = ${geo.provider}, provider_profile = ${geo.profile} WHERE id = ${id}`;
      await audit(tx, { actorId: user.id, action: 'editar_orden_ruta', entityType: 'route', entityId: id,
        before: { order: r.structure_ids_final }, after: { order: b.structureIdsFinal }, reason: b.justification });
      const [full] = await tx`${ROUTE_SELECT(tx)} WHERE r.id = ${id}`;
      return mapRoute(full);
    });
  });
}
