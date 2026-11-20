import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Group, Loader, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { api } from '../api';
import { fmtDateTime } from '../components/Labels';
import { PageHeader } from '../components/Help';

// Frases legibles para cada acción registrada.
const ACTIONS: Record<string, { text: string; color: string }> = {
  iniciar_sesion: { text: 'inició sesión', color: 'gray' },
  crear_estructura: { text: 'registró la estructura', color: 'teal' },
  editar_estructura: { text: 'modificó la estructura', color: 'blue' },
  actualizar_estado_fisico: { text: 'actualizó el estado de', color: 'blue' },
  actualizar_estado_intervencion: { text: 'actualizó la situación de trabajos de', color: 'blue' },
  asignar: { text: 'encargó inspeccionar', color: 'cyan' },
  cambiar_estado_asignacion: { text: 'cambió el encargo de', color: 'cyan' },
  registrar_excepcion: { text: 'dio permiso especial para', color: 'cyan' },
  registrar_inspeccion: { text: 'envió una inspección de', color: 'indigo' },
  corregir_inspeccion: { text: 'corrigió una inspección de', color: 'orange' },
  validar_inspeccion: { text: 'aprobó una inspección de', color: 'green' },
  observar_inspeccion: { text: 'devolvió con observación una inspección de', color: 'orange' },
  cargar_evidencia: { text: 'subió una foto', color: 'gray' },
  registrar_exposicion: { text: 'actualizó las personas expuestas de', color: 'violet' },
  recalcular_prioridad: { text: 'actualizó las prioridades', color: 'grape' },
  decision_prioridad: { text: 'registró una decisión de prioridad', color: 'grape' },
  registrar_urgencia: { text: 'marcó la urgencia de', color: 'red' },
  crear_intervencion: { text: 'registró un trabajo en', color: 'teal' },
  editar_intervencion: { text: 'actualizó un trabajo en', color: 'blue' },
  calcular_ruta: { text: 'calculó el recorrido', color: 'yellow' },
  editar_orden_ruta: { text: 'cambió el orden del recorrido', color: 'yellow' },
  crear_usuario: { text: 'creó la cuenta de', color: 'teal' },
  editar_usuario: { text: 'modificó la cuenta de', color: 'blue' },
  editar_configuracion: { text: 'cambió la configuración', color: 'blue' },
  carga_inicial: { text: 'cargó el inventario inicial', color: 'gray' },
};

const FIELD_NAMES: Record<string, string> = {
  name: 'Nombre', physical_status: 'Estado', intervention_status: 'Trabajos', validation_status: 'Revisión', status: 'Situación',
  damage_score: 'Daño', clogging_score: 'Material acumulado', active_process_score: 'Erosión', access_status: 'Acceso',
  observations: 'Observaciones', active: 'Activo', role: 'Rol', displayName: 'Nombre', order: 'Orden', value: 'Valor',
  estimatedPersons: 'Personas expuestas', machinery: 'Maquinaria', level: 'Nivel', justification: 'Justificación',
};

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return 'vacío';
  if (typeof v === 'boolean') return v ? 'sí' : 'no';
  if (Array.isArray(v)) return `${v.length} elementos`;
  if (typeof v === 'object') return '(datos)';
  const s = String(v);
  return s.length > 60 ? s.slice(0, 57) + '...' : s;
};

/** Lista de cambios "Campo: antes → después" comparando ambos registros. */
function changes(before: any, after: any): string[] {
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object') return [];
  const src = after.changes && typeof after.changes === 'object' ? after.changes : after;
  const out: string[] = [];
  for (const k of Object.keys(src)) {
    if (!(k in FIELD_NAMES)) continue;
    const b = before[k]; const a = src[k];
    if (JSON.stringify(b) !== JSON.stringify(a) && b !== undefined) out.push(`${FIELD_NAMES[k]}: ${show(b)} → ${show(a)}`);
  }
  return out.slice(0, 6);
}

export function AuditPage() {
  const [entity, setEntity] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const q = useQuery({ queryKey: ['audit', entity], queryFn: () => api(`/audit?limit=500${entity ? `&entityType=${entity}` : ''}`) });
  const items = (q.data?.items ?? []).filter((a: any) =>
    !search || `${a.actor_name ?? ''} ${a.entity_label ?? ''} ${a.reason ?? ''}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <Stack>
      <PageHeader title="Historial de cambios"
        description="Registro de todo lo que se hace en el sistema: quién lo hizo, cuándo y por qué. No se puede modificar ni borrar, así cada decisión queda respaldada." />
      <Group>
        <Select placeholder="¿Qué tipo de cambio?" clearable value={entity} onChange={setEntity} w={260} data={[
          { value: 'structure', label: 'Estructuras' }, { value: 'inspection', label: 'Inspecciones' }, { value: 'assignment', label: 'Encargos' },
          { value: 'intervention', label: 'Trabajos' }, { value: 'exposure', label: 'Personas expuestas' }, { value: 'priority_batch', label: 'Prioridades' },
          { value: 'urgency', label: 'Urgencias' }, { value: 'route', label: 'Recorridos' }, { value: 'user', label: 'Cuentas de usuario' },
          { value: 'setting', label: 'Configuración' }]} />
        <TextInput placeholder="Buscar persona, código o motivo" value={search} onChange={(e) => setSearch(e.currentTarget.value)} w={280} />
      </Group>
      {q.isLoading ? <Loader /> : (
        <Stack gap={6}>
          {items.map((a: any) => {
            const act = ACTIONS[a.action] ?? { text: a.action.replace(/_/g, ' '), color: 'gray' };
            const diff = changes(a.before_data, a.after_data);
            return (
              <Paper key={a.id} withBorder p="sm">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div>
                    <Text size="sm">
                      <b>{a.actor_name ?? 'El sistema'}</b>{a.actor_code ? ` (${a.actor_code})` : ''} {act.text}{a.entity_label ? <> <b>{a.entity_label}</b></> : null}
                    </Text>
                    {diff.length > 0 && diff.map((d) => <Text key={d} size="xs" c="dimmed">{d}</Text>)}
                    {a.reason && <Text size="xs" mt={2}>Motivo: {a.reason}</Text>}
                  </div>
                  <Stack gap={2} align="flex-end">
                    <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.occurred_at)}</Text>
                    <Badge size="xs" variant="light" color={act.color}>{act.text.split(' ')[0]}</Badge>
                  </Stack>
                </Group>
              </Paper>
            );
          })}
          {items.length === 0 && <Text c="dimmed">No hay cambios que coincidan.</Text>}
        </Stack>
      )}
    </Stack>
  );
}
