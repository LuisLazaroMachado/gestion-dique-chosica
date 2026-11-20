import { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Code, Grid, Group, Loader, Modal, NumberInput, Select, SimpleGrid, Stack, Table, Tabs, Text,
  TextInput, Textarea, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Map as MlMap } from 'maplibre-gl';
import { ACCESS_LABELS, ACCESS_OBSTACLE_LABELS, MATERIAL_LABELS, VALIDATION_LABELS, type Material } from '@dique/shared';
import { HelpTip } from '../components/Help';
import { api, ApiError, downloadFile, type Structure } from '../api';
import {
  DataLabel, InterventionBadge, MachineryBadge, OriginBadge, PhysicalBadge, TypeBadge, URGENCY_COLORS, fmt, fmtDate, fmtDateTime,
} from '../components/Labels';
import { MapView, setGeoJson, fitTo } from '../components/MapView';
import { StructureForm, formToPayload } from './Inventory';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Text size="xs" c="dimmed">{label}</Text><Text size="sm" component="div">{children ?? '-'}</Text></div>;
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
    onSuccess: () => { notifications.show({ color: 'green', message: 'Personas expuestas actualizadas. Las prioridades se recalcularon.' }); onDone(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const n = v.method === 'VxH' && v.affectedHomes !== '' && v.personsPerHome !== '' ? Number(v.affectedHomes) * Number(v.personsPerHome) : null;
  return (
    <Stack component="form" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
      <Select label="¿Cómo se obtuvo?" value={v.method} onChange={(x) => setV({ ...v, method: x! })}
        data={[{ value: 'VxH', label: 'Contando viviendas (viviendas × personas por vivienda)' }, { value: 'dato_oficial', label: 'Número oficial de personas' }]} />
      {v.method === 'VxH' ? (
        <SimpleGrid cols={3}>
          <NumberInput label="Viviendas habitadas en la zona" min={0} value={v.affectedHomes} onChange={(x) => setV({ ...v, affectedHomes: x as number })} required />
          <NumberInput label="Personas por vivienda" min={0} decimalScale={2} value={v.personsPerHome} onChange={(x) => setV({ ...v, personsPerHome: x as number })} required />
          <Field label="Personas expuestas (resultado)">{n == null ? '-' : n.toFixed(1)}</Field>
        </SimpleGrid>
      ) : <NumberInput label="Número de personas (dato oficial)" min={0} value={v.estimatedPersons} onChange={(x) => setV({ ...v, estimatedPersons: x as number })} required />}
      <Textarea label="¿Cómo se contó? (zona usada, supuestos)" required value={v.methodNotes} onChange={(e) => setV({ ...v, methodNotes: e.currentTarget.value })} />
      <TextInput label="Fuente" required value={v.source} onChange={(e) => setV({ ...v, source: e.currentTarget.value })} />
      <SimpleGrid cols={3}>
        <Select label="Tipo de dato" data={[{ value: 'Documentado', label: 'Confirmado' }, { value: 'Estimado', label: 'Aproximado' }, { value: 'Demostración', label: 'De prueba' }]} value={v.dataLabel} onChange={(x) => setV({ ...v, dataLabel: x! })} />
        <Select label="Confiabilidad" data={['alta', 'media', 'baja']} value={v.confidence} onChange={(x) => setV({ ...v, confidence: x! })} />
        <TextInput label="Vigente desde" type="date" value={v.validFrom} onChange={(e) => setV({ ...v, validFrom: e.currentTarget.value })} />
      </SimpleGrid>
      {hasPrevious && <TextInput label="¿Por qué se actualiza? (obligatorio)" required value={v.changeReason} onChange={(e) => setV({ ...v, changeReason: e.currentTarget.value })} />}
      <Alert color="gray" variant="light">Al guardar se actualizan las prioridades de todas las estructuras. El valor anterior queda en el historial.</Alert>
      <Button type="submit" loading={m.isPending}>Guardar</Button>
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
    onSuccess: () => { notifications.show({ color: 'green', message: 'Cambios guardados.' }); setEditing(false); refresh(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const urg = useMutation({
    mutationFn: () => api('/urgencies', { body: { structureId: id, ...urgency } }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Urgencia registrada.' }); setUrgency(null); refresh(); },
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
          <Title order={2}>{st.code} · {st.name}</Title>
          <Group gap="xs" mt={4}>
            <OriginBadge value={st.originInventory} /><TypeBadge value={st.structureType} />
            <PhysicalBadge value={st.physicalStatus} /><InterventionBadge value={st.interventionStatus} />
            {!st.active && <Badge color="dark">Inactiva</Badge>}
          </Group>
        </div>
        <Group>
          <Button variant="default" onClick={() => downloadFile(`/reports/structures/${st.id}.pdf`, `ficha-${st.code}.pdf`).catch((e) => notifications.show({ color: 'red', message: errMsg(e) }))}>Descargar ficha (PDF)</Button>
          <Button variant="light" onClick={() => setUrgency({ level: 'Atención', justification: '' })}>Marcar urgencia</Button>
          <Button onClick={() => setEditing(true)}>Editar</Button>
        </Group>
      </Group>

      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card withBorder>
            <Text fw={600} mb="sm">Datos generales</Text>
            <SimpleGrid cols={{ base: 2, md: 3 }}>
              <Field label="Código">{st.code}</Field>
              <Field label="Quebrada">{st.watershed}</Field>
              <Field label="N.° en el informe original">{st.sourceNumber ?? '-'}</Field>
              <Field label="Material">{MATERIAL_LABELS[st.material as Material] ?? st.material}</Field>
              <Field label="Altitud">{st.elevationM != null ? `${st.elevationM} m s. n. m.` : '-'}</Field>
              <Field label="Coordenadas">{L ? `${L.lat.toFixed(6)}, ${L.lon.toFixed(6)}` : 'Sin ubicación'}</Field>
              <Field label="Ubicación">{L ? <Group gap={4}><DataLabel value={L.label} />{L.precisionM != null && <Text size="xs" c="dimmed">margen ± {L.precisionM} m</Text>}</Group> : '-'}</Field>
            </SimpleGrid>
            {st.notes && <Field label="Notas">{st.notes}</Field>}
            <details style={{ marginTop: 8 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, color: '#495057' }}>Detalles técnicos de la ubicación y del origen del dato</summary>
              <Stack gap={4} mt={6}>
                <Field label="Cómo se obtuvo la ubicación">{L?.method}</Field>
                <Field label="Fuente">{L?.source}</Field>
                <Field label="Documento de origen">{st.sourceReference}</Field>
                <Field label="Código de trabajo usado en la verificación">{st.workingId ?? '-'}</Field>
              </Stack>
            </details>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <MapView height={330} onReady={drawMap} center={L ? [L.lon, L.lat] : undefined} zoom={15} />
          <Text size="xs" c="dimmed" mt={4}>Línea punteada: por dónde bajaría el material si el dique falla. Área azul: zona con viviendas expuestas.</Text>
        </Grid.Col>
      </Grid>

      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Card withBorder>
          <Group gap={4}><Text fw={600}>Prioridad</Text><HelpTip label="Número de 0 a 1. Mientras más alto, más urge atender. Combina el estado de la estructura con las personas que viven en la zona que podría afectar." /></Group>
          {lastPriority ? (
            <>
              <Text size="2rem" fw={700}>{fmt(lastPriority.p, 2)}</Text>
              <Text size="sm">Estado de la estructura: {fmt(lastPriority.e, 2)} <Text span c="dimmed" size="xs">(daño {lastPriority.d} + material {lastPriority.c} + erosión {lastPriority.a}, de 9)</Text></Text>
              <Text size="sm">Personas expuestas: {fmt(lastPriority.x, 2)} <Text span c="dimmed" size="xs">({Math.round(lastPriority.n_persons)} de {Math.round(lastPriority.n_max)}, el máximo del inventario)</Text></Text>
              <Text size="xs" c="dimmed">Prioridad = estado × personas expuestas · actualizado {fmtDateTime(lastPriority.calculated_at)}</Text>
              {lastPriority.warnings?.some((w: string) => w.includes('estimad')) && <Badge color="orange" variant="light" mt={4}>Incluye datos aproximados</Badge>}
            </>
          ) : <Text c="dimmed" size="sm">Falta información: necesita una inspección aprobada con daño, material y erosión, y el número de personas expuestas.</Text>}
        </Card>
        <Card withBorder>
          <Group gap={4}><Text fw={600}>Personas expuestas</Text><HelpTip label="Personas que viven en la zona por donde bajaría el material si esta estructura falla." /></Group>
          {lastExposure ? (
            <>
              <Text size="2rem" fw={700}>{Number(lastExposure.estimated_persons).toFixed(0)}</Text>
              <Text size="sm">{lastExposure.method === 'VxH' ? `${lastExposure.affected_homes} viviendas × ${lastExposure.persons_per_home} personas por vivienda` : 'Dato oficial'}</Text>
              {lastExposure.persons_low != null && <Text size="xs" c="dimmed">Entre {Number(lastExposure.persons_low).toFixed(0)} y {Number(lastExposure.persons_high).toFixed(0)} personas</Text>}
              <Group gap={4} mt={4}><DataLabel value={lastExposure.data_label} /></Group>
            </>
          ) : <Text c="dimmed" size="sm">Sin dato todavía.</Text>}
          <Button size="xs" mt="sm" variant="light" onClick={() => setAddExposure(true)}>Actualizar</Button>
        </Card>
        <Card withBorder>
          <Group gap={4}><Text fw={600}>Urgencia</Text><HelpTip label="Marca manual para casos que requieren atención inmediata (por ejemplo, lluvias anunciadas). No cambia el número de prioridad." /></Group>
          {lastUrgency ? (
            <>
              <Badge size="lg" color={URGENCY_COLORS[lastUrgency.level]}>{lastUrgency.level}</Badge>
              <Text size="sm" mt={4}>{lastUrgency.justification}</Text>
              <Text size="xs" c="dimmed">{lastUrgency.author} · {fmtDateTime(lastUrgency.created_at)}</Text>
            </>
          ) : <Text c="dimmed" size="sm">Sin urgencia marcada.</Text>}
        </Card>
      </SimpleGrid>

      {(() => {
        const acc = hist?.inspections.find((i: any) => i.validation_status !== 'Observado');
        return (
          <Card withBorder>
            <Group justify="space-between">
              <Group gap={4}><Text fw={600}>Acceso para maquinaria</Text><HelpTip label="Lo que reportó el inspector en su última inspección. Sirve para decidir cómo llegar con maquinaria." /></Group>
              <MachineryBadge value={acc?.machinery_access} />
            </Group>
            {acc ? (
              <SimpleGrid cols={{ base: 1, md: 3 }} mt="xs">
                <Field label="Camino hasta la estructura">{ACCESS_LABELS[acc.access_status] ?? acc.access_status}{acc.access_notes ? `: ${acc.access_notes}` : ''}</Field>
                <Field label="Obstáculos">{acc.access_obstacles?.length ? acc.access_obstacles.map((o: string) => ACCESS_OBSTACLE_LABELS[o] ?? o).join(', ') : 'Ninguno reportado'}</Field>
                <Field label="Último punto en vehículo">{acc.veh_lat != null ? <a href={`https://www.google.com/maps?q=${acc.veh_lat},${acc.veh_lon}`} target="_blank" rel="noreferrer">{Number(acc.veh_lat).toFixed(5)}, {Number(acc.veh_lon).toFixed(5)}</a> : 'No marcado'}</Field>
              </SimpleGrid>
            ) : <Text size="sm" c="dimmed">Sin inspecciones todavía.</Text>}
            {acc && <Text size="xs" c="dimmed" mt={4}>Según la inspección del {fmtDate(acc.inspected_at)}. Las fotos del camino están en esa inspección.</Text>}
          </Card>
        );
      })()}

      <Tabs defaultValue="insp">
        <Tabs.List>
          <Tabs.Tab value="insp">Inspecciones ({hist?.inspections.length})</Tabs.Tab>
          <Tabs.Tab value="int">Trabajos ({hist?.interventions.length})</Tabs.Tab>
          <Tabs.Tab value="exp">Personas expuestas ({hist?.exposures.length})</Tabs.Tab>
          <Tabs.Tab value="prio">Prioridad en el tiempo</Tabs.Tab>
          <Tabs.Tab value="audit">Historial de cambios</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="insp" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Inspector</Table.Th><Table.Th>Daño</Table.Th><Table.Th>Material</Table.Th><Table.Th>Erosión</Table.Th>
              <Table.Th>Estado</Table.Th><Table.Th>Acceso</Table.Th><Table.Th>Revisión</Table.Th><Table.Th>Dato</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.inspections.map((i: any) => (
              <Table.Tr key={i.id}>
                <Table.Td><Link to={`/inspecciones/${i.id}`}>{fmtDateTime(i.inspected_at)}</Link></Table.Td>
                <Table.Td>{i.inspector_name}</Table.Td>
                <Table.Td>{i.damage_score ?? '-'}</Table.Td><Table.Td>{i.clogging_score ?? '-'}</Table.Td><Table.Td>{i.active_process_score ?? '-'}</Table.Td>
                <Table.Td><PhysicalBadge value={i.physical_status} /></Table.Td><Table.Td>{ACCESS_LABELS[i.access_status] ?? i.access_status}</Table.Td>
                <Table.Td>{VALIDATION_LABELS[i.validation_status] ?? i.validation_status}</Table.Td><Table.Td><DataLabel value={i.data_label} size="xs" /></Table.Td>
              </Table.Tr>))}</Table.Tbody>
          </Table>
        </Tabs.Panel>
        <Tabs.Panel value="int" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Registrado</Table.Th><Table.Th>Trabajo</Table.Th><Table.Th>Situación</Table.Th><Table.Th>Maquinaria</Table.Th><Table.Th>Fechas previstas</Table.Th><Table.Th>Fechas reales</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.interventions.map((i: any) => (
              <Table.Tr key={i.id}><Table.Td>{fmtDate(i.created_at)}</Table.Td><Table.Td>{i.intervention_type}</Table.Td>
                <Table.Td><InterventionBadge value={i.status} /></Table.Td><Table.Td>{i.machinery ?? '-'}</Table.Td>
                <Table.Td>{fmtDate(i.planned_start)} a {fmtDate(i.planned_end)}</Table.Td><Table.Td>{fmtDate(i.actual_start)} a {fmtDate(i.actual_end)}</Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
          <Button component={Link} to={`/intervenciones?structureId=${st.id}`} size="xs" mt="sm" variant="light">Ir a trabajos</Button>
        </Tabs.Panel>
        <Tabs.Panel value="exp" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Desde</Table.Th><Table.Th>Cómo</Table.Th><Table.Th>Viviendas</Table.Th><Table.Th>Personas por vivienda</Table.Th><Table.Th>Personas</Table.Th>
              <Table.Th>Dato</Table.Th><Table.Th>Fuente</Table.Th><Table.Th>Motivo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.exposures.map((e: any) => (
              <Table.Tr key={e.id}><Table.Td>{fmtDate(e.valid_from)}</Table.Td><Table.Td>{e.method === 'VxH' ? 'Conteo de viviendas' : 'Dato oficial'}</Table.Td><Table.Td>{e.affected_homes ?? '-'}</Table.Td>
                <Table.Td>{e.persons_per_home ?? '-'}</Table.Td><Table.Td>{Number(e.estimated_persons).toFixed(1)}</Table.Td>
                <Table.Td><DataLabel value={e.data_label} size="xs" /></Table.Td><Table.Td><Text size="xs">{e.source}</Text></Table.Td>
                <Table.Td><Text size="xs">{e.change_reason ?? 'Primera estimación'}</Text></Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
          {lastExposure && <Text size="xs" c="dimmed" mt="xs">Cómo se calculó: {lastExposure.method_notes}</Text>}
        </Tabs.Panel>
        <Tabs.Panel value="prio" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Daño/Material/Erosión</Table.Th><Table.Th>Personas</Table.Th><Table.Th>Máximo</Table.Th><Table.Th>Estado (E)</Table.Th><Table.Th>Exposición (X)</Table.Th><Table.Th>Prioridad</Table.Th><Table.Th>¿Por qué se actualizó?</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.priorities.map((p: any) => (
              <Table.Tr key={p.id}><Table.Td>{fmtDateTime(p.calculated_at)}</Table.Td><Table.Td>{p.d}/{p.c}/{p.a}</Table.Td><Table.Td>{p.n_persons}</Table.Td>
                <Table.Td>{p.n_max}</Table.Td><Table.Td>{fmt(p.e)}</Table.Td><Table.Td>{fmt(p.x)}</Table.Td><Table.Td><b>{fmt(p.p)}</b></Table.Td>
                <Table.Td><Text size="xs">{p.reason}</Text></Table.Td></Table.Tr>))}</Table.Tbody>
          </Table>
        </Tabs.Panel>
        <Tabs.Panel value="audit" pt="sm">
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Quién</Table.Th><Table.Th>Qué hizo</Table.Th><Table.Th>Motivo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{hist?.audits.map((a: any) => (
              <Table.Tr key={a.id}><Table.Td>{fmtDateTime(a.occurred_at)}</Table.Td><Table.Td>{a.actor_name ?? 'El sistema'}</Table.Td><Table.Td>{a.action.replace(/_/g, ' ')}</Table.Td>
                <Table.Td>{a.reason ?? '-'}</Table.Td></Table.Tr>))}</Table.Tbody>
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
      <Modal opened={addExposure} onClose={() => setAddExposure(false)} title="Actualizar personas expuestas" size="lg">
        <ExposureForm structureId={st.id} hasPrevious={Boolean(lastExposure)} onDone={() => { setAddExposure(false); refresh(); }} />
      </Modal>
      <Modal opened={!!urgency} onClose={() => setUrgency(null)} title="Marcar urgencia">
        {urgency && (
          <Stack component="form" onSubmit={(e) => { e.preventDefault(); urg.mutate(); }}>
            <Select label="Nivel" data={['Normal', 'Atención', 'Urgente']} value={urgency.level} onChange={(x) => setUrgency({ ...urgency, level: x! })} />
            <Textarea label="¿Por qué es urgente? (obligatorio)" required value={urgency.justification} onChange={(e) => setUrgency({ ...urgency, justification: e.currentTarget.value })} />
            <Alert color="gray" variant="light">La urgencia se muestra junto a la prioridad, pero no cambia su número.</Alert>
            <Button type="submit" loading={urg.isPending}>Registrar</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
