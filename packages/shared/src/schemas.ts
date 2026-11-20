import { z } from 'zod';
import {
  ACCESS_STATUSES, EVIDENCE_TYPES, INTERVENTION_STATUSES, LOCATION_CONFIDENCE, MATERIALS,
  PHYSICAL_STATUSES, ROLES, STRUCTURE_TYPES, URGENCY_LEVELS,
} from './constants.js';

const score = z.number().int().min(0).max(3).nullable();
const isoDateTime = z.string().datetime({ offset: true });

// ───────────── Inspección ─────────────
export const inspectionInput = z
  .object({
    structureId: z.string().uuid(),
    assignmentId: z.string().uuid().nullable().optional(),
    deviceRecordId: z.string().uuid().optional(),
    inspectedAt: isoDateTime,
    verifierName: z.string().trim().max(200).nullable().optional(),
    verifierRole: z.string().trim().max(200).nullable().optional(),
    damageScore: score,
    cloggingScore: score,
    activeProcessScore: score,
    physicalStatus: z.enum(PHYSICAL_STATUSES),
    accessStatus: z.enum(ACCESS_STATUSES),
    accessNotes: z.string().trim().max(2000).nullable().optional(),
    observations: z.string().trim().max(5000).nullable().optional(),
    undeterminedReasons: z.record(z.string(), z.string().trim().min(1)).optional().default({}),
    deviceLocation: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        accuracyM: z.number().nonnegative().optional(),
        mock: z.boolean().optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.accessStatus === 'Difícil' || v.accessStatus === 'Restringido') && !v.accessNotes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['accessNotes'],
        message: 'Describa la causa de la dificultad o restricción de acceso.',
      });
    }
    const fields = [['D', 'damageScore'], ['C', 'cloggingScore'], ['A', 'activeProcessScore']] as const;
    for (const [k, field] of fields) {
      if (v[field] === null && !v.undeterminedReasons?.[k]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom, path: [field],
          message: `Si ${k} queda sin registrar, indique el motivo (la prioridad no se calculará).`,
        });
      }
    }
  });
export type InspectionInput = z.infer<typeof inspectionInput>;

export const inspectionCorrection = z.object({
  reason: z.string().trim().min(3, 'Indique el motivo de la corrección'),
  changes: z
    .object({
      damageScore: score.optional(),
      cloggingScore: score.optional(),
      activeProcessScore: score.optional(),
      physicalStatus: z.enum(PHYSICAL_STATUSES).optional(),
      accessStatus: z.enum(ACCESS_STATUSES).optional(),
      accessNotes: z.string().nullable().optional(),
      observations: z.string().nullable().optional(),
      verifierName: z.string().nullable().optional(),
      undeterminedReasons: z.record(z.string(), z.string()).optional(),
    })
    .refine((c) => Object.keys(c).length > 0, 'No hay cambios'),
});

export const validationInput = z
  .object({
    decision: z.enum(['Validado', 'Observado']),
    notes: z.string().trim().nullable().optional(),
  })
  .refine((v) => v.decision === 'Validado' || (v.notes && v.notes.length > 2), {
    message: 'Para observar una inspección indique el motivo', path: ['notes'],
  });

// ───────────── Estructura ─────────────
export const locationInput = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  confidence: z.enum(LOCATION_CONFIDENCE),
  label: z.enum(['Documentado', 'Estimado', 'Provisional', 'Demostración']),
  method: z.string().trim().min(2),
  source: z.string().trim().min(2),
  date: z.string().date().optional(),
  precisionM: z.number().nonnegative().optional(),
  crsOriginal: z.string().optional(),
  responsible: z.string().optional(),
});

export const structureInput = z.object({
  name: z.string().trim().min(2),
  aliases: z.array(z.string().trim()).optional().default([]),
  structureType: z.enum(STRUCTURE_TYPES),
  material: z.enum(MATERIALS).optional().default('por_verificar'),
  watershed: z.string().trim().min(2),
  originInventory: z.enum(['linea_base_2024', 'ampliacion']),
  sourceReference: z.string().trim().nullable().optional(),
  sourceNumber: z.number().int().positive().nullable().optional(),
  location: locationInput.nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const structureUpdate = z.object({
  reason: z.string().trim().min(3, 'Indique el motivo del cambio'),
  name: z.string().trim().min(2).optional(),
  aliases: z.array(z.string().trim()).optional(),
  structureType: z.enum(STRUCTURE_TYPES).optional(),
  material: z.enum(MATERIALS).optional(),
  watershed: z.string().trim().min(2).optional(),
  sourceReference: z.string().trim().nullable().optional(),
  location: locationInput.nullable().optional(),
  notes: z.string().nullable().optional(),
  physicalStatus: z.enum(PHYSICAL_STATUSES).optional(),
  reconciliationStatus: z
    .enum(['por_conciliar', 'individualizado', 'verificado_campo', 'duplicado', 'descartado'])
    .optional(),
  active: z.boolean().optional(),
});

// ───────────── Exposición ─────────────
export const exposureInput = z
  .object({
    structureId: z.string().uuid(),
    method: z.enum(['VxH', 'dato_oficial']),
    affectedHomes: z.number().nonnegative().nullable().optional(),
    personsPerHome: z.number().nonnegative().nullable().optional(),
    estimatedPersons: z.number().nonnegative().optional(),
    personsLow: z.number().nonnegative().nullable().optional(),
    personsHigh: z.number().nonnegative().nullable().optional(),
    methodNotes: z.string().trim().min(3),
    source: z.string().trim().min(2),
    dataLabel: z.enum(['Documentado', 'Estimado', 'Demostración']),
    confidence: z.enum(['alta', 'media', 'baja']),
    validFrom: z.string().date(),
    changeReason: z.string().trim().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.method === 'VxH' && (v.affectedHomes == null || v.personsPerHome == null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['affectedHomes'], message: 'El método V×H requiere V y H.' });
    }
    if (v.method === 'dato_oficial' && v.estimatedPersons == null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['estimatedPersons'], message: 'Indique N del dato oficial.' });
    }
  });

