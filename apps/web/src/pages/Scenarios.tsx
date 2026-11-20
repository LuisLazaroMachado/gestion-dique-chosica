import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Grid, Group, Select, Slider, Stack, Text, List } from '@mantine/core';
import { IconPlayerPause, IconPlayerPlay, IconRefresh, IconDownload } from '@tabler/icons-react';
import type { Map as MlMap } from 'maplibre-gl';
import { SCENARIO_LABEL } from '@dique/shared';
import { api } from '../api';
import { MapView, setGeoJson, fitTo } from '../components/MapView';
import { PageHeader } from '../components/Help';

// Simulador de huaico (visualización geográfica): muestra por dónde bajaría el material según la forma del terreno.
// No calcula hidráulica: no muestra profundidad, velocidad, caudal ni tiempo de llegada.

function cumulative(coords: Array<[number, number]>) {
  const out = [0];
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1]; const [x2, y2] = coords[i];
    const dx = (x2 - x1) * 111320 * Math.cos((y1 * Math.PI) / 180); const dy = (y2 - y1) * 110540;
    out.push(out[i - 1] + Math.hypot(dx, dy));
  }
  return out;
}

export function ScenariosPage() {
  const [structureId, setStructureId] = useState<string | null>(null);
  const [progress, setProgress] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [showZone, setShowZone] = useState(true);
  const [showExposure, setShowExposure] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const list = useQuery({ queryKey: ['scenarios-all'], queryFn: () => api('/scenarios') });
  const exposure = useQuery({ queryKey: ['map-exposure'], queryFn: () => api('/map/exposure.geojson') });
  const items = list.data?.items ?? [];
  const sc = items.find((i: any) => i.structure_id === structureId) ?? null;
  const coords: Array<[number, number]> = sc?.corridor?.coordinates?.[0] ?? [];
  const cum = cumulative(coords);
  const total = cum[cum.length - 1] ?? 0;
  const exp = exposure.data?.features.find((f: any) => f.properties.structureId === structureId);

  const partial = useCallback((pct: number) => {
    const target = (total * pct) / 100;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < coords.length; i++) { if (cum[i] <= target) out.push(coords[i]); else break; }
    if (out.length < 2 && coords.length >= 2) return coords.slice(0, 2);
    return out;
  }, [coords, cum, total]);

  const draw = useCallback((map: MlMap) => {
    mapRef.current = map;
    if (!sc) return;
    setGeoJson(map, 'zone', sc.zone);
    if (!map.getLayer('zone')) map.addLayer({ id: 'zone', type: 'fill', source: 'zone', paint: { 'fill-color': '#7950f2', 'fill-opacity': 0.2 } });
    setGeoJson(map, 'flow', { type: 'LineString', coordinates: partial(progress) });
    if (!map.getLayer('flow')) map.addLayer({ id: 'flow', type: 'line', source: 'flow', paint: { 'line-color': '#5f3dc4', 'line-width': 6, 'line-opacity': 0.9 } });
    setGeoJson(map, 'origin', { type: 'Point', coordinates: coords[0] });
    if (!map.getLayer('origin')) map.addLayer({ id: 'origin', type: 'circle', source: 'origin', paint: { 'circle-radius': 9, 'circle-color': '#e03131', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    if (exposure.data) {
      setGeoJson(map, 'exp', { ...exposure.data, features: exposure.data.features.filter((f: any) => f.properties.structureId === sc.structure_id) });
      if (!map.getLayer('exp')) map.addLayer({ id: 'exp', type: 'line', source: 'exp', paint: { 'line-color': '#1c7ed6', 'line-width': 1.5, 'line-dasharray': [1, 1] } });
    }
    fitTo(map, coords, 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc, exposure.data]);

  useEffect(() => {
    const m = mapRef.current; if (!m || !sc) return;
    setGeoJson(m, 'flow', { type: 'LineString', coordinates: partial(progress) });
  }, [progress, partial, sc]);
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    if (m.getLayer('zone')) m.setLayoutProperty('zone', 'visibility', showZone ? 'visible' : 'none');
    if (m.getLayer('exp')) m.setLayoutProperty('exp', 'visibility', showExposure ? 'visible' : 'none');
  }, [showZone, showExposure, sc]);
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setProgress((p) => { if (p >= 100) { setPlaying(false); return 100; } return p + 2; }), 80);
    return () => clearInterval(t);
  }, [playing]);

  const exportGeoJson = () => {
    if (!sc) return;
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: [
      { type: 'Feature', geometry: sc.corridor, properties: { tipo: 'recorrido', estructura: sc.code, aviso: SCENARIO_LABEL } },
      { type: 'Feature', geometry: sc.zone, properties: { tipo: 'zona', estructura: sc.code, aviso: SCENARIO_LABEL } },
    ], parametros: sc.parameters, limitaciones: sc.limitations }, null, 2)], { type: 'application/geo+json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `simulacion-${sc.code}.geojson`; a.click();
  };

  return (
    <Stack>
      <PageHeader title="Simulador de huaico"
        description="Muestra por dónde podría bajar el lodo y las piedras si un dique dejara de contenerlos, siguiendo la forma del terreno hasta el río Rímac."
        steps={['Elige un dique.', 'Presiona "Reproducir" para ver el recorrido animado.', 'Activa "Viviendas en la zona" para ver el área con personas expuestas.']} />
      <Alert color="violet" variant="light" title={SCENARIO_LABEL}>
        Es una simulación aproximada para apoyar la planificación. No predice cuándo ocurrirá un huaico, ni su profundidad o velocidad, y no reemplaza
        las alertas oficiales. Estar fuera de la zona marcada no significa estar a salvo.
      </Alert>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack>
              <Select label="Dique" placeholder="Elige un dique" searchable value={structureId} onChange={(v) => { setStructureId(v); setProgress(100); }}
                data={items.map((i: any) => ({ value: i.structure_id, label: `${i.code} · ${i.structure_name}` }))} />
              {sc && (
                <>
                  <Group>
                    <Button leftSection={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                      onClick={() => { if (progress >= 100) setProgress(0); setPlaying(!playing); }}>{playing ? 'Pausar' : 'Reproducir'}</Button>
                    <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => { setPlaying(false); setProgress(0); }}>Reiniciar</Button>
                  </Group>
                  <div>
                    <Text size="xs" c="dimmed">Avance del recorrido</Text>
                    <Slider value={progress} onChange={setProgress} label={(v) => `${v}%`} />
                  </div>
                  <Card withBorder bg="gray.0" p="sm">
                    <Text size="sm">Recorrido hasta el río: <b>{(total / 1000).toFixed(2)} km</b></Text>
                    {exp && <Text size="sm">Personas en la zona (aprox.): <b>{Math.round(Number(exp.properties.n))}</b></Text>}
                  </Card>
                  <Checkbox label="Zona que podría verse afectada" checked={showZone} onChange={(e) => setShowZone(e.currentTarget.checked)} />
                  <Checkbox label="Viviendas en la zona (personas expuestas)" checked={showExposure} onChange={(e) => setShowExposure(e.currentTarget.checked)} />
                  <div>
                    <Text size="xs" fw={600}>Cómo se calculó</Text>
                    <List size="xs" spacing={2}>
                      <List.Item>Se siguió la pendiente del terreno desde el dique hasta el río, usando un modelo de relieve satelital con detalle de unos 30 metros.</List.Item>
                      <List.Item>La zona marcada abarca unos {sc.parameters?.ancho_tramo_m ?? 35} m a cada lado del recorrido y {sc.parameters?.ancho_abanico_m ?? 70} m en la parte baja, donde el material se esparce.</List.Item>
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
            <MapView height="70vh" onReady={draw} />
            {sc && <Badge size="lg" color="violet" style={{ position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', zIndex: 2 }}>{SCENARIO_LABEL}</Badge>}
          </div>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
