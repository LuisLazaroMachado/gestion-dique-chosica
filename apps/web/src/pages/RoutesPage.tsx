import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Alert, Badge, Button, Card, Grid, Group, MultiSelect, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { api, ApiError, type Structure } from '../api';
import { MapView, setGeoJson, fitTo } from '../components/MapView';
import { fmtDateTime } from '../components/Labels';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));

export function RoutesPage() {
  const qc = useQueryClient();
  const [selection, setSelection] = useState<string[]>([]);
  const [name, setName] = useState('Recorrido de maquinaria');
  const [machinery, setMachinery] = useState('');
  const [route, setRoute] = useState<any | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [justification, setJustification] = useState('');
  const structures = useQuery({ queryKey: ['structures'], queryFn: () => api<{ items: Structure[] }>('/structures') });
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api('/routes') });
  const byId = new Map((structures.data?.items ?? []).map((s) => [s.id, s]));
  const calc = useMutation({
    mutationFn: () => api('/routes', { body: { name, structureIds: selection, machinery: machinery || null } }),
    onSuccess: (r: any) => { setRoute(r); setOrder(r.structureIdsFinal); qc.invalidateQueries({ queryKey: ['routes'] }); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const reorder = useMutation({
    mutationFn: () => api(`/routes/${route.id}/order`, { method: 'PATCH', body: { structureIdsFinal: order, justification } }),
    onSuccess: (r: any) => { setRoute(r); setJustification(''); notifications.show({ color: 'green', message: 'Orden final guardado; el orden calculado se conserva.' }); qc.invalidateQueries({ queryKey: ['routes'] }); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });

  const draw = useCallback((map: MlMap) => {
    if (!route) return;
    setGeoJson(map, 'route', route.geometry);
    if (!map.getLayer('route')) map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#e8590c', 'line-width': 4 } });
    const stops = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [route.base.lon, route.base.lat] }, properties: { label: 'Base' } },
        ...route.structureIdsFinal.map((id: string, i: number) => {
          const s = byId.get(id);
          return { type: 'Feature', geometry: { type: 'Point', coordinates: [s?.location?.lon, s?.location?.lat] }, properties: { label: String(i + 1) } };
        }),
      ],
    };
    setGeoJson(map, 'stops', stops as any);
    if (!map.getLayer('stops')) {
      map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 10, 'circle-color': '#1c4f82', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'stops-label', type: 'symbol', source: 'stops', layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-font': ['Open Sans Bold'] }, paint: { 'text-color': '#fff' } });
    }
    const coords = route.geometry?.coordinates as Array<[number, number]>;
    if (coords?.length) fitTo(map, coords);
    void maplibregl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, structures.data]);

  const move = (i: number, d: number) => { const o = [...order]; [o[i], o[i + d]] = [o[i + d], o[i]]; setOrder(o); };
  const changed = route && order.join() !== route.structureIdsFinal.join();

  return (
    <Stack>
      <Title order={2}>Rutas de maquinaria</Title>
      <Alert color="orange" variant="light">
        El orden se calcula desde la base central (MVP: una maquinaria). El ruteo vial no garantiza restricciones de maquinaria pesada: revise siempre.
        El acceso difícil no excluye estructuras; se advierte en la lista.
      </Alert>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack>
              <TextInput label="Nombre" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              <TextInput label="Maquinaria" value={machinery} onChange={(e) => setMachinery(e.currentTarget.value)} />
              <MultiSelect label="Estructuras a visitar" searchable maxDropdownHeight={280}
                data={(structures.data?.items ?? []).filter((s) => s.location).map((s) => ({ value: s.id, label: `${s.code} — ${s.watershed}` }))}
                value={selection} onChange={setSelection} />
              <Button onClick={() => calc.mutate()} loading={calc.isPending} disabled={!selection.length}>Calcular recorrido</Button>
            </Stack>
          </Card>
          {route && (
            <Card withBorder mt="md">
              <Text fw={600}>Orden de visita</Text>
              <Text size="xs" c="dimmed">Distancia: {(route.distanceM / 1000).toFixed(1)} km{route.durationS ? ` · ${(route.durationS / 60).toFixed(0)} min` : ''} · Proveedor: {route.provider}</Text>
              {order.map((id, i) => (
                <Group key={id} justify="space-between" mt={4}>
                  <Text size="sm">{i + 1}. {byId.get(id)?.code} <Text span c="dimmed" size="xs">{byId.get(id)?.watershed}</Text></Text>
                  <Group gap={2}>
                    <ActionIcon size="sm" variant="subtle" disabled={i === 0} onClick={() => move(i, -1)}><IconArrowUp size={14} /></ActionIcon>
                    <ActionIcon size="sm" variant="subtle" disabled={i === order.length - 1} onClick={() => move(i, 1)}><IconArrowDown size={14} /></ActionIcon>
                  </Group>
                </Group>
              ))}
              {changed && (
                <Stack mt="sm" gap="xs">
                  <TextInput label="Justificación del cambio de orden" required value={justification} onChange={(e) => setJustification(e.currentTarget.value)} />
                  <Button size="xs" onClick={() => reorder.mutate()} loading={reorder.isPending}>Guardar orden final</Button>
                </Stack>
              )}
              {route.warnings?.map((w: string) => <Badge key={w} color="orange" variant="light" mt={6} style={{ whiteSpace: 'normal', height: 'auto' }}>{w}</Badge>)}
            </Card>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <MapView height="65vh" onReady={draw} key={route?.id ?? 'none'} />
        </Grid.Col>
      </Grid>
      <Title order={4}>Rutas registradas</Title>
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Paradas</Table.Th><Table.Th>Distancia</Table.Th><Table.Th>Orden editado</Table.Th><Table.Th>Autor</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{routes.data?.items.map((r: any) => (
          <Table.Tr key={r.id}><Table.Td>{fmtDateTime(r.createdAt)}</Table.Td><Table.Td>{r.name}</Table.Td><Table.Td>{r.structureIdsFinal.length}</Table.Td>
            <Table.Td>{(r.distanceM / 1000).toFixed(1)} km</Table.Td><Table.Td>{r.editJustification ? `Sí — ${r.editJustification}` : 'No'}</Table.Td><Table.Td>{r.createdBy}</Table.Td>
            <Table.Td><Button size="xs" variant="subtle" onClick={() => { setRoute(r); setOrder(r.structureIdsFinal); }}>Ver</Button></Table.Td></Table.Tr>))}</Table.Tbody>
      </Table>
    </Stack>
  );
}
