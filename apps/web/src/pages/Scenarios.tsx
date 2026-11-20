import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Grid, Group, List, MultiSelect, Select, Slider, Stack, Table, Text } from '@mantine/core';
import { IconDownload, IconPlayerPause, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import type { Map as MlMap } from 'maplibre-gl';
import { SCENARIO_LABEL } from '@dique/shared';
import { api } from '../api';
import { MapView, setGeoJson, fitTo } from '../components/MapView';
import { PageHeader } from '../components/Help';

// Simulador de huaico (visualización geográfica): por dónde bajaría el material según la forma del terreno.
// Con varios diques, cada recorrido se calcula por separado (no simula un efecto en cadena).
// No calcula hidráulica: no muestra profundidad, velocidad, caudal ni tiempo de llegada.

const COLORS = ['#5f3dc4', '#e8590c', '#1c7ed6', '#2b8a3e', '#c2255c', '#f08c00', '#0c8599', '#862e9c', '#5c940d', '#495057'];
const MAX = 10;

function lengthsOf(coords: Array<[number, number]>) {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1]; const [x2, y2] = coords[i];
    out.push(out[i - 1] + Math.hypot((x2 - x1) * 111320 * Math.cos((y1 * Math.PI) / 180), (y2 - y1) * 110540));
  }
  return out;
}

