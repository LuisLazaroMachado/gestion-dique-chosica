import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Text, TextInput, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { Link } from 'react-router-dom';
import { MATERIALS, MATERIAL_LABELS, STRUCTURE_TYPES, STRUCTURE_TYPE_LABELS } from '@dique/shared';
import { api, ApiError, downloadFile, type Structure } from '../api';
import { DataLabel, InterventionBadge, OriginBadge, PhysicalBadge, TypeBadge, fmtDate } from '../components/Labels';
import { PageHeader } from '../components/Help';

// Una sola pregunta sobre la ubicación, que se traduce a los dos campos técnicos (etiqueta y confianza).
const LOCATION_QUALITY = [
  { value: 'gps', label: 'Confirmada en el lugar con GPS', dataLabel: 'Documentado', confidence: 'verificada' },
  { value: 'doc', label: 'Tomada de un documento oficial', dataLabel: 'Documentado', confidence: 'aproximada' },
  { value: 'aprox', label: 'Aproximada (por confirmar)', dataLabel: 'Estimado', confidence: 'provisional' },
];
const qualityOf = (label: string, confidence: string) =>
  label === 'Documentado' ? (confidence === 'verificada' ? 'gps' : 'doc') : 'aprox';

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
      <TextInput label="Nombre" required value={v.name} onChange={set('name')} placeholder="Ej.: Dique 3, quebrada Pedregal" />
      <SimpleGrid cols={2}>
        <Select label="Tipo" data={STRUCTURE_TYPES.map((t) => ({ value: t, label: STRUCTURE_TYPE_LABELS[t] }))} value={v.structureType} onChange={set('structureType')} />
        <Select label="Material" data={MATERIALS.map((t) => ({ value: t, label: MATERIAL_LABELS[t] }))} value={v.material} onChange={set('material')} />
        <TextInput label="Quebrada o sector" required value={v.watershed} onChange={set('watershed')} />
        <Select label="Registro" disabled={withReason} value={v.originInventory} onChange={set('originInventory')}
          data={[{ value: 'linea_base_2024', label: 'Inventario inicial (Contraloría 2024)' }, { value: 'ampliacion', label: 'Agregada después' }]} />
      </SimpleGrid>
      <TextInput label="Documento de origen (opcional)" value={v.sourceReference} onChange={set('sourceReference')} placeholder="Ej.: informe, acta o expediente" />
      <Text fw={600} size="sm">Ubicación</Text>
      <SimpleGrid cols={3}>
        <NumberInput label="Latitud" decimalScale={6} value={v.lat} onChange={set('lat')} min={-90} max={90} />
        <NumberInput label="Longitud" decimalScale={6} value={v.lon} onChange={set('lon')} min={-180} max={180} />
        <NumberInput label="Precisión (m)" value={v.precisionM} onChange={set('precisionM')} min={0} />
      </SimpleGrid>
      <Select label="¿Qué tan segura es la ubicación?" data={LOCATION_QUALITY.map(({ value, label }) => ({ value, label }))}
        value={qualityOf(v.label, v.confidence)}
        onChange={(q) => { const o = LOCATION_QUALITY.find((x) => x.value === q); if (o) setV({ ...v, label: o.dataLabel, confidence: o.confidence }); }} />
      <SimpleGrid cols={2}>
        <TextInput label="¿Cómo se obtuvo?" required={hasLoc} value={v.method} onChange={set('method')} placeholder="Ej.: GPS del celular en el lugar" />
        <TextInput label="¿Quién la tomó o de dónde salió?" required={hasLoc} value={v.source} onChange={set('source')} placeholder="Ej.: inspector INS-001" />
      </SimpleGrid>
      <Textarea label="Notas" value={v.notes} onChange={set('notes')} autosize minRows={2} />
      {withReason && <TextInput label="¿Por qué haces este cambio? (queda en el historial)" required value={reason} onChange={(e) => setReason(e.currentTarget.value)} />}
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
      notifications.show({ color: 'green', message: `Estructura ${s.code} registrada. Las prioridades se actualizaron.` });
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
      <PageHeader title="Inventario"
        description="Todas las estructuras de protección registradas. Haz clic en un código para ver su ficha: ubicación, inspecciones, trabajos y prioridad. Cada estructura tiene un código único que no cambia."
        actions={<Group>
          <Button variant="default" onClick={() => downloadFile('/reports/priorities.xlsx', 'inventario-diques.xlsx').catch((e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }))}>Descargar Excel</Button>
          <Button onClick={() => setCreating(true)}>Registrar estructura</Button>
        </Group>} />
      <Group>
        <TextInput placeholder="Buscar por código o nombre" value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} />
        <Select placeholder="Quebrada" data={watersheds} value={watershed} onChange={setWatershed} clearable />
        <Select placeholder="Registro" value={origin} onChange={setOrigin} clearable
          data={[{ value: 'linea_base_2024', label: 'Inventario inicial' }, { value: 'ampliacion', label: 'Agregada después' }]} />
        <Select placeholder="Estado" data={['Operativo', 'Deteriorado', 'Crítico', 'En evaluación']} value={status} onChange={setStatus} clearable />
        <Text size="sm" c="dimmed">{filtered.length} de {items.length}</Text>
      </Group>
      {isLoading ? <Loader /> : error ? <Alert color="red">{(error as Error).message}</Alert> : (
        <Table.ScrollContainer minWidth={1000}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Quebrada</Table.Th><Table.Th>Registro</Table.Th>
                <Table.Th>Tipo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Trabajos</Table.Th><Table.Th>Ubicación</Table.Th>
                <Table.Th>Última inspección</Table.Th><Table.Th>Próxima inspección</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((s) => {
                const overdue = s.nextInspectionDue && new Date(s.nextInspectionDue) < new Date();
                return (
                  <Table.Tr key={s.id}>
                    <Table.Td><Link to={`/inventario/${s.id}`}>{s.code}</Link></Table.Td>
                    <Table.Td>{s.name}</Table.Td>
                    <Table.Td>{s.watershed}</Table.Td>
                    <Table.Td><OriginBadge value={s.originInventory} /></Table.Td>
                    <Table.Td><TypeBadge value={s.structureType} /></Table.Td>
                    <Table.Td><PhysicalBadge value={s.physicalStatus} /></Table.Td>
                    <Table.Td><InterventionBadge value={s.interventionStatus} /></Table.Td>
                    <Table.Td>{s.location ? <DataLabel value={s.location.label} size="xs" /> : <Text size="xs" c="red">Sin ubicación</Text>}</Table.Td>
                    <Table.Td>{fmtDate(s.lastInspectionAt)}</Table.Td>
                    <Table.Td><Text size="sm" c={overdue ? 'red' : undefined}>{fmtDate(s.nextInspectionDue)}{overdue ? ' (atrasada)' : ''}</Text></Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      <Modal opened={creating} onClose={() => setCreating(false)} title="Registrar estructura" size="lg">
        <StructureForm busy={create.isPending} onSubmit={(v) => create.mutate(formToPayload(v))} />
      </Modal>
    </Stack>
  );
}
