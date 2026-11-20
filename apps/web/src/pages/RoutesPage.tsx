import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Grid, Group, Loader, MultiSelect, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { IconGripVertical } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { api, ApiError, type Structure } from '../api';
import { MapView, setGeoJson, fitTo } from '../components/MapView';
import { fmtDateTime } from '../components/Labels';
import { PageHeader } from '../components/Help';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));
const km = (m?: number | null) => (m == null ? '-' : `${(m / 1000).toFixed(1)} km`);
const mins = (s?: number | null) => (s == null ? null : s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);

interface View { geometry: any; distanceM: number; durationS: number | null; provider: string; warnings: string[] }

export function RoutesPage() {
  const qc = useQueryClient();
  const [selection, setSelection] = useState<string[]>([]);
  const [name, setName] = useState('Recorrido de maquinaria');
  const [machinery, setMachinery] = useState('');
  const [route, setRoute] = useState<any | null>(null);       // ruta guardada
  const [order, setOrder] = useState<string[]>([]);           // orden en pantalla
  const [view, setView] = useState<View | null>(null);        // geometría mostrada (propuesta o vista previa)
  const [previewing, setPreviewing] = useState(false);
  const [justification, setJustification] = useState('');
  const dragFrom = useRef<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const structures = useQuery({ queryKey: ['structures'], queryFn: () => api<{ items: Structure[] }>('/structures') });
  const routes = useQuery({ queryKey: ['routes'], queryFn: () => api('/routes') });
  const base = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const baseInfo = base.data?.items.find((s: any) => s.key === 'base_central')?.value;
  const byId = new Map((structures.data?.items ?? []).map((s) => [s.id, s]));

  const openRoute = (r: any) => {
    setRoute(r); setOrder(r.structureIdsFinal); setJustification('');
    setView({ geometry: r.geometry, distanceM: r.distanceM, durationS: r.durationS, provider: r.provider, warnings: r.warnings ?? [] });
  };

  const calc = useMutation({
    mutationFn: () => api('/routes', { body: { name, structureIds: selection, machinery: machinery || null } }),
    onSuccess: (r: any) => { openRoute(r); qc.invalidateQueries({ queryKey: ['routes'] }); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const save = useMutation({
    mutationFn: () => api(`/routes/${route.id}/order`, { method: 'PATCH', body: { structureIdsFinal: order, justification } }),
    onSuccess: (r: any) => { openRoute(r); notifications.show({ color: 'green', message: 'Orden guardado. El orden que propuso el sistema también queda registrado.' }); qc.invalidateQueries({ queryKey: ['routes'] }); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });

  // Al cambiar el orden, el mapa se recalcula de inmediato (vista previa, sin guardar).
  const changed = route && order.join() !== route.structureIdsFinal.join();
  useEffect(() => {
    if (!route || !changed) return;
    const t = setTimeout(async () => {
      setPreviewing(true);
      try {
        const p = await api('/routes/preview', { body: { structureIds: order } });
        setView({ geometry: p.geometry, distanceM: p.distanceM, durationS: p.durationS, provider: p.provider, warnings: p.warnings });
      } catch (e) { notifications.show({ color: 'red', message: errMsg(e) }); }
      setPreviewing(false);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const draw = useCallback((map: MlMap) => {
    mapRef.current = map;
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    if (!view) return;
    setGeoJson(map, 'route', view.geometry);
    if (!map.getLayer('route')) {
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', paint: { 'line-color': '#fff', 'line-width': 8 } });
      map.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#e8590c', 'line-width': 5 } });
    }
    const mk = (lon: number, lat: number, label: string, color: string, title: string) => {
      const el = document.createElement('div');
      el.textContent = label;
      el.title = title;
      Object.assign(el.style, { background: color, color: '#fff', borderRadius: '14px', minWidth: '26px', height: '26px', padding: '0 6px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '13px', border: '2px solid #fff',
        boxShadow: '0 1px 4px rgba(0,0,0,.4)' });
      markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
    };
    const b = route?.base ?? baseInfo;
    if (b?.lat != null) mk(b.lon, b.lat, 'Base', '#2b8a3e', 'Base de la maquinaria');
    order.forEach((id, i) => {
      const s = byId.get(id);
      if (s?.location) mk(s.location.lon, s.location.lat, String(i + 1), '#1c4f82', `${i + 1}. ${s.code}`);
    });
    const coords = view.geometry?.coordinates as Array<[number, number]>;
    if (coords?.length) fitTo(map, coords);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, structures.data, order]);

  // Arrastrar y soltar para reordenar
  const onDrop = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null; setDragOver(null);
    if (from == null || from === to) return;
    const o = [...order];
    const [item] = o.splice(from, 1);
    o.splice(to, 0, item);
    setOrder(o);
  };

  return (
    <Stack>
      <PageHeader title="Rutas de maquinaria"
        description="Planifica el recorrido de la maquinaria por varias estructuras, saliendo y volviendo a la base."
        steps={[
          'Elige las estructuras que la maquinaria debe visitar.',
          'Presiona "Calcular recorrido": el sistema propone el orden más corto por las calles.',
          'Si prefieres otro orden, arrastra las estructuras en la lista. El mapa se actualiza al instante.',
          'Si cambiaste el orden, escribe el motivo y guárdalo.',
        ]} />
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack>
              <MultiSelect label="1. Estructuras a visitar" searchable maxDropdownHeight={280} placeholder="Busca por código o quebrada"
                data={(structures.data?.items ?? []).filter((s) => s.location).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
                value={selection} onChange={setSelection} />
              <TextInput label="Nombre del recorrido" value={name} onChange={(e) => setName(e.currentTarget.value)} />
              <TextInput label="Maquinaria (opcional)" placeholder="Ej.: retroexcavadora" value={machinery} onChange={(e) => setMachinery(e.currentTarget.value)} />
              <Button onClick={() => calc.mutate()} loading={calc.isPending} disabled={!selection.length}>2. Calcular recorrido</Button>
              {baseInfo?.name && <Text size="xs" c="dimmed">Sale y vuelve a: {baseInfo.name}</Text>}
            </Stack>
          </Card>

          {route && view && (
            <Card withBorder mt="md">
              <Group justify="space-between">
                <Text fw={600}>Orden de visita</Text>
                {previewing && <Loader size="xs" />}
              </Group>
              <Text size="sm" mt={2}>Distancia total: <b>{km(view.distanceM)}</b>{mins(view.durationS) ? <> · Tiempo estimado en camión: <b>{mins(view.durationS)}</b></> : null}</Text>
              {view.provider === 'linea_recta' && <Text size="xs" c="orange">Sin conexión al servicio de calles: se muestran líneas rectas.</Text>}
              <Text size="xs" c="dimmed" mt={6} mb={4}>Arrastra para cambiar el orden:</Text>
              <Paper withBorder p={4} radius="md" bg="gray.0">
                <Group gap={6} p={6}><Badge color="green" variant="filled">Base</Badge><Text size="sm">Salida</Text></Group>
                {order.map((id, i) => {
                  const s = byId.get(id);
                  return (
                    <Paper key={id} draggable withBorder p={6} my={4} radius="sm"
                      onDragStart={() => { dragFrom.current = i; }}
                      onDragOver={(e) => { e.preventDefault(); setDragOver(i); }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={() => onDrop(i)}
                      style={{ cursor: 'grab', borderColor: dragOver === i ? '#1c7ed6' : undefined, background: dragOver === i ? '#e7f5ff' : '#fff' }}>
                      <Group gap={8} wrap="nowrap">
                        <IconGripVertical size={16} color="#868e96" />
                        <Badge circle size="lg" color="blue">{i + 1}</Badge>
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" fw={600}>{s?.code}</Text>
                          <Text size="xs" c="dimmed" truncate>{s?.name}</Text>
                        </div>
                      </Group>
                    </Paper>
                  );
                })}
                <Group gap={6} p={6}><Badge color="green" variant="filled">Base</Badge><Text size="sm">Regreso</Text></Group>
              </Paper>
              {changed && (
                <Stack mt="sm" gap="xs">
                  <TextInput label="¿Por qué cambias el orden?" placeholder="Ej.: primero la más urgente" required value={justification} onChange={(e) => setJustification(e.currentTarget.value)} />
                  <Group>
                    <Button size="xs" onClick={() => save.mutate()} loading={save.isPending} disabled={justification.trim().length < 3}>Guardar este orden</Button>
                    <Button size="xs" variant="default" onClick={() => openRoute(route)}>Volver al orden anterior</Button>
                  </Group>
                </Stack>
              )}
              {view.warnings?.length > 0 && (
                <Alert color="yellow" variant="light" mt="sm" p="xs" title="Antes de salir">
                  {view.warnings.map((w) => <Text key={w} size="xs">• {w}</Text>)}
                </Alert>
              )}
            </Card>
          )}
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <MapView height="70vh" onReady={draw} />
        </Grid.Col>
      </Grid>

      <Text fw={600} mt="md">Recorridos guardados</Text>
      <Table striped highlightOnHover>
        <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Paradas</Table.Th><Table.Th>Distancia</Table.Th><Table.Th>¿Se cambió el orden?</Table.Th><Table.Th>Creado por</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{routes.data?.items.map((r: any) => (
          <Table.Tr key={r.id}>
            <Table.Td>{fmtDateTime(r.createdAt)}</Table.Td><Table.Td>{r.name}</Table.Td><Table.Td>{r.structureIdsFinal.length}</Table.Td>
            <Table.Td>{km(r.distanceM)}</Table.Td><Table.Td>{r.editJustification ? `Sí: ${r.editJustification}` : 'No'}</Table.Td><Table.Td>{r.createdBy}</Table.Td>
            <Table.Td><Button size="xs" variant="subtle" onClick={() => openRoute(r)}>Ver en el mapa</Button></Table.Td>
          </Table.Tr>))}</Table.Tbody>
      </Table>
    </Stack>
  );
}
