import { Badge, Tooltip } from '@mantine/core';
import { DATA_LABEL_TEXT, MACHINERY_ACCESS_COLORS, MACHINERY_ACCESS_LABELS, ORIGIN_HELP, ORIGIN_LABELS, STRUCTURE_TYPE_LABELS, type StructureType } from '@dique/shared';

// Colores por dimensión. Cada dimensión tiene su propia leyenda (estado físico ≠ intervención ≠ tipo).
export const PHYSICAL_COLORS: Record<string, string> = {
  Operativo: '#2f9e44', Deteriorado: '#f08c00', Crítico: '#e03131', 'En evaluación': '#868e96',
};
export const INTERVENTION_COLORS: Record<string, string> = {
  'Sin intervención': '#adb5bd', Pendiente: '#fab005', Programada: '#4dabf7', 'En ejecución': '#1c7ed6',
  Finalizada: '#7950f2', Verificada: '#2b8a3e', Observada: '#e8590c',
};
export const TYPE_COLORS: Record<string, string> = {
  dique_transversal: '#1971c2', barrera_dinamica: '#ae3ec9', muro_encauzamiento: '#5c940d', otro: '#495057',
};
export const URGENCY_COLORS: Record<string, string> = { Normal: 'gray', 'Atención': 'yellow', Urgente: 'red' };

export function PhysicalBadge({ value }: { value: string }) {
  return <Badge color={PHYSICAL_COLORS[value] ?? 'gray'} variant="filled" radius="sm">{value}</Badge>;
}
export function InterventionBadge({ value }: { value: string }) {
  return <Badge color={INTERVENTION_COLORS[value] ?? 'gray'} variant="light" radius="sm">{value}</Badge>;
}
export function TypeBadge({ value }: { value: string }) {
  return <Badge color={TYPE_COLORS[value] ?? 'gray'} variant="outline" radius="sm">{STRUCTURE_TYPE_LABELS[value as StructureType] ?? value}</Badge>;
}

const LABEL_HELP: Record<string, string> = {
  Documentado: 'Dato confirmado: viene de un documento oficial o de una medición en campo.',
  Estimado: 'Dato aproximado: se calculó con un método, pero aún no se confirmó en campo.',
  Provisional: 'Dato pendiente de confirmar.',
  'Demostración': 'Dato de prueba para mostrar cómo funciona el sistema.',
  'Hipotético': 'Resultado de una simulación, no de algo que ocurrió.',
};
const LABEL_COLORS: Record<string, string> = {
  Documentado: 'teal', Estimado: 'orange', Provisional: 'yellow', 'Demostración': 'grape', 'Hipotético': 'violet',
};
/** Etiqueta de calidad del dato (convención del paquete: Documentado / Estimado / Provisional / Hipotético). */
export function DataLabel({ value, size = 'sm' }: { value: string | null | undefined; size?: 'xs' | 'sm' }) {
  if (!value) return null;
  return (
    <Tooltip label={LABEL_HELP[value] ?? value} withArrow multiline w={260}>
      <Badge size={size} color={LABEL_COLORS[value] ?? 'gray'} variant="dot">{DATA_LABEL_TEXT[value] ?? value}</Badge>
    </Tooltip>
  );
}

export function MachineryBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <Badge variant="outline" color="gray" radius="sm">Maquinaria: sin dato</Badge>;
  return <Badge color={MACHINERY_ACCESS_COLORS[value] ?? 'gray'} variant="filled" radius="sm">Maquinaria: {MACHINERY_ACCESS_LABELS[value] ?? value}</Badge>;
}

export function OriginBadge({ value }: { value: string }) {
  return (
    <Tooltip label={ORIGIN_HELP[value]} withArrow multiline w={260}>
      <Badge size="sm" variant="light" color={value === 'linea_base_2024' ? 'indigo' : 'cyan'}>{ORIGIN_LABELS[value] ?? value}</Badge>
    </Tooltip>
  );
}

// Fechas sin hora (DATE) llegan como medianoche UTC: se muestran en UTC para no restar un día.
const isDateOnly = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) || /T00:00:00(\.000)?Z$/.test(d);
export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-PE', { timeZone: isDateOnly(d) ? 'UTC' : 'America/Lima' }) : '-';
export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' }) : '-';
export const fmt = (n: number | null | undefined, digits = 4) => (n == null ? '-' : Number(n).toFixed(digits));
