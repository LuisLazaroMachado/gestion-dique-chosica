import type { FastifyInstance } from 'fastify';
import { inspectionCorrection, inspectionInput, validationInput } from '@dique/shared';
import { sql, type Db } from '../db.js';
import { authenticate, canAccessStructure, canRegisterInspection, requireRole } from '../auth.js';
import { audit } from '../audit.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { mapInspection, parse, toPoint } from '../util.js';
import { recalculatePriorities } from '../services/priority.js';

const SELECT = (db: Db) => db`
  SELECT i.*, ST_Y(i.device_location) AS dev_lat, ST_X(i.device_location) AS dev_lon,
         ST_Y(i.vehicle_point) AS veh_lat, ST_X(i.vehicle_point) AS veh_lon,
         s.code AS structure_code, s.name AS structure_name, u.display_name AS inspector_name
    FROM inspections i JOIN structures s ON s.id = i.structure_id JOIN users u ON u.id = i.inspector_id`;

async function getInspection(db: Db, id: string) {
  const [r] = await db`${SELECT(db)} WHERE i.id = ${id}`;
  return r ? mapInspection(r) : null;
}

export async function inspectionRoutes(app: FastifyInstance) {
  app.get('/inspections', async (req) => {
    const user = await authenticate(req);
    const q = req.query as { structureId?: string; validationStatus?: string; limit?: string };
    const onlyMine = user.role === 'inspector';
    const limit = Math.min(Number(q.limit ?? 200), 500);
    const rows = await sql`
      ${SELECT(sql)}
      WHERE (NOT ${onlyMine} OR i.inspector_id = ${user.id})
        AND (${q.structureId ?? null}::uuid IS NULL OR i.structure_id = ${q.structureId ?? null})
        AND (${q.validationStatus ?? null}::text IS NULL OR i.validation_status = ${q.validationStatus ?? null})
      ORDER BY i.inspected_at DESC LIMIT ${limit}`;
    return { items: rows.map(mapInspection) };
  });

  // Registro (y envío) de inspección. Idempotente por deviceRecordId: reenviar no duplica.
  app.post('/inspections', async (req, reply) => {
    const user = await authenticate(req);
    if (!canRegisterInspection(user)) throw forbidden('Su usuario no tiene permiso para inspeccionar');
    const b = parse(inspectionInput, req.body);
    if (b.deviceRecordId) {
      const [dup] = await sql`SELECT id FROM inspections WHERE device_record_id = ${b.deviceRecordId}`;
      if (dup) {
        reply.code(200);
        return { ...(await getInspection(sql, dup.id)), duplicate: true };
      }
    }
    if (!(await canAccessStructure(sql, user, b.structureId))) {
      throw forbidden('La estructura no está asignada a usted ni tiene autorización registrada');
    }
    if (new Date(b.inspectedAt).getTime() > Date.now() + 10 * 60_000) throw badRequest('La fecha de inspección está en el futuro');
    const created = await sql.begin(async (tx) => {
      const loc = b.deviceLocation;
      const [row] = await tx`
        INSERT INTO inspections (structure_id, assignment_id, inspector_id, verifier_name, verifier_role, inspected_at,
          damage_score, clogging_score, active_process_score, physical_status, access_status, access_notes,
          observations, undetermined_reasons, device_location, device_location_mock, device_accuracy_m, device_record_id,
          machinery_access, access_obstacles, vehicle_point, vehicle_point_mock)
        VALUES (${b.structureId}, ${b.assignmentId ?? null}, ${user.id}, ${b.verifierName ?? null}, ${b.verifierRole ?? null},
          ${b.inspectedAt}, ${b.damageScore}, ${b.cloggingScore}, ${b.activeProcessScore}, ${b.physicalStatus},
          ${b.accessStatus}, ${b.accessNotes ?? null}, ${b.observations ?? null}, ${tx.json(b.undeterminedReasons ?? {})},
          ${loc ? toPoint(loc.lat, loc.lon) : null}::geometry, ${loc?.mock ?? null}, ${loc?.accuracyM ?? null},
          ${b.deviceRecordId ?? null}, ${b.machineryAccess ?? null}, ${b.accessObstacles ?? []},
          ${b.vehiclePoint ? toPoint(b.vehiclePoint.lat, b.vehiclePoint.lon) : null}::geometry, ${b.vehiclePoint?.mock ?? null})
        ON CONFLICT (device_record_id) DO NOTHING
        RETURNING id`;
      if (!row) throw conflict('Inspección ya registrada');
      if (b.assignmentId) {
        await tx`UPDATE assignments SET status = 'completada' WHERE id = ${b.assignmentId} AND inspector_id = ${user.id}`;
      }
      await audit(tx, { actorId: user.id, action: 'registrar_inspeccion', entityType: 'inspection', entityId: row.id, after: b });
      return getInspection(tx, row.id);
    });
    reply.code(201);
    return created;
  });

  app.get('/inspections/:id', async (req) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    const i = await getInspection(sql, id);
    if (!i) throw notFound('Inspección no encontrada');
    if (user.role === 'inspector' && i.inspectorId !== user.id) throw forbidden();
    const evidence = await sql`
      SELECT id, evidence_type, content_type, captured_at, upload_status, location_mock FROM evidence
       WHERE inspection_id = ${id} ORDER BY captured_at NULLS LAST, created_at`;
    const corrections = await sql`
      SELECT a.occurred_at, a.before_data, a.after_data, a.reason, u.display_name AS actor_name
        FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       WHERE a.entity_type = 'inspection' AND a.entity_id = ${id} AND a.action = 'corregir_inspeccion'
       ORDER BY a.occurred_at DESC`;
    return { ...i, evidence, corrections };
  });

  // Corrección auditada: guarda antes/después, autor, fecha y motivo.
  app.patch('/inspections/:id', async (req) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    const b = parse(inspectionCorrection, req.body);
    return sql.begin(async (tx) => {
      const [before] = await tx`SELECT * FROM inspections WHERE id = ${id} FOR UPDATE`;
      if (!before) throw notFound('Inspección no encontrada');
      if (user.role === 'inspector' && before.inspector_id !== user.id) throw forbidden('Solo puede corregir sus inspecciones');
      const c = b.changes;
      const next = {
        damage_score: c.damageScore !== undefined ? c.damageScore : before.damage_score,
        clogging_score: c.cloggingScore !== undefined ? c.cloggingScore : before.clogging_score,
        active_process_score: c.activeProcessScore !== undefined ? c.activeProcessScore : before.active_process_score,
        physical_status: c.physicalStatus ?? before.physical_status,
        access_status: c.accessStatus ?? before.access_status,
        access_notes: c.accessNotes !== undefined ? c.accessNotes : before.access_notes,
        observations: c.observations !== undefined ? c.observations : before.observations,
        verifier_name: c.verifierName !== undefined ? c.verifierName : before.verifier_name,
        machinery_access: c.machineryAccess !== undefined ? c.machineryAccess : before.machinery_access,
        access_obstacles: c.accessObstacles ?? before.access_obstacles,
        undetermined_reasons: c.undeterminedReasons ?? before.undetermined_reasons,
      };
      // Si cambia una inspección validada, vuelve a revisión del responsable.
      const revalidate = before.validation_status === 'Validado' && user.role === 'inspector';
      await tx`
        UPDATE inspections SET damage_score = ${next.damage_score}, clogging_score = ${next.clogging_score},
          active_process_score = ${next.active_process_score}, physical_status = ${next.physical_status},
          access_status = ${next.access_status}, access_notes = ${next.access_notes}, observations = ${next.observations},
          verifier_name = ${next.verifier_name}, undetermined_reasons = ${tx.json(next.undetermined_reasons)},
          machinery_access = ${next.machinery_access}, access_obstacles = ${next.access_obstacles},
          validation_status = CASE WHEN ${revalidate} THEN 'Enviado' ELSE validation_status END,
          updated_at = now()
        WHERE id = ${id}`;
      const beforeSubset = Object.fromEntries(Object.keys(next).map((k) => [k, before[k]]));
      await audit(tx, { actorId: user.id, action: 'corregir_inspeccion', entityType: 'inspection', entityId: id,
        before: beforeSubset, after: next, reason: b.reason });
      if (before.validation_status === 'Validado') {
        await recalculatePriorities(tx, user.id, `Corrección de inspección ${id}`);
      }
      return getInspection(tx, id);
    });
  });

  // Validación por el responsable. Al validar, la estructura toma el estado físico observado y se recalcula P.
  app.post('/inspections/:id/validate', async (req) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const b = parse(validationInput, req.body);
    return sql.begin(async (tx) => {
      const [i] = await tx`SELECT * FROM inspections WHERE id = ${id} FOR UPDATE`;
      if (!i) throw notFound('Inspección no encontrada');
      await tx`UPDATE inspections SET validation_status = ${b.decision}, validation_notes = ${b.notes ?? null},
               validated_by = ${user.id}, validated_at = now(), updated_at = now() WHERE id = ${id}`;
      await audit(tx, { actorId: user.id, action: b.decision === 'Validado' ? 'validar_inspeccion' : 'observar_inspeccion',
        entityType: 'inspection', entityId: id, before: { validation_status: i.validation_status },
        after: { validation_status: b.decision }, reason: b.notes ?? null });
      let priority = null;
      if (b.decision === 'Validado') {
        const [latest] = await tx`
          SELECT id FROM inspections WHERE structure_id = ${i.structure_id} AND validation_status = 'Validado'
           ORDER BY inspected_at DESC, created_at DESC LIMIT 1`;
        if (latest?.id === id) {
          const [s] = await tx`SELECT physical_status FROM structures WHERE id = ${i.structure_id}`;
          if (s.physical_status !== i.physical_status) {
            await tx`UPDATE structures SET physical_status = ${i.physical_status} WHERE id = ${i.structure_id}`;
            await audit(tx, { actorId: user.id, action: 'actualizar_estado_fisico', entityType: 'structure', entityId: i.structure_id,
              before: { physical_status: s.physical_status }, after: { physical_status: i.physical_status },
              reason: `Inspección validada ${id}` });
          }
        }
        priority = await recalculatePriorities(tx, user.id, `Validación de inspección ${id}`);
      }
      return { inspection: await getInspection(tx, id), priority };
    });
  });

  // Compatibilidad con el contrato: el envío ocurre al registrar; este endpoint confirma el estado.
  app.post('/inspections/:id/submit', async (req) => {
    const user = await authenticate(req);
    const { id } = req.params as { id: string };
    const i = await getInspection(sql, id);
    if (!i) throw notFound('Inspección no encontrada');
    if (user.role === 'inspector' && i.inspectorId !== user.id) throw forbidden();
    return { id, validationStatus: i.validationStatus };
  });
}
