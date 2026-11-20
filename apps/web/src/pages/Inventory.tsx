import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router-dom';
import { MATERIALS, MATERIAL_LABELS, STRUCTURE_TYPES, STRUCTURE_TYPE_LABELS } from '@dique/shared';
import { api, ApiError, type Structure } from '../api';
import { DataLabel, InterventionBadge, OriginBadge, PhysicalBadge, TypeBadge, fmtDate } from '../components/Labels';

export interface StructureFormValues {
  name: string; structureType: string; material: string; watershed: string; originInventory: string;
  sourceReference: string; lat: number | ''; lon: number | ''; confidence: string; label: string; method: string; source: string;
  precisionM: number | ''; notes: string;
}

export function StructureForm({ initial, onSubmit, busy, withReason }: {
  initial?: Partial<StructureFormValues>; busy?: boolean; withReason?: boolean;
  onSubmit: (v: StructureFormValues, reason: string) => void;
}) {
  const [v, setV] = useState<StructureFormValues>({
    name: '', structureType: 'dique_transversal', material: 'por_verificar', watershed: '', originInventory: 'ampliacion',
    sourceReference: '', lat: '', lon: '', confidence: 'provisional', label: 'Provisional', method: '', source: '', precisionM: '', notes: '',
    ...initial,
  });
  const [reason, setReason] = useState('');
  const set = (k: keyof StructureFormValues) => (val: any) => setV({ ...v, [k]: val?.currentTarget ? val.currentTarget.value : val });
  const hasLoc = v.lat !== '' && v.lon !== '';
  return (
    <Stack component="form" onSubmit={(e) => { e.preventDefault(); onSubmit(v, reason); }}>
      <TextInput label="Nombre" required value={v.name} onChange={set('name')} />
      <SimpleGrid cols={2}>
        <Select label="Tipo" data={STRUCTURE_TYPES.map((t) => ({ value: t, label: STRUCTURE_TYPE_LABELS[t] }))} value={v.structureType} onChange={set('structureType')} />
        <Select label="Material" data={MATERIALS.map((t) => ({ value: t, label: MATERIAL_LABELS[t] }))} value={v.material} onChange={set('material')} />
        <TextInput label="Quebrada / sector" required value={v.watershed} onChange={set('watershed')} />
        <Select label="Origen del inventario" disabled={withReason} value={v.originInventory} onChange={set('originInventory')}
          data={[{ value: 'linea_base_2024', label: 'Línea base 2024 (Contraloría)' }, { value: 'ampliacion', label: 'Ampliación (posterior)' }]} />
      </SimpleGrid>
      <TextInput label="Fuente / referencia documental" value={v.sourceReference} onChange={set('sourceReference')} />
      <Text fw={600} size="sm">Ubicación (WGS84). Toda coordenada requiere fuente, método y confianza.</Text>
      <SimpleGrid cols={3}>
        <NumberInput label="Latitud" decimalScale={6} value={v.lat} onChange={set('lat')} min={-90} max={90} />
        <NumberInput label="Longitud" decimalScale={6} value={v.lon} onChange={set('lon')} min={-180} max={180} />
        <NumberInput label="Precisión (m)" value={v.precisionM} onChange={set('precisionM')} min={0} />
        <Select label="Confianza" data={['verificada', 'aproximada', 'provisional']} value={v.confidence} onChange={set('confidence')} />
        <Select label="Etiqueta del dato" data={['Documentado', 'Estimado', 'Provisional', 'Demostración']} value={v.label} onChange={set('label')} />
        <div />
      </SimpleGrid>
      <SimpleGrid cols={2}>
        <TextInput label="Método (p. ej. GPS en campo)" required={hasLoc} value={v.method} onChange={set('method')} />
        <TextInput label="Fuente de la coordenada" required={hasLoc} value={v.source} onChange={set('source')} />
      </SimpleGrid>
      <Textarea label="Notas" value={v.notes} onChange={set('notes')} autosize minRows={2} />
      {withReason && <TextInput label="Motivo del cambio (obligatorio, queda en auditoría)" required value={reason} onChange={(e) => setReason(e.currentTarget.value)} />}
      <Button type="submit" loading={busy}>Guardar</Button>
    </Stack>
  );
}