export function ScenariosPage() {
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [showZone, setShowZone] = useState(true);
  const [showExposure, setShowExposure] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const drawn = useRef<string[]>([]);
  const list = useQuery({ queryKey: ['scenarios-all'], queryFn: () => api('/scenarios') });
  const exposure = useQuery({ queryKey: ['map-exposure'], queryFn: () => api('/map/exposure.geojson') });
  const items: any[] = list.data?.items ?? [];
  const watersheds = useMemo(() => [...new Set(items.map((i) => i.structure_name.split('quebrada ').pop() as string))].sort(), [items]);

  const chosen = useMemo(() => selected.map((id, k) => {
    const sc = items.find((i) => i.structure_id === id);
    if (!sc) return null;
    const coords: Array<[number, number]> = sc.corridor?.coordinates?.[0] ?? [];
    const cum = lengthsOf(coords);
    const exp = exposure.data?.features.find((f: any) => f.properties.structureId === id);
    return { id, sc, coords, cum, total: cum[cum.length - 1] ?? 0, color: COLORS[k % COLORS.length], n: exp ? Math.round(Number(exp.properties.n)) : null };
  }).filter(Boolean) as Array<{ id: string; sc: any; coords: Array<[number, number]>; cum: number[]; total: number; color: string; n: number | null }>, [selected, items, exposure.data]);

  const partial = (c: { coords: Array<[number, number]>; cum: number[]; total: number }, pct: number) => {
    const target = (c.total * pct) / 100;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < c.coords.length; i++) { if (c.cum[i] <= target) out.push(c.coords[i]); else break; }
    return out.length < 2 && c.coords.length >= 2 ? c.coords.slice(0, 2) : out;
  };

  const draw = useCallback((map: MlMap) => {
    mapRef.current = map;
    // Quitar capas de diques que ya no están elegidos
    for (const id of drawn.current) {
      if (!selected.includes(id)) {
        for (const l of [`zone-${id}`, `flow-${id}`, `origin-${id}`, `exp-${id}`]) if (map.getLayer(l)) map.removeLayer(l);
        for (const src of [`zone-${id}`, `flow-${id}`, `origin-${id}`, `exp-${id}`]) if (map.getSource(src)) map.removeSource(src);
      }
    }
    const all: Array<[number, number]> = [];
    for (const c of chosen) {
      const id = c.id;
      setGeoJson(map, `zone-${id}`, c.sc.zone);
      if (!map.getLayer(`zone-${id}`)) map.addLayer({ id: `zone-${id}`, type: 'fill', source: `zone-${id}`, paint: { 'fill-color': c.color, 'fill-opacity': 0.18 } });
      map.setPaintProperty(`zone-${id}`, 'fill-color', c.color);
      setGeoJson(map, `flow-${id}`, { type: 'LineString', coordinates: partial(c, progress) });
      if (!map.getLayer(`flow-${id}`)) map.addLayer({ id: `flow-${id}`, type: 'line', source: `flow-${id}`, paint: { 'line-color': c.color, 'line-width': 5, 'line-opacity': 0.9 } });
      map.setPaintProperty(`flow-${id}`, 'line-color', c.color);
      setGeoJson(map, `origin-${id}`, { type: 'Point', coordinates: c.coords[0] });
      if (!map.getLayer(`origin-${id}`)) map.addLayer({ id: `origin-${id}`, type: 'circle', source: `origin-${id}`, paint: { 'circle-radius': 7, 'circle-color': c.color, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
      if (exposure.data) {
        setGeoJson(map, `exp-${id}`, { ...exposure.data, features: exposure.data.features.filter((f: any) => f.properties.structureId === id) });
        if (!map.getLayer(`exp-${id}`)) map.addLayer({ id: `exp-${id}`, type: 'line', source: `exp-${id}`, paint: { 'line-color': c.color, 'line-width': 1.5, 'line-dasharray': [1, 1] } });
      }
      all.push(...c.coords);
    }
    drawn.current = [...selected];
    applyVisibility(map);
    if (all.length) fitTo(map, all, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  const applyVisibility = (m: MlMap) => {
    for (const c of chosen) {
      if (m.getLayer(`zone-${c.id}`)) m.setLayoutProperty(`zone-${c.id}`, 'visibility', showZone ? 'visible' : 'none');
      if (m.getLayer(`exp-${c.id}`)) m.setLayoutProperty(`exp-${c.id}`, 'visibility', showExposure ? 'visible' : 'none');
    }
  };
  useEffect(() => { if (mapRef.current) applyVisibility(mapRef.current); /* eslint-disable-next-line */ }, [showZone, showExposure]);
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    for (const c of chosen) if (m.getSource(`flow-${c.id}`)) setGeoJson(m, `flow-${c.id}`, { type: 'LineString', coordinates: partial(c, progress) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setProgress((p) => { if (p >= 100) { setPlaying(false); return 100; } return p + 2; }), 80);
    return () => clearInterval(t);
  }, [playing]);

  const addWatershed = (w: string | null) => {
    if (!w) return;
    const ids = items.filter((i) => i.structure_name.endsWith(`quebrada ${w}`)).map((i) => i.structure_id);
    setSelected((s) => [...new Set([...s, ...ids])].slice(0, MAX));
    setProgress(100);
  };

  const exportGeoJson = () => {
    const features = chosen.flatMap((c) => [
      { type: 'Feature', geometry: c.sc.corridor, properties: { tipo: 'recorrido', estructura: c.sc.code, aviso: SCENARIO_LABEL } },
      { type: 'Feature', geometry: c.sc.zone, properties: { tipo: 'zona', estructura: c.sc.code, aviso: SCENARIO_LABEL } },
    ]);
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features, limitaciones: chosen[0]?.sc.limitations }, null, 2)], { type: 'application/geo+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'simulacion-huaico.geojson'; a.click();
  };

  return (
    <Stack>
      <PageHeader title="Simulador de huaico"
        description="Muestra por dónde podría bajar el lodo y las piedras si uno o varios diques dejaran de contenerlos, siguiendo la forma del terreno hasta el río Rímac."
        steps={['Elige uno o varios diques (hasta 10), o agrega todos los de una quebrada.', 'Presiona "Reproducir" para ver los recorridos animados.', 'Activa "Viviendas en la zona" para ver las áreas con personas expuestas.']} />
      <Alert color="violet" variant="light" title={SCENARIO_LABEL}>
        Es una simulación aproximada para apoyar la planificación. No predice cuándo ocurrirá un huaico, ni su profundidad o velocidad, y no reemplaza
        las alertas oficiales. Estar fuera de la zona marcada no significa estar a salvo. Con varios diques, cada recorrido se calcula por separado: no
        representa un efecto en cadena.
      </Alert>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack>
              <MultiSelect label="Diques" placeholder={selected.length ? '' : 'Elige uno o varios diques'} searchable clearable maxValues={MAX}
                value={selected} onChange={(v) => { setSelected(v); setProgress(100); }}
                data={items.map((i) => ({ value: i.structure_id, label: `${i.code} · ${i.structure_name}` }))} />
              <Select placeholder="Agregar todos los de una quebrada" data={watersheds} value={null} onChange={addWatershed} clearable />
              {chosen.length > 0 && (
                <>
                  <Group>
                    <Button leftSection={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                      onClick={() => { if (progress >= 100) setProgress(0); setPlaying(!playing); }}>{playing ? 'Pausar' : 'Reproducir'}</Button>
                    <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => { setPlaying(false); setProgress(0); }}>Reiniciar</Button>
                  </Group>
                  <div>
                    <Text size="xs" c="dimmed">Avance de los recorridos</Text>
                    <Slider value={progress} onChange={setProgress} label={(v) => `${v}%`} />
                  </div>
                  <Table withRowBorders={false} verticalSpacing={4}>
                    <Table.Thead><Table.Tr><Table.Th>Dique</Table.Th><Table.Th>Hasta el río</Table.Th><Table.Th>Personas (aprox.)</Table.Th></Table.Tr></Table.Thead>
                    <Table.Tbody>{chosen.map((c) => (
                      <Table.Tr key={c.id}>
                        <Table.Td><Group gap={6} wrap="nowrap"><span style={{ width: 12, height: 12, borderRadius: 6, background: c.color, display: 'inline-block' }} /><Text size="sm">{c.sc.code}</Text></Group></Table.Td>
                        <Table.Td><Text size="sm">{(c.total / 1000).toFixed(2)} km</Text></Table.Td>
                        <Table.Td><Text size="sm">{c.n ?? '-'}</Text></Table.Td>
                      </Table.Tr>))}</Table.Tbody>
                  </Table>
                  {chosen.length > 1 && <Text size="xs" c="dimmed">Las personas no se suman: las zonas de varios diques suelen superponerse y una misma vivienda puede estar en varias.</Text>}
                  <Checkbox label="Zona que podría verse afectada" checked={showZone} onChange={(e) => setShowZone(e.currentTarget.checked)} />
                  <Checkbox label="Viviendas en la zona (personas expuestas)" checked={showExposure} onChange={(e) => setShowExposure(e.currentTarget.checked)} />
                  <div>
                    <Text size="xs" fw={600}>Cómo se calculó</Text>
                    <List size="xs" spacing={2}>
                      <List.Item>Se siguió la pendiente del terreno desde cada dique hasta el río, usando un modelo de relieve satelital con detalle de unos 30 metros.</List.Item>
                      <List.Item>La zona marcada abarca unos 35 m a cada lado del recorrido y 70 m en la parte baja, donde el material se esparce.</List.Item>
                      <List.Item>Para un estudio de ingeniería se necesitan mediciones topográficas detalladas y la revisión de un especialista.</List.Item>
                    </List>
                  </div>
                  <Group gap="xs"><Badge color="violet" variant="light">Simulación aproximada</Badge></Group>
                  <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={exportGeoJson}>Descargar mapa (GeoJSON)</Button>
                </>
              )}
            </Stack>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <div style={{ position: 'relative' }}>
            <MapView height="72vh" onReady={draw} />
            {chosen.length > 0 && <Badge size="lg" color="violet" style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>{SCENARIO_LABEL}</Badge>}
          </div>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
