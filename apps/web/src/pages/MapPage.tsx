import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Checkbox, Grid, Group, SegmentedControl, Stack, Text, Title, Badge, Alert } from '@mantine/core';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { useNavigate } from 'react-router-dom';
import { STRUCTURE_TYPE_LABELS, type StructureType } from '@dique/shared';
import { api } from '../api';
import { MapView, setGeoJson } from '../components/MapView';
import { PHYSICAL_COLORS, INTERVENTION_COLORS, TYPE_COLORS } from '../components/Labels';

type ColorBy = 'physicalStatus' | 'interventionStatus' | 'structureType';
const PALETTES: Record<ColorBy, Record<string, string>> = {
  physicalStatus: PHYSICAL_COLORS, interventionStatus: INTERVENTION_COLORS, structureType: TYPE_COLORS,
};

function matchExpr(prop: ColorBy): maplibregl.ExpressionSpecification {
  const pal = PALETTES[prop];
  return ['match', ['get', prop], ...Object.entries(pal).flat(), '#333'] as unknown as maplibregl.ExpressionSpecification;
}

export function MapPage() {
  const nav = useNavigate();
  const [colorBy, setColorBy] = useState<ColorBy>('physicalStatus');
  const [layers, setLayers] = useState({ structures: true, mallas: true, cauces: true, exposure: false });
  const mapRef = useRef<MlMap | null>(null);
  const clickBound = useRef(false);
  const structures = useQuery({ queryKey: ['map-structures'], queryFn: () => api('/map/structures.geojson') });
  const reference = useQuery({ queryKey: ['map-reference'], queryFn: () => api('/map/reference.geojson') });
  const exposure = useQuery({ queryKey: ['map-exposure'], queryFn: () => api('/map/exposure.geojson'), enabled: layers.exposure });

  const draw = useCallback((map: MlMap) => {
    mapRef.current = map;
    if (reference.data) {
      setGeoJson(map, 'ref', reference.data);
      if (!map.getLayer('cauces')) map.addLayer({ id: 'cauces', type: 'line', source: 'ref', filter: ['==', ['get', 'layer'], 'cauces_estimados'],
        paint: { 'line-color': '#1c7ed6', 'line-width': 2, 'line-dasharray': [2, 1], 'line-opacity': 0.7 } });
      if (!map.getLayer('mallas')) map.addLayer({ id: 'mallas', type: 'circle', source: 'ref', filter: ['==', ['get', 'layer'], 'mallas_documentadas'],
        paint: { 'circle-radius': 5, 'circle-color': '#ae3ec9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
    }
    if (exposure.data) {
      setGeoJson(map, 'exposure', exposure.data);
      if (!map.getLayer('exposure')) map.addLayer({ id: 'exposure', type: 'fill', source: 'exposure',
        paint: { 'fill-color': '#4dabf7', 'fill-opacity': 0.08, 'fill-outline-color': '#1c7ed6' } }, map.getLayer('cauces') ? 'cauces' : undefined);
    }
    if (structures.data) {
      setGeoJson(map, 'structures', structures.data);
      if (!map.getLayer('structures')) {
        map.addLayer({ id: 'structures', type: 'circle', source: 'structures', paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 9],
          'circle-color': matchExpr(colorBy),
          'circle-stroke-color': ['case', ['==', ['get', 'locationLabel'], 'Documentado'], '#000', '#fff'],
          'circle-stroke-width': 1.5,
        } });
      }
      if (!clickBound.current) {
        clickBound.current = true;
        map.on('click', 'structures', (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as Record<string, string>;
          const html = `<b>${p.code}</b><br/>${p.name}<br/>Estado físico: ${p.physicalStatus}<br/>Intervención: ${p.interventionStatus}`
            + `<br/>Ubicación: ${p.locationLabel}${p.p && p.p !== 'null' ? `<br/>P = ${Number(p.p).toFixed(3)}` : '<br/>P: sin cálculo'}`
            + `<br/><a href="/inventario/${p.id}" data-id="${p.id}">Ver ficha →</a>`;
          const popup = new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
          popup.getElement().querySelector('a')?.addEventListener('click', (ev) => { ev.preventDefault(); nav(`/inventario/${p.id}`); });
        });
        map.on('mouseenter', 'structures', () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'structures', () => { map.getCanvas().style.cursor = ''; });
      }
    }
    applyVisibility(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structures.data, reference.data, exposure.data]);

  const applyVisibility = (map: MlMap) => {
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('structures', layers.structures); vis('mallas', layers.mallas); vis('cauces', layers.cauces); vis('exposure', layers.exposure);
  };

  useEffect(() => { if (mapRef.current) applyVisibility(mapRef.current); /* eslint-disable-next-line */ }, [layers]);
  useEffect(() => {
    const m = mapRef.current;
    if (m?.getLayer('structures')) m.setPaintProperty('structures', 'circle-color', matchExpr(colorBy));
  }, [colorBy]);

  const legend = PALETTES[colorBy];
  return (
    <Stack>
      <Title order={2}>Mapa</Title>
      <Alert color="orange" variant="light">
        Los puntos con borde blanco tienen ubicación <b>estimada</b>; con borde negro, <b>documentada</b>. Las mallas (morado) tienen coordenadas
        documentadas (IT 039-2024-MAHR). Los cauces se derivan del relieve (DEM ~30 m).
      </Alert>
      <Grid>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <MapView height="72vh" onReady={draw} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder>
            <Stack gap="xs">
              <Text fw={600}>Colorear estructuras por</Text>
              <SegmentedControl orientation="vertical" value={colorBy} onChange={(v) => setColorBy(v as ColorBy)} data={[
                { value: 'physicalStatus', label: 'Estado físico' },
                { value: 'interventionStatus', label: 'Estado de intervención' },
                { value: 'structureType', label: 'Tipo' }]} />
              <Text fw={600} mt="sm">Leyenda</Text>
              {Object.entries(legend).map(([k, c]) => (
                <Group key={k} gap={6}><span style={{ width: 12, height: 12, borderRadius: 6, background: c, display: 'inline-block' }} />
                  <Text size="sm">{colorBy === 'structureType' ? STRUCTURE_TYPE_LABELS[k as StructureType] : k}</Text></Group>
              ))}
              <Text fw={600} mt="sm">Capas</Text>
              <Checkbox label={`Estructuras (${structures.data?.features.length ?? '…'})`} checked={layers.structures} onChange={(e) => setLayers({ ...layers, structures: e.currentTarget.checked })} />
              <Checkbox label="Mallas dinámicas documentadas" checked={layers.mallas} onChange={(e) => setLayers({ ...layers, mallas: e.currentTarget.checked })} />
              <Checkbox label="Cauces estimados (relieve)" checked={layers.cauces} onChange={(e) => setLayers({ ...layers, cauces: e.currentTarget.checked })} />
              <Checkbox label="Zonas de exposición (estimadas)" checked={layers.exposure} onChange={(e) => setLayers({ ...layers, exposure: e.currentTarget.checked })} />
              <Badge variant="light" color="gray" mt="sm">Viviendas, colegios y vías: ver mapa base</Badge>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
