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
  barrera_dinamica: 'Malla dinámica',
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
  colmatacion: 'Material acumulado',
  dano: 'Daño',
  proceso: 'Erosión o deslizamiento',
  acceso: 'Camino de acceso',
  intervencion_antes: 'Trabajo: antes',
  intervencion_despues: 'Trabajo: después',
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

export const SCALE_NAMES = { D: 'Daño en la estructura', C: 'Material acumulado (colmatación)', A: 'Erosión o deslizamiento activo' } as const;
export const SCALE_SHORT = { D: 'Daño', C: 'Material acumulado', A: 'Erosión' } as const;

export const SCENARIO_LABEL = 'Escenario hipotético. No es una alerta oficial.';

// ───── Textos visibles en lenguaje simple (los valores guardados no cambian) ─────
export const ACCESS_LABELS: Record<string, string> = {
  'Sin observación': 'Sin problemas', 'Difícil': 'Difícil', 'Restringido': 'Restringido', 'No determinado': 'No llegó hasta la estructura',
};
export const ORIGIN_LABELS: Record<string, string> = {
  linea_base_2024: 'Inventario inicial', ampliacion: 'Agregada después',
};
export const ORIGIN_HELP: Record<string, string> = {
  linea_base_2024: 'Una de las 52 estructuras identificadas por la Contraloría en diciembre de 2024.',
  ampliacion: 'Estructura identificada o construida después del inventario inicial.',
};
/** Qué tan seguro es un dato, en palabras simples. */
export const DATA_LABEL_TEXT: Record<string, string> = {
  Documentado: 'Confirmado', Estimado: 'Aproximado', Provisional: 'Por confirmar', 'Demostración': 'De prueba', 'Hipotético': 'Simulado',
};
export const VALIDATION_LABELS: Record<string, string> = {
  Enviado: 'Por revisar', Validado: 'Aprobada', Observado: 'Devuelta',
};
export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  asignada: 'Por hacer', en_curso: 'En curso', completada: 'Hecha', cancelada: 'Cancelada',
};
