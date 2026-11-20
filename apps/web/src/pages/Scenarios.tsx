import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Code, Grid, Group, Select, Slider, Stack, Text, Title } from '@mantine/core';
import type { Map as MlMap } from 'maplibre-gl';
import { SCENARIO_LABEL } from '@dique/shared';
import { api } from '../api';
import { MapView, setGeoJson, fitTo } from '../components/MapView';

// Visualizador nivel A: muestra el corredor hipotético por relieve y una animación conceptual del avance.
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
    if (!map.getLayer('zone')) map.addLayer({ id: 'zone', type: 'fill', source: 'zone', paint: { 'fill-color': '#7950f2', 'fill-opacity': 0.18 } });
    setGeoJson(map, 'flow', { type: 'LineString', coordinates: partial(progress) });
    if (!map.getLayer('flow')) map.addLayer({ id: 'flow', type: 'line', source: 'flow', paint: { 'line-color': '#5f3dc4', 'line-width': 5, 'line-opacity': 0.85 } });
    setGeoJson(map, 'origin', { type: 'Point', coordinates: coords[0] });
    if (!map.getLayer('origin')) map.addLayer({ id: 'origin', type: 'circle', source: 'origin', paint: { 'circle-radius': 8, 'circle-color': '#e03131', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    if (exposure.data) {
      setGeoJson(map, 'exp', { ...exposure.data, features: exposure.data.features.filter((f: any) => f.properties.structureId === sc.structure_id) });
      if (!map.getLayer('exp')) map.addLayer({ id: 'exp', type: 'line', source: 'exp', paint: { 'line-color': '#1c7ed6', 'line-width': 1, 'line-dasharray': [1, 1] } });
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

  return (
    <Stack>
      <Title order={2}>Escenarios — visualizador geográfico (nivel A)</Title>
      <Alert color="violet" title={SCENARIO_LABEL}>
        Animación conceptual del corredor que seguiría el material según el relieve si la estructura perdiera contención. No es predicción hidráulica,
        no declara zonas seguras fuera del corredor y no recomienda evacuaciones. Profundidad, velocidad, caudal y tiempo de llegada no se muestran porque
        los datos y el modelo no los soportan.
      </Alert>
      <Grid>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card withBorder>
            <Stack>
              <Select label="Estructura de origen" searchable value={structureId} onChange={(v) => { setStructureId(v); setProgress(100); }}
                data={items.map((i: any) => ({ value: i.structure_id, label: `${i.code} — ${i.structure_name}` }))} />
              {sc && (
                <>
                  <Group gap="xs"><Badge color="violet">{sc.scenario_type}</Badge><Badge variant="outline">Validación: nivel {sc.validation_level}</Badge><Badge color="violet" variant="dot">{sc.data_label}</Badge></Group>
                  <Text size="sm" fw={600}>{sc.name}</Text>
                  <Text size="sm">Longitud del corredor: {(total / 1000).toFixed(2)} km</Text>
                  <Group>
                    <Button size="xs" onClick={() => { if (progress >= 100) setProgress(0); setPlaying(!playing); }}>{playing ? 'Pausar' : 'Reproducir'}</Button>
                    <Button size="xs" variant="default" onClick={() => { setPlaying(false); setProgress(0); }}>Reiniciar</Button>
                  </Group>
                  <Slider value={progress} onChange={setProgress} label={(v) => `${v}% del recorrido`} />
                  <Checkbox label="Zona potencial (corredor ampliado)" checked={showZone} onChange={(e) => setShowZone(e.currentTarget.checked)} />
                  <Checkbox label="Polígono de exposición" checked={showExposure} onChange={(e) => setShowExposure(e.currentTarget.checked)} />
                  <Text size="xs" fw={600}>Parámetros</Text>
                  <Code block>{JSON.stringify(sc.parameters, null, 2)}</Code>
                  <Text size="xs" fw={600}>Limitaciones</Text>
                  <Text size="xs">{sc.limitations}</Text>
                  <Text size="xs" c="dimmed">Motor {sc.engine_version} · Fuentes: {sc.sources}</Text>
                  <Button size="xs" variant="light" onClick={() => {
                    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features: [
                      { type: 'Feature', geometry: sc.corridor, properties: { tipo: 'corredor', escenario: sc.scenario_type, estructura: sc.code, etiqueta: SCENARIO_LABEL } },
                      { type: 'Feature', geometry: sc.zone, properties: { tipo: 'zona', escenario: sc.scenario_type, estructura: sc.code, etiqueta: SCENARIO_LABEL } },
                    ], parametros: sc.parameters, limitaciones: sc.limitations }, null, 2)], { type: 'application/geo+json' });
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `escenario-${sc.code}.geojson`; a.click();
                  }}>Exportar GeoJSON</Button>
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
