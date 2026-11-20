// Catálogos aprobados. Mantener sincronizado con packages/shared/src/constants.ts
// (la app móvil es un proyecto independiente para no mezclar versiones de React con la web).
export const PHYSICAL_STATUSES = ['Operativo', 'Deteriorado', 'Crítico', 'En evaluación'] as const;
export const ACCESS_STATUSES = ['Sin observación', 'Difícil', 'Restringido', 'No determinado'] as const;

export const SCALE_NAMES = { D: 'Daño estructural', C: 'Colmatación', A: 'Proceso activo' } as const;
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

export const PHOTO_TYPES = [
  { value: 'general', label: 'Vista general', hint: 'Obligatoria en toda inspección' },
  { value: 'colmatacion', label: 'Cauce / colmatación', hint: 'Cuando sea visible y seguro' },
  { value: 'dano', label: 'Daño', hint: 'Si se registra daño (D ≥ 1)' },
  { value: 'proceso', label: 'Ladera / cauce', hint: 'Si hay proceso activo (A ≥ 1)' },
  { value: 'acceso', label: 'Acceso', hint: 'Si el acceso es difícil o restringido (máx. 3)' },
] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number]['value'];

export const SAFETY_RULES = [
  'No inspeccionar con lluvia, crecida, flujo activo o peligro.',
  'No ingresar al cauce activo ni acercarse a bordes o estructuras inestables.',
  'Trabajar acompañado, de día y con el EPP definido.',
  'Si cambian las condiciones, suspender: la seguridad prevalece.',
  'No acercarse a confirmar un daño si implica riesgo; registrar "No determinado" con el motivo.',
];
