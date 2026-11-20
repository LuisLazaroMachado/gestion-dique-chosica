import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors.js';

/** Valida datos de entrada con un esquema zod; responde 400 con el detalle si no cumplen. */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw badRequest('Datos inválidos', r.error.issues.map((i) => ({ campo: i.path.join('.'), mensaje: i.message })));
  }
  return r.data;
}

/** Convierte una fila de estructura (snake_case) al formato de la API. */
export function mapStructure(r: Record<string, any>) {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    aliases: r.aliases,
    structureType: r.structure_type,
    material: r.material,
    watershed: r.watershed,
    originInventory: r.origin_inventory,
    sourceReference: r.source_reference,
    sourceNumber: r.source_number,
    workingId: r.working_id,
    reconciliationStatus: r.reconciliation_status,
    physicalStatus: r.physical_status,
    interventionStatus: r.intervention_status,
    location: r.lat == null ? null : {
      lat: r.lat, lon: r.lon, confidence: r.location_confidence, label: r.location_label,
      method: r.location_method, source: r.location_source, date: r.location_date,
      precisionM: r.location_precision_m, crsOriginal: r.location_crs_original, responsible: r.location_responsible,
    },
    elevationM: r.elevation_m,
    notes: r.notes,
    active: r.active,
    createdAt: r.created_at,
    lastInspectionAt: r.last_inspection_at ?? undefined,
    nextInspectionDue: r.next_inspection_due ?? undefined,
  };
}

export function mapInspection(r: Record<string, any>) {
  return {
    id: r.id, structureId: r.structure_id, structureCode: r.structure_code, structureName: r.structure_name,
    assignmentId: r.assignment_id, inspectorId: r.inspector_id, inspectorName: r.inspector_name,
    verifierName: r.verifier_name, verifierRole: r.verifier_role, inspectedAt: r.inspected_at,
    damageScore: r.damage_score, cloggingScore: r.clogging_score, activeProcessScore: r.active_process_score,
    complete: r.damage_score != null && r.clogging_score != null && r.active_process_score != null,
    physicalStatus: r.physical_status, accessStatus: r.access_status, accessNotes: r.access_notes,
    observations: r.observations, undeterminedReasons: r.undetermined_reasons,
    validationStatus: r.validation_status, validationNotes: r.validation_notes,
    validatedBy: r.validated_by, validatedAt: r.validated_at,
    deviceLocation: r.dev_lat == null ? null : { lat: r.dev_lat, lon: r.dev_lon, mock: r.device_location_mock, accuracyM: r.device_accuracy_m },
    machineryAccess: r.machinery_access ?? null, accessObstacles: r.access_obstacles ?? [],
    vehiclePoint: r.veh_lat == null ? null : { lat: r.veh_lat, lon: r.veh_lon, mock: r.vehicle_point_mock },
    deviceRecordId: r.device_record_id, dataLabel: r.data_label, sourceReference: r.source_reference,
    createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export function toPoint(lat: number, lon: number) {
  return `SRID=4326;POINT(${lon} ${lat})`;
}