export function formToPayload(v: StructureFormValues) {
  const hasLoc = v.lat !== '' && v.lon !== '';
  return {
    name: v.name, structureType: v.structureType, material: v.material, watershed: v.watershed, originInventory: v.originInventory,
    sourceReference: v.sourceReference || null, notes: v.notes || null,
    location: hasLoc ? { lat: Number(v.lat), lon: Number(v.lon), confidence: v.confidence, label: v.label, method: v.method, source: v.source,
      precisionM: v.precisionM === '' ? undefined : Number(v.precisionM), date: new Date().toISOString().slice(0, 10) } : null,
  };
}

export function InventoryPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [watershed, setWatershed] = useState<string | null>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ['structures'], queryFn: () => api<{ items: Structure[] }>('/structures') });
  const create = useMutation({
    mutationFn: (body: unknown) => api('/structures', { body }),
    onSuccess: (s: Structure) => {
      notifications.show({ color: 'green', message: `Estructura ${s.code} creada. La prioridad del inventario se recalculó.` });
      setCreating(false); qc.invalidateQueries();
    },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  const items = data?.items ?? [];
  const watersheds = useMemo(() => [...new Set(items.map((s) => s.watershed))].sort(), [items]);
  const filtered = items.filter((s) =>
    (!watershed || s.watershed === watershed) && (!origin || s.originInventory === origin) && (!status || s.physicalStatus === status) &&
    (!q || `${s.code} ${s.name} ${s.workingId ?? ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Inventario</Title>
        <Button onClick={() => setCreating(true)}>Nueva estructura</Button>
      </Group>
      <Alert variant="light" color="blue">
        Línea base: 52 diques del informe 031-2024-OCI/2157-SVC. Las ampliaciones se registran aparte. El código (PDC-NNNN) es permanente
        y no se reutiliza; su formato definitivo se aprobará tras la conciliación física.
      </Alert>
      <Group>
        <TextInput placeholder="Buscar código, nombre o ID de trabajo" value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} />
        <Select placeholder="Quebrada" data={watersheds} value={watershed} onChange={setWatershed} clearable />
        <Select placeholder="Origen" value={origin} onChange={setOrigin} clearable
          data={[{ value: 'linea_base_2024', label: 'Línea base 2024' }, { value: 'ampliacion', label: 'Ampliación' }]} />
        <Select placeholder="Estado físico" data={['Operativo', 'Deteriorado', 'Crítico', 'En evaluación']} value={status} onChange={setStatus} clearable />
        <Text size="sm" c="dimmed">{filtered.length} de {items.length}</Text>
      </Group>
      {isLoading ? <Loader /> : error ? <Alert color="red">{(error as Error).message}</Alert> : (
        <Table.ScrollContainer minWidth={1000}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Quebrada</Table.Th><Table.Th>Origen</Table.Th>
                <Table.Th>Tipo</Table.Th><Table.Th>Estado físico</Table.Th><Table.Th>Intervención</Table.Th><Table.Th>Ubicación</Table.Th>
                <Table.Th>Última inspección validada</Table.Th><Table.Th>Próxima</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((s) => {
                const overdue = s.nextInspectionDue && new Date(s.nextInspectionDue) < new Date();
                return (
                  <Table.Tr key={s.id}>
                    <Table.Td><Link to={`/inventario/${s.id}`}>{s.code}</Link><Text size="xs" c="dimmed">{s.workingId}</Text></Table.Td>
                    <Table.Td>{s.name}</Table.Td>
                    <Table.Td>{s.watershed}</Table.Td>
                    <Table.Td><OriginBadge value={s.originInventory} /></Table.Td>
                    <Table.Td><TypeBadge value={s.structureType} /></Table.Td>
                    <Table.Td><PhysicalBadge value={s.physicalStatus} /></Table.Td>
                    <Table.Td><InterventionBadge value={s.interventionStatus} /></Table.Td>
                    <Table.Td>{s.location ? <DataLabel value={s.location.label} size="xs" /> : <Text size="xs" c="red">Sin coordenadas</Text>}</Table.Td>
                    <Table.Td>{fmtDate(s.lastInspectionAt)}</Table.Td>
                    <Table.Td><Text size="sm" c={overdue ? 'red' : undefined}>{fmtDate(s.nextInspectionDue)}{overdue ? ' (vencida)' : ''}</Text></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={creating} onClose={() => setCreating(false)} title="Nueva estructura" size="lg">
        <StructureForm busy={create.isPending} onSubmit={(v) => create.mutate(formToPayload(v))} />
      </Modal>
    </Stack>
  );
}
