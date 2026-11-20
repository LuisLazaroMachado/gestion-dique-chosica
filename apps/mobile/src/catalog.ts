// Catálogos aprobados. Mantener sincronizado con packages/shared/src/constants.ts
// (la app móvil es un proyecto independiente para no mezclar versiones de React con la web).
export const PHYSICAL_STATUSES = ['Operativo', 'Deteriorado', 'Crítico', 'En evaluación'] as const;
export const ACCESS_STATUSES = ['Sin observación', 'Difícil', 'Restringido', 'No determinado'] as const;
// Texto visible (el valor guardado sigue siendo el del catálogo aprobado).
export const ACCESS_LABELS: Record<string, string> = { 'Sin observación': 'Sin problemas', 'Difícil': 'Difícil (pendiente, sin camino, obstáculos)', 'Restringido': 'Restringido (cerrado o requiere permiso)', 'No determinado': 'No llegué hasta la estructura' };

// Acceso de maquinaria (aprobado 20-11-2026). Mantener sincronizado con packages/shared/src/constants.ts
export const MACHINERY_ACCESS = ['Sí', 'Solo pequeña', 'No', 'No se sabe'] as const;
export const MACHINERY_ACCESS_LABELS: Record<string, string> = {
  'Sí': 'Sí llega', 'Solo pequeña': 'Solo maquinaria pequeña', 'No': 'No llega', 'No se sabe': 'No se sabe',
};
export const ACCESS_OBSTACLES = [
  { value: 'camino_angosto', label: 'Camino angosto' }, { value: 'pendiente_fuerte', label: 'Pendiente fuerte' },
  { value: 'escaleras', label: 'Escaleras' }, { value: 'sin_camino', label: 'No hay camino' },
  { value: 'cerrado', label: 'Paso cerrado o con portón' }, { value: 'puente_debil', label: 'Puente o alcantarilla débil' },
  { value: 'material_en_camino', label: 'Rocas o material en el camino' }, { value: 'viviendas_cercanas', label: 'Viviendas muy pegadas' },
  { value: 'otro', label: 'Otro' },
] as const;

export const SCALE_NAMES = { D: 'Daño en la estructura', C: 'Material acumulado (colmatación)', A: 'Erosión o deslizamiento activo' } as const;
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
  { value: 'general', label: 'Vista general', hint: 'Obligatoria' },
  { value: 'colmatacion', label: 'Material acumulado', hint: 'Si se ve y es seguro' },
  { value: 'dano', label: 'Daño', hint: 'Si hay daño' },
  { value: 'proceso', label: 'Erosión o deslizamiento', hint: 'Si hay erosión o deslizamiento' },
  { value: 'acceso', label: 'Camino de acceso', hint: 'Si fue difícil llegar (máx. 3)' },
] as const;
export type PhotoType = (typeof PHOTO_TYPES)[number]['value'];

export const SAFETY_RULES = [
  'No inspeccionar con lluvia, crecida, flujo activo o peligro.',
  'No ingresar al cauce activo ni acercarse a bordes o estructuras inestables.',
  'Trabajar acompañado, de día y con el EPP definido.',
  'Si cambian las condiciones, suspender: la seguridad prevalece.',
  'Si confirmar un daño implica riesgo, no te acerques: marca "No se pudo evaluar" y explica por qué.',
];
