// Catálogos aprobados (docs/especificacion/00_TRANSFERENCIA/02_DECISIONES_APROBADAS.md).
// Cambiarlos requiere autorización expresa y actualizar el registro de decisiones.

export const PHYSICAL_STATUSES = ['Operativo', 'Deteriorado', 'Crítico', 'En evaluación'] as const;
export type PhysicalStatus = (typeof PHYSICAL_STATUSES)[number];

export const INTERVENTION_STATUSES = [
  'Sin intervención', 'Pendiente', 'Programada', 'En ejecución', 'Finalizada', 'Verificada', 'Observada',
] as const;
export type InterventionStatus = (typeof INTERVENTION_STATUSES)[number];

export const ACCESS_STATUSES = ['Sin observación', 'Difícil', 'Restringido', 'No determinado'] as const;
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

export const VALIDATION_STATUSES = ['Enviado', 'Validado', 'Observado'] as const;
export type ValidationStatus = (typeof VALIDATION_STATUSES)[number];

export const ROLES = ['inspector', 'planner', 'admin'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  inspector: 'Inspector',
  planner: 'Responsable de planificación',
  admin: 'Administrador',
};

export const STRUCTURE_TYPES = ['dique_transversal', 'barrera_dinamica', 'muro_encauzamiento', 'otro'] as const;
export type StructureType = (typeof STRUCTURE_TYPES)[number];
export const STRUCTURE_TYPE_LABELS: Record<StructureType, string> = {
  dique_transversal: 'Dique transversal',
  barrera_dinamica: 'Barrera (malla) dinámica',
  muro_encauzamiento: 'Muro de encauzamiento',
  otro: 'Otro',
};

export const MATERIALS = ['concreto', 'mamposteria', 'gaviones', 'malla_metalica', 'otro', 'por_verificar'] as const;
export type Material = (typeof MATERIALS)[number];
export const MATERIAL_LABELS: Record<Material, string> = {
  concreto: 'Concreto',
  mamposteria: 'Mampostería',
  gaviones: 'Gaviones',
  malla_metalica: 'Malla metálica',
  otro: 'Otro',
  por_verificar: 'Por verificar',
};

export const EVIDENCE_TYPES = [
  'general', 'colmatacion', 'dano', 'proceso', 'acceso', 'intervencion_antes', 'intervencion_despues', 'documento',
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  general: 'Vista general',
  colmatacion: 'Cauce / colmatación',
  dano: 'Daño',
  proceso: 'Proceso activo (ladera/cauce)',
  acceso: 'Acceso',
  intervencion_antes: 'Intervención — antes',
  intervencion_despues: 'Intervención — después',
  documento: 'Documento',
};

export const URGENCY_LEVELS = ['Normal', 'Atención', 'Urgente'] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];

export const LOCATION_CONFIDENCE = ['verificada', 'aproximada', 'provisional'] as const;
export type LocationConfidence = (typeof LOCATION_CONFIDENCE)[number];

export const DATA_LABELS = ['Documentado', 'Estimado', 'Provisional', 'Demostración', 'Hipotético'] as const;
export type DataLabel = (typeof DATA_LABELS)[number];

/** Descriptores 0–3 del manual de inspección (marco operativo inicial; requiere validación por tipología). */
export const SCALE_DESCRIPTORS = {
  D: [
    'Sin daño relevante observable',
    'Deterioro superficial o daño menor localizado',
    'Daño significativo, deformación, desplazamiento o pérdida parcial de componentes',
    'Rotura, colapso o pérdida importante de continuidad/estabilidad aparente',
  ],
  C: [
    'Sin acumulación significativa',
    'Acumulación menor; capacidad aparente mayormente disponible',
    'Acumulación importante que reduce sección/capacidad',
    'Colmatación severa o casi total del espacio funcional observado',
  ],
  A: [
    'Sin evidencia observable de proceso activo',
    'Indicios menores/localizados de erosión, socavación o desprendimiento',
    'Proceso claramente activo o progresivo con afectación relevante',
    'Proceso severo/progresivo con amenaza inmediata aparente',
  ],
} as const;

export const SCALE_NAMES = { D: 'Daño estructural', C: 'Colmatación', A: 'Proceso activo' } as const;

export const SCENARIO_LABEL = 'Escenario hipotético — no es alerta oficial';
