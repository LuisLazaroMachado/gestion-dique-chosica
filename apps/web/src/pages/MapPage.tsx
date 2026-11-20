import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Checkbox, Divider, Grid, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import maplibregl, { type Map as MlMap } from 'maplibre-gl';
import { useNavigate } from 'react-router-dom';
import { MACHINERY_ACCESS_COLORS, MACHINERY_ACCESS_LABELS, STRUCTURE_TYPE_LABELS, type StructureType } from '@dique/shared';
import { api } from '../api';
import { MapView, setGeoJson } from '../components/MapView';
import { PHYSICAL_COLORS, INTERVENTION_COLORS, TYPE_COLORS } from '../components/Labels';
import { PageHeader } from '../components/Help';

type ColorBy = 'physicalStatus' | 'interventionStatus' | 'structureType' | 'machineryAccess';
const PALETTES: Record<ColorBy, Record<string, string>> = {
  physicalStatus: PHYSICAL_COLORS, interventionStatus: INTERVENTION_COLORS, structureType: TYPE_COLORS,
  machineryAccess: { ...MACHINERY_ACCESS_COLORS, 'Sin dato': '#ced4da' },
};

function matchExpr(prop: ColorBy): maplibregl.ExpressionSpecification {
  const pal = PALETTES[prop];
  return ['match', ['get', prop], ...Object.entries(pal).flat(), '#333'] as unknown as maplibregl.ExpressionSpecification;
}

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function Dot({ color, border = '#fff' }: { color: string; border?: string }) {
  return <span style={{ width: 14, height: 14, borderRadius: 7, background: color, border: `2px solid ${border}`, boxShadow: '0 0 0 1px #ced4da', display: 'inline-block' }} />;
}