// ───────────── Asignaciones, intervenciones, urgencia, rutas ─────────────
export const assignmentInput = z.object({
  structureIds: z.array(z.string().uuid()).min(1),
  inspectorId: z.string().uuid(),
  dueAt: isoDateTime.nullable().optional(),
  instructions: z.string().trim().nullable().optional(),
});

export const accessExceptionInput = z.object({
  structureId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().trim().min(3),
  expiresAt: isoDateTime.nullable().optional(),
});

const interventionStatus = z.enum(INTERVENTION_STATUSES).exclude(['Sin intervención']);

export const interventionInput = z.object({
  structureId: z.string().uuid(),
  interventionType: z.string().trim().min(2),
  description: z.string().trim().nullable().optional(),
  status: interventionStatus.optional().default('Pendiente'),
  assignedTeam: z.string().trim().nullable().optional(),
  machinery: z.string().trim().nullable().optional(),
  plannedStart: isoDateTime.nullable().optional(),
  plannedEnd: isoDateTime.nullable().optional(),
});

export const interventionUpdate = z.object({
  reason: z.string().trim().min(3, 'Indique el motivo del cambio'),
  status: interventionStatus.optional(),
  description: z.string().nullable().optional(),
  assignedTeam: z.string().nullable().optional(),
  machinery: z.string().nullable().optional(),
  plannedStart: isoDateTime.nullable().optional(),
  plannedEnd: isoDateTime.nullable().optional(),
  actualStart: isoDateTime.nullable().optional(),
  actualEnd: isoDateTime.nullable().optional(),
  verificationNotes: z.string().nullable().optional(),
});

export const urgencyInput = z.object({
  structureId: z.string().uuid(),
  level: z.enum(URGENCY_LEVELS),
  justification: z.string().trim().min(3, 'La urgencia debe justificarse'),
});

export const priorityDecisionInput = z.object({
  structureIds: z.array(z.string().uuid()).min(1),
  decision: z.string().trim().min(3),
  justification: z.string().trim().min(3, 'Justifique la decisión'),
});

export const routeInput = z.object({
  name: z.string().trim().min(2),
  structureIds: z.array(z.string().uuid()).min(1).max(30),
  machinery: z.string().trim().nullable().optional(),
});

export const routeReorder = z.object({
  structureIdsFinal: z.array(z.string().uuid()).min(1),
  justification: z.string().trim().min(3, 'Justifique el cambio de orden'),
});

// ───────────── Usuarios ─────────────
export const userInput = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2),
  role: z.enum(ROLES),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  canInspect: z.boolean().optional(),
  canViewAll: z.boolean().optional(),
});

export const userUpdate = z.object({
  displayName: z.string().trim().min(2).optional(),
  role: z.enum(ROLES).optional(),
  password: z.string().min(8).optional(),
  canInspect: z.boolean().optional(),
  canViewAll: z.boolean().optional(),
  active: z.boolean().optional(),
  reason: z.string().trim().min(3),
});

// ───────────── Evidencias ─────────────
export const evidenceMeta = z
  .object({
    structureId: z.string().uuid(),
    inspectionId: z.string().uuid().nullable().optional(),
    interventionId: z.string().uuid().nullable().optional(),
    evidenceType: z.enum(EVIDENCE_TYPES),
    contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
    sizeBytes: z.number().int().positive().max(15 * 1024 * 1024),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    capturedAt: isoDateTime.optional(),
    deviceRecordId: z.string().uuid().optional(),
    location: z.object({ lat: z.number(), lon: z.number(), mock: z.boolean().optional() }).nullable().optional(),
  })
  .refine((v) => v.inspectionId || v.interventionId || v.evidenceType === 'documento', {
    message: 'La evidencia debe vincularse a una inspección o intervención',
  });
