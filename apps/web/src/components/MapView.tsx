import { useEffect, useRef, useState } from 'react';
import maplibregl, { type Map as MlMap, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SegmentedControl } from '@mantine/core';

// Mapas base libres y sin clave. La imagen satelital (Esri) es referencial; respetar su atribución.
const rasterStyle = (tiles: string[], attribution: string, maxzoom = 19): StyleSpecification => ({
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: { base: { type: 'raster', tiles, tileSize: 256, attribution, maxzoom } },
  layers: [{ id: 'base', type: 'raster', source: 'base' }],
});
export const BASEMAPS: Record<string, { label: string; style: string | StyleSpecification }> = {
  calles: { label: 'Calles', style: rasterStyle(['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], '© OpenStreetMap') },
  satelite: {
    label: 'Satélite',
    style: rasterStyle(['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Imagen © Esri, Maxar, Earthstar Geographics'),
  },
  relieve: {
    label: 'Relieve',
    style: rasterStyle(['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'], '© OpenTopoMap (CC-BY-SA), © OpenStreetMap', 17),
  },
};

export const CHOSICA_CENTER: [number, number] = [-76.705, -11.935];

interface Props {
  height?: number | string;
  /** Se llama cada vez que el estilo termina de cargar (también tras cambiar el mapa base). */
  onReady: (map: MlMap) => void;
  center?: [number, number];
  zoom?: number;
}

export function MapView({ height = 560, onReady, center = CHOSICA_CENTER, zoom = 13 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [base, setBase] = useState('calles');
  const baseRef = useRef('calles');
  // Contador de cargas de estilo: al cargar (o cambiar el mapa base) se vuelven a dibujar las capas.
  const [styleTick, setStyleTick] = useState(0);

  useEffect(() => {
    if (!ref.current) return;
    const map = new maplibregl.Map({ container: ref.current, style: BASEMAPS.calles.style, center, zoom, attributionControl: { compact: true } });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('style.load', () => setStyleTick((t) => t + 1));
    mapRef.current = map;
    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dibuja cuando el estilo está listo y cada vez que cambian los datos (onReady se recrea con ellos).
  useEffect(() => {
    if (styleTick > 0 && mapRef.current) onReady(mapRef.current);
  }, [styleTick, onReady]);

  useEffect(() => {
    const m = mapRef.current;
    if (m && baseRef.current !== base) { baseRef.current = base; m.setStyle(BASEMAPS[base].style); }
  }, [base]);

  return (
    <div style={{ position: 'relative' }}>
      <div ref={ref} style={{ height, width: '100%', borderRadius: 8, overflow: 'hidden' }} />
      <SegmentedControl size="xs" value={base} onChange={setBase} style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}
        data={Object.entries(BASEMAPS).map(([value, b]) => ({ value, label: b.label }))} />
    </div>
  );
}

/** Agrega o reemplaza una fuente GeoJSON. */
export function setGeoJson(map: MlMap, id: string, data: any) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData(data);
  else map.addSource(id, { type: 'geojson', data });
}

export function fitTo(map: MlMap, coords: Array<[number, number]>, padding = 60) {
  if (!coords.length) return;
  const b = new maplibregl.LngLatBounds(coords[0], coords[0]);
  coords.forEach((c) => b.extend(c));
  map.fitBounds(b, { padding, maxZoom: 16, duration: 0 });
}