export function MapPage() {
  const nav = useNavigate();
  const [colorBy, setColorBy] = useState<ColorBy>('physicalStatus');
  const [layers, setLayers] = useState({ structures: true, mallas: true, cauces: true, exposure: false });
  const mapRef = useRef<MlMap | null>(null);
  const bound = useRef(false);
  const structures = useQuery({ queryKey: ['map-structures'], queryFn: () => api('/map/structures.geojson') });
  const reference = useQuery({ queryKey: ['map-reference'], queryFn: () => api('/map/reference.geojson') });
  const exposure = useQuery({ queryKey: ['map-exposure'], queryFn: () => api('/map/exposure.geojson'), enabled: layers.exposure });

  const applyVisibility = (map: MlMap) => {
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('structures', layers.structures); vis('mallas', layers.mallas); vis('cauces', layers.cauces); vis('exposure', layers.exposure);
  };

  const draw = useCallback((map: MlMap) => {
    mapRef.current = map;
    if (reference.data) {
      setGeoJson(map, 'ref', reference.data);
      if (!map.getLayer('cauces')) map.addLayer({ id: 'cauces', type: 'line', source: 'ref', filter: ['==', ['get', 'layer'], 'cauces_estimados'],
        paint: { 'line-color': '#1c7ed6', 'line-width': 3, 'line-dasharray': [2, 1], 'line-opacity': 0.75 } });
      if (!map.getLayer('mallas')) map.addLayer({ id: 'mallas', type: 'circle', source: 'ref', filter: ['==', ['get', 'layer'], 'mallas_documentadas'],
        paint: { 'circle-radius': 6, 'circle-color': '#ae3ec9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    }
    if (exposure.data) {
      setGeoJson(map, 'exposure', exposure.data);
      if (!map.getLayer('exposure')) map.addLayer({ id: 'exposure', type: 'fill', source: 'exposure',
        paint: { 'fill-color': '#4dabf7', 'fill-opacity': 0.1, 'fill-outline-color': '#1c7ed6' } }, map.getLayer('cauces') ? 'cauces' : undefined);
    }
    if (structures.data) {
      setGeoJson(map, 'structures', structures.data);
      if (!map.getLayer('structures')) {
        map.addLayer({ id: 'structures', type: 'circle', source: 'structures', paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 16, 10],
          'circle-color': matchExpr(colorBy),
          'circle-stroke-color': ['case', ['==', ['get', 'locationLabel'], 'Documentado'], '#000', '#fff'],
          'circle-stroke-width': 2,
        } });
      }
    }
    if (!bound.current) {
      bound.current = true;
      const pointer = (id: string) => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      };
      ['structures', 'mallas', 'cauces', 'exposure'].forEach(pointer);
      map.on('click', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['structures', 'mallas', 'cauces', 'exposure'].filter((l) => map.getLayer(l)) })[0];
        if (!f) return;
        const p = f.properties as Record<string, any>;
        let html = '';
        if (f.layer.id === 'structures') {
          const prio = p.p && p.p !== 'null' ? `<br/>Prioridad: <b>${Number(p.p).toFixed(2)}</b>` : '<br/>Prioridad: falta información';
          html = `<b>${esc(p.code)}</b><br/>${esc(p.name)}<br/>Estado: ${esc(p.physicalStatus)}<br/>Trabajos: ${esc(p.interventionStatus)}`
            + `<br/>Ubicación: ${p.locationLabel === 'Documentado' ? 'confirmada' : 'aproximada'}${prio}`
            + `<br/>Maquinaria: ${esc(p.machineryAccess === 'Sin dato' ? 'sin dato' : (MACHINERY_ACCESS_LABELS[p.machineryAccess] ?? p.machineryAccess))}`
            + `<br/><a href="/inventario/${esc(p.id)}" data-nav="1">Ver ficha completa</a>`;
        } else if (f.layer.id === 'mallas') {
          html = `<b>${esc(p.name)}</b><br/>Malla metálica que retiene rocas y lodo.<br/>Estado reportado: ${esc(p.estado)}`
            + '<br/><small>Ubicación confirmada. Fuente: Municipalidad de Lurigancho (agosto 2024).</small>';
        } else if (f.layer.id === 'cauces') {
          html = `<b>${esc(p.name)}</b><br/>Recorrido por donde baja el agua según la forma del terreno.<br/><small>Trazado aproximado a partir del relieve.</small>`;
        } else {
          html = `<b>Zona de exposición de ${esc(p.code)}</b><br/>Personas que podrían verse afectadas: ${Math.round(Number(p.n))}<br/><small>Cálculo aproximado.</small>`;
        }
        const popup = new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(html).addTo(map);
        popup.getElement().querySelector('a[data-nav]')?.addEventListener('click', (ev) => { ev.preventDefault(); nav(`/inventario/${p.id}`); });
      });
    }
    applyVisibility(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structures.data, reference.data, exposure.data]);

  useEffect(() => { if (mapRef.current) applyVisibility(mapRef.current); /* eslint-disable-next-line */ }, [layers]);
  useEffect(() => {
    const m = mapRef.current;
    if (m?.getLayer('structures')) m.setPaintProperty('structures', 'circle-color', matchExpr(colorBy));
  }, [colorBy]);

  const legend = PALETTES[colorBy];
  return (
    <Stack>
      <PageHeader title="Mapa" description="Haz clic en cualquier punto o línea para ver su información. Usa el panel de la derecha para cambiar colores y capas." />
      <Grid>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <MapView height="74vh" onReady={draw} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Card withBorder>
            <Stack gap="xs">
              <Text fw={600}>Colorear las estructuras por</Text>
              <SegmentedControl orientation="vertical" fullWidth value={colorBy} onChange={(v) => setColorBy(v as ColorBy)} data={[
                { value: 'physicalStatus', label: 'Estado' },
                { value: 'interventionStatus', label: 'Trabajos' },
                { value: 'structureType', label: 'Tipo' },
                { value: 'machineryAccess', label: '¿Llega maquinaria?' }]} />
              {Object.entries(legend).map(([k, c]) => (
                <Group key={k} gap={8}><Dot color={c} /><Text size="sm">{colorBy === 'structureType' ? STRUCTURE_TYPE_LABELS[k as StructureType] : colorBy === 'machineryAccess' ? (MACHINERY_ACCESS_LABELS[k] ?? k) : k}</Text></Group>
              ))}
              <Divider my={4} />
              <Text fw={600}>Borde del punto</Text>
              <Group gap={8}><Dot color="#adb5bd" border="#000" /><Text size="sm">Ubicación confirmada</Text></Group>
              <Group gap={8}><Dot color="#adb5bd" border="#fff" /><Text size="sm">Ubicación aproximada</Text></Group>
              <Divider my={4} />
              <Text fw={600}>Capas</Text>
              <Checkbox label={`Estructuras (${structures.data?.features.length ?? '…'})`} checked={layers.structures} onChange={(e) => setLayers({ ...layers, structures: e.currentTarget.checked })} />
              <Checkbox label={<Group gap={6}><Dot color="#ae3ec9" />Mallas dinámicas</Group>} checked={layers.mallas} onChange={(e) => setLayers({ ...layers, mallas: e.currentTarget.checked })} />
              <Checkbox label={<Group gap={6}><span style={{ width: 18, borderTop: '3px dashed #1c7ed6', display: 'inline-block' }} />Cauces de las quebradas</Group>} checked={layers.cauces} onChange={(e) => setLayers({ ...layers, cauces: e.currentTarget.checked })} />
              <Checkbox label={<Group gap={6}><span style={{ width: 14, height: 10, background: '#a5d8ff', border: '1px solid #1c7ed6', display: 'inline-block' }} />Zonas con personas expuestas</Group>} checked={layers.exposure} onChange={(e) => setLayers({ ...layers, exposure: e.currentTarget.checked })} />
              <Text size="xs" c="dimmed" mt={4}>Calles, viviendas, colegios y centros de salud se ven en el mapa base. Cambia a "Satélite" para ver el terreno real.</Text>
            </Stack>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
