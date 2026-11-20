import { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Code, Grid, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Tabs, Text,
  TextInput, Textarea, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Map as MlMap } from 'maplibre-gl';
import { MATERIAL_LABELS, type Material } from '@dique/shared';
import { api, ApiError, type Structure } from '../api';
import {
  DataLabel, InterventionBadge, OriginBadge, PhysicalBadge, TypeBadge, URGENCY_COLORS, fmt, fmtDate, fmtDateTime,
} from '../components/Labels';
import { MapView, setGeoJson, fitTo } from '../components/MapView';
import { StructureForm, formToPayload } from './Inventory';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Text size="xs" c="dimmed">{label}</Text><Text size="sm" component="div">{children ?? '—'}</Text></div>;
}

function ExposureForm({ structureId, hasPrevious, onDone }: { structureId: string; hasPrevious: boolean; onDone: () => void }) {
  const [v, setV] = useState({ method: 'VxH', affectedHomes: '' as number | '', personsPerHome: 3.58 as number | '', estimatedPersons: '' as number | '',
    methodNotes: '', source: '', dataLabel: 'Documentado', confidence: 'media', validFrom: new Date().toISOString().slice(0, 10), changeReason: '' });
  const m = useMutation({
    mutationFn: () => api('/exposure-estimates', { body: {
      structureId, method: v.method, methodNotes: v.methodNotes, source: v.source, dataLabel: v.dataLabel, confidence: v.confidence,
      validFrom: v.validFrom, changeReason: v.changeReason || null,
      ...(v.method === 'VxH' ? { affectedHomes: Number(v.affectedHomes), personsPerHome: Number(v.personsPerHome) } : { estimatedPersons: Number(v.estimatedPersons) }),
    } }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Exposición registrada; prioridad recalculada (versión nueva).' }); onDone(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const n = v.method === 'VxH' && v.affectedHomes !== '' && v.personsPerHome !== '' ? Number(v.affectedHomes) * Number(v.personsPerHome) : null;
  return (
    <Stack component="form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Select label="Método" value={v.method} onChange={(x) => setV({ ...v, method: x! })}
        data={[{ value: 'VxH', label: 'N = V × H (viviendas × habitantes por vivienda)' }, { value: 'dato_oficial', label: 'Dato oficial directo' }]} />
      {v.method === 'VxH' ? (
        <SimpleGrid cols={3}>
          <NumberInput label="V — viviendas ocupadas o presumibles" min={0} value={v.affectedHomes} onChange={(x) => setV({ ...v, affectedHomes: x as number })} required />
          <NumberInput label="H — habitantes por vivienda" min={0} decimalScale={2} value={v.personsPerHome} onChange={(x) => setV({ ...v, personsPerHome: x as number })} required />
          <Field label="N resultante">{n == null ? '—' : n.toFixed(1)}</Field>
        </SimpleGrid>
      ) : <NumberInput label="N — personas (dato oficial)" min={0} value={v.estimatedPersons} onChange={(x) => setV({ ...v, estimatedPersons: x as number })} required />}
      <Textarea label="Método y supuestos (polígono, clasificación de ocupación, etc.)" required value={v.methodNotes} onChange={(e) => setV({ ...v, methodNotes: e.currentTarget.value })} />
      <TextInput label="Fuente" required value={v.source} onChange={(e) => setV({ ...v, source: e.currentTarget.value })} />
      <SimpleGrid cols={3}>
        <Select label="Etiqueta" data={['Documentado', 'Estimado', 'Demostración']} value={v.dataLabel} onChange={(x) => setV({ ...v, dataLabel: x! })} />
        <Select label="Confianza" data={['alta', 'media', 'baja']} value={v.confidence} onChange={(x) => setV({ ...v, confidence: x! })} />
        <TextInput label="Vigente desde" type="date" value={v.validFrom} onChange={(e) => setV({ ...v, validFrom: e.currentTarget.value })} />
      </SimpleGrid>
      {hasPrevious && <TextInput label="Motivo de la actualización (obligatorio)" required value={v.changeReason} onChange={(e) => setV({ ...v, changeReason: e.currentTarget.value })} />}
      <Alert color="gray" variant="light">Al guardar se recalcula la prioridad de todo el inventario (Nmax puede cambiar) y se conserva la versión anterior.</Alert>
      <Button type="submit" loading={m.isPending}>Registrar exposición</Button>
    </Stack>
  );
}

export function StructureDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [addExposure, setAddExposure] = useState(false);
  const [urgency, setUrgency] = useState<{ level: string; justification: string } | null>(null);
  const s = useQuery({ queryKey: ['structure', id], queryFn: () => api<Structure>(`/structures/${id}`) });
  const h = useQuery({ queryKey: ['structure-history', id], queryFn: () => api(`/structures/${id}/history`) });
  const sc = useQuery({ queryKey: ['scenarios', id], queryFn: () => api(`/scenarios?structureId=${id}`) });
  const refresh = () => qc.invalidateQueries();
  const edit = useMutation({
    mutationFn: ({ body }: { body: unknown }) => api(`/structures/${id}`, { method: 'PATCH', body }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Cambios guardados y auditados.' }); setEditing(false); refresh(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const urg = useMutation({
    mutationFn: () => api('/urgencies', { body: { structureId: id, ...urgency } }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Urgencia registrada (no modifica P).' }); setUrgency(null); refresh(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });

  const drawMap = useCallback((map: MlMap) => {
    const st = s.data; if (!st?.location) return;
    const scen = sc.data?.items?.[0];
    if (scen?.zone) {
      setGeoJson(map, 'zone', scen.zone);
      if (!map.getLayer('zone')) map.addLayer({ id: 'zone', type: 'fill', source: 'zone', paint: { 'fill-color': '#4dabf7', 'fill-opacity': 0.15 } });
    }
    if (scen?.corridor) {
      setGeoJson(map, 'corr', scen.corridor);
      if (!map.getLayer('corr')) map.addLayer({ id: 'corr', type: 'line', source: 'corr', paint: { 'line-color': '#1c7ed6', 'line-width': 2, 'line-dasharray': [2, 1] } });
    }
    setGeoJson(map, 'pt', { type: 'Point', coordinates: [st.location.lon, st.location.lat] });
    if (!map.getLayer('pt')) map.addLayer({ id: 'pt', type: 'circle', source: 'pt', paint: { 'circle-radius': 8, 'circle-color': '#e03131', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    const coords: Array<[number, number]> = [[st.location.lon, st.location.lat]];
    if (scen?.corridor?.coordinates) for (const line of scen.corridor.coordinates) coords.push(...line);
    fitTo(map, coords, 40);
  }, [s.data, sc.data]);

  if (s.isLoading || h.isLoading) return <Loader />;
  if (s.error) return <Alert color="red">{errMsg(s.error)}</Alert>;
  const st = s.data!;
  const hist = h.data;
  const lastPriority = hist?.priorities?.[0];
  const lastExposure = hist?.exposures?.[0];
  const lastUrgency = hist?.urgencies?.[0];
  const L = st.location;

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Text size="sm" c="dimmed"><Link to="/inventario">Inventario</Link> / {st.code}</Text>
          <Title order={2}>{st.code} — {st.name}</Title>
          <Group gap="xs" mt={4}>
            <OriginBadge value={st.originInventory} /><TypeBadge value={st.structureType} />
            <PhysicalBadge value={st.physicalStatus} /><InterventionBadge value={st.interventionStatus} />
            {!st.active && <Badge color="dark">Inactiva</Badge>}
          </Group>
        </div>
        <Group>
          <Button variant="light" onClick={() => setUrgency({ level: 'Atención', justification: '' })}>Registrar urgencia</Button>
          <Button onClick={() => setEditing(true)}>Editar</Button>
        </Group>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder>
            <Text fw={600} mb="sm">Identificación y ubicación</Text>
            <SimpleGrid cols={{ base: 2, md: 3 }}>
              <Field label="Código permanente">{st.code}</Field>
              <Field label="ID de trabajo (conciliación)">{st.workingId}</Field>
              <Field label="Estado de conciliación">{st.reconciliationStatus}</Field>
              <Field label="Quebrada / sector">{st.watershed}</Field>
              <Field label="N.° en la fuente">{st.sourceNumber}</Field>
              <Field label="Material">{MATERIAL_LABELS[st.material as Material] ?? st.material}</Field>
              <Field label="Coordenadas">{L ? `${L.lat.toFixed(6)}, ${L.lon.toFixed(6)}` : 'Sin coordenadas'}</Field>
              <Field label="Etiqueta / confianza">{L ? <Group gap={4}><DataLabel value={L.label} /><Badge size="sm" variant="outline">{L.confidence}</Badge></Group> : '—'}</Field>
              <Field label="Precisión">{L?.precisionM != null ? `± ${L.precisionM} m` : '—'}</Field>
              <Field label="Altitud (DEM)">{st.elevationM != null ? `${st.elevationM} m` : '—'}</Field>
              <Field label="Fecha del dato">{fmtDate(L?.date)}</Field>
              <Field label="Responsable">{L?.responsible}</Field>
            </SimpleGrid>
            <Field label="Método de ubicación">{L?.method}</Field>
            <Field label="Fuente de ubicación">{L?.source}</Field>
            <Field label="Referencia documental">{st.sourceReference}</Field>
            {st.notes && <Field label="Notas">{st.notes}</Field>}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <MapView height={330} onReady={drawMap} center={L ? [L.lon, L.lat] : undefined} zoom={15} />
          <Text size="xs" c="dimmed" mt={4}>Línea punteada: corredor hipotético por relieve. Área azul: polígono de exposición estimado.</Text>
        </Grid.Col>
      </Grid>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Text fw={600}>Prioridad vigente</Text>
          {lastPriority ? (
            <>
              <Text size="2rem" fw={700}>P = {fmt(lastPriority.p, 4)}</Text>
              <Text size="sm">E = ({lastPriority.d}+{lastPriority.c}+{lastPriority.a})/9 = {fmt(lastPriority.e)} · X = {lastPriority.n_persons}/{lastPriority.n_max} = {fmt(lastPriority.x)}</Text>
              <Text size="xs" c="dimmed">{lastPriority.formula_version} · {fmtDateTime(lastPriority.calculated_at)}</Text>
              {lastPriority.warnings?.map((w: string) => <Badge key={w} color="orange" variant="light" mr={4} mt={4}>{w}</Badge>)}
            </>
          ) : <Text c="dimmed" size="sm">Sin cálculo: requiere inspección validada con D, C y A completos y exposición N.</Text>}
        </Card>
        <Card withBorder>
          <Text fw={600}>Exposición vigente (N)</Text>
          {lastExposure ? (
            <>
              <Text size="2rem" fw={700}>{Number(lastExposure.estimated_persons).toFixed(0)} personas</Text>
              <Text size="sm">{lastExposure.method === 'VxH' ? `V = ${lastExposure.affected_homes} × H = ${lastExposure.persons_per_home}` : 'Dato oficial'}
                {lastExposure.persons_low != null && ` · rango ${Number(lastExposure.persons_low).toFixed(0)}–${Number(lastExposure.persons_high).toFixed(0)}`}</Text>
              <Group gap={4} mt={4}><DataLabel value={lastExposure.data_label} /><Badge size="sm" variant="outline">confianza {lastExposure.confidence}</Badge></Group>
            </>
          ) : <Text c="dimmed" size="sm">Sin exposición registrada.</Text>}
          <Button size="xs" mt="sm" variant="light" onClick={() => setAddExposure(true)}>Actualizar exposición</Button>
        </Card>
        <Card withBorder>
          <Text fw={600}>Urgencia operativa</Text>
          {lastUrgency ? (
            <>
              <Badge size="lg" color={URGENCY_COLORS[lastUrgency.level]}>{lastUrgency.level}</Badge>
              <Text size="sm" mt={4}>{lastUrgency.justification}</Text>
              <Text size="xs" c="dimmed">{lastUrgency.author} · {fmtDateTime(lastUrgency.created_at)}</Text>
            </>
          ) : <Text c="dimmed" size="sm">Sin urgencia registrada.</Text>}
          <Text size="xs" c="dimmed" mt="xs">La urgencia es independiente y no modifica P.</Text>
        </Card>
      </SimpleGrid>

      <Tabs defaultValue="insp">
        <Tabs.List>
          <Tabs.Tab value="insp">Inspecciones ({hist?.inspections.length})</Tabs.Tab>
          <Tabs.Tab value="int">Intervenciones ({hist?.interventions.length})</Tabs.Tab>
          <Tabs.Tab value="exp">Exposición ({hist?.exposures.length})</Tabs.Tab>
          <Tabs.Tab value="prio">Historial de prioridad</Tabs.Tab>
          <Tabs.Tab value="audit">Auditoría</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="insp" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Inspector</Table.Th><Table.Th>D</Table.Th><Table.Th>C</Table.Th><Table.Th>A</Table.Th>
              <Table.Th>Estado físico</Table.Th><Table.Th>Acceso</Table.Th><Table.Th>Validación</Table.Th><Table.Th>Dato</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.inspections.map((i: any) => (
              <Table.Tr key={i.id}>
                <Table.Td><Link to={`/inspecciones/${i.id}`}>{fmtDateTime(i.inspected_at)}</Link></Table.Td>
                <Table.Td>{i.inspector_name}</Table.Td>
                <Table.Td>{i.damage_score ?? '—'}</Table.Td><Table.Td>{i.clogging_score ?? '—'}</Table.Td><Table.Td>{i.active_process_score ?? '—'}</Table.Td>
                <Table.Td><PhysicalBadge value={i.physical_status} /></Table.Td><Table.Td>{i.access_status}</Table.Td>
                <Table.Td>{i.validation_status}</Table.Td><Table.Td><DataLabel value={i.data_label} size="xs" /></Table.Td>
              </Table.Tr>))}</Table.Tbody>
          </Table>
        </Tabs.Panel>
        <Tabs.Panel value="int" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Creada</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Maquinaria</Table.Th><Table.Th>Planificada</Table.Th><Table.Th>Ejecutada</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.interventions.map((i: any) => (
              <Table.Tr key={i.id}><Table.Td>{fmtDate(i.created_at)}</Table.Td><Table.Td>{i.intervention_type}</Table.Td>
                <Table.Td><InterventionBadge value={i.status} /></Table.Td><Table.Td>{i.machinery ?? '—'}</Table.Td>
                <Table.Td>{fmtDate(i.planned_start)} – {fmtDate(i.planned_end)}</Table.Td><Table.Td>{fmtDate(i.actual_start)} – {fmtDate(i.actual_end)}</Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
          <Button component={Link} to={`/intervenciones?structureId=${st.id}`} size="xs" mt="sm" variant="light">Gestionar intervenciones</Button>
        </Tabs.Panel>
        <Tabs.Panel value="exp" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Vigente desde</Table.Th><Table.Th>Método</Table.Th><Table.Th>V</Table.Th><Table.Th>H</Table.Th><Table.Th>N</Table.Th>
              <Table.Th>Dato</Table.Th><Table.Th>Fuente</Table.Th><Table.Th>Motivo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.exposures.map((e: any) => (
              <Table.Tr key={e.id}><Table.Td>{fmtDate(e.valid_from)}</Table.Td><Table.Td>{e.method}</Table.Td><Table.Td>{e.affected_homes ?? '—'}</Table.Td>
                <Table.Td>{e.persons_per_home ?? '—'}</Table.Td><Table.Td>{Number(e.estimated_persons).toFixed(1)}</Table.Td>
                <Table.Td><DataLabel value={e.data_label} size="xs" /></Table.Td><Table.Td><Text size="xs">{e.source}</Text></Table.Td>
                <Table.Td><Text size="xs">{e.change_reason ?? 'Primera estimación'}</Text></Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
          {lastExposure && <Text size="xs" c="dimmed" mt="xs">Método: {lastExposure.method_notes}</Text>}
        </Tabs.Panel>
        <Tabs.Panel value="prio" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>D/C/A</Table.Th><Table.Th>N</Table.Th><Table.Th>Nmax</Table.Th><Table.Th>E</Table.Th><Table.Th>X</Table.Th><Table.Th>P</Table.Th><Table.Th>Motivo del recálculo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.priorities.map((p: any) => (
              <Table.Tr key={p.id}><Table.Td>{fmtDateTime(p.calculated_at)}</Table.Td><Table.Td>{p.d}/{p.c}/{p.a}</Table.Td><Table.Td>{p.n_persons}</Table.Td>
                <Table.Td>{p.n_max}</Table.Td><Table.Td>{fmt(p.e)}</Table.Td><Table.Td>{fmt(p.x)}</Table.Td><Table.Td><b>{fmt(p.p)}</b></Table.Td>
                <Table.Td><Text size="xs">{p.reason}</Text></Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
        </Tabs.Panel>
        <Tabs.Panel value="audit" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Actor</Table.Th><Table.Th>Acción</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Detalle</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.audits.map((a: any) => (
              <Table.Tr key={a.id}><Table.Td>{fmtDateTime(a.occurred_at)}</Table.Td><Table.Td>{a.actor_name ?? 'Sistema'}</Table.Td><Table.Td>{a.action}</Table.Td>
                <Table.Td>{a.reason ?? '—'}</Table.Td><Table.Td><Code block style={{ maxHeight: 120, overflow: 'auto', fontSize: 11 }}>{JSON.stringify({ antes: a.before_data, despues: a.after_data }, null, 1)}</Code></Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
        </Tabs.Panel>
      </Tabs>

      <Modal opened={editing} onClose={() => setEditing(false)} title={`Editar ${st.code}`} size="lg">
        <StructureForm withReason busy={edit.isPending}
          initial={{ name: st.name, structureType: st.structureType, material: st.material, watershed: st.watershed, originInventory: st.originInventory,
            sourceReference: st.sourceReference ?? '', notes: st.notes ?? '', lat: L?.lat ?? '', lon: L?.lon ?? '', confidence: L?.confidence ?? 'provisional',
            label: L?.label ?? 'Provisional', method: L?.method ?? '', source: L?.source ?? '', precisionM: L?.precisionM ?? '' }}
          onSubmit={(v, reason) => {
            const p = formToPayload(v);
            const { originInventory, ...rest } = p;
            void originInventory;
            const locChanged = !L || p.location?.lat !== L.lat || p.location?.lon !== L.lon || p.location?.label !== L.label || p.location?.confidence !== L.confidence;
            edit.mutate({ body: { ...rest, location: locChanged ? p.location : undefined, reason } });
          }} />
      </Modal>
      <Modal opened={addExposure} onClose={() => setAddExposure(false)} title="Actualizar exposición" size="lg">
        <ExposureForm structureId={st.id} hasPrevious={Boolean(lastExposure)} onDone={() => { setAddExposure(false); refresh(); }} />
      </Modal>
      <Modal opened={!!urgency} onClose={() => setUrgency(null)} title="Registrar urgencia operativa">
        {urgency && (
          <Stack component="form" onSubmit={(e) => { e.preventDefault(); urg.mutate(); }}>
            <Select label="Nivel" data={['Normal', 'Atención', 'Urgente']} value={urgency.level} onChange={(x) => setUrgency({ ...urgency, level: x! })} />
            <Textarea label="Justificación (obligatoria)" required value={urgency.justification} onChange={(e) => setUrgency({ ...urgency, justification: e.currentTarget.value })} />
            <Alert color="gray" variant="light">La urgencia se muestra junto a la prioridad pero no altera el valor de P.</Alert>
            <Button type="submit" loading={urg.isPending}>Registrar</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
