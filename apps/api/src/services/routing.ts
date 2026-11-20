import { config } from '../config.js';

// Servicio de ruteo desacoplado.
// Proveedores, en orden: openrouteservice (si hay ORS_API_KEY) → Valhalla público de FOSSGIS
// (sin clave, perfil camión) → tramos rectos con advertencia.
// Ningún proveedor garantiza aptitud para maquinaria pesada: la ruta requiere revisión humana (riesgo R7).

export interface Pt { id: string; lat: number; lon: number }

const VALHALLA_URL = process.env.VALHALLA_URL ?? 'https://valhalla1.openstreetmap.de';
const UA = 'PrioriDiqueChosica/0.1 (herramienta academica de gestion de riesgo)';
export const MACHINERY_WARNING = 'Confirma en campo que la maquinaria pueda pasar por estas calles.';

export function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function tourLength(base: Pt, order: Pt[]): number {
  let d = 0;
  let prev: Pt = base;
  for (const p of order) { d += haversine(prev, p); prev = p; }
  return d + haversine(prev, base);
}

/** Respaldo sin proveedor: vecino más cercano desde la base + mejora 2-opt (en línea recta). */
export function orderStops(base: Pt, stops: Pt[]): Pt[] {
  const left = [...stops];
  const order: Pt[] = [];
  let cur: Pt = base;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (haversine(cur, left[i]) < haversine(cur, left[bi])) bi = i;
    cur = left.splice(bi, 1)[0];
    order.push(cur);
  }
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const cand = [...order.slice(0, i), ...order.slice(i, k + 1).reverse(), ...order.slice(k + 1)];
        if (tourLength(base, cand) + 1e-6 < tourLength(base, order)) { order.splice(0, order.length, ...cand); improved = true; }
      }
    }
  }
  return order;
}

/** Decodifica una polilínea codificada (precisión 6, formato Valhalla) a [lon, lat]. */
export function decodePolyline6(str: string): Array<[number, number]> {
  const coords: Array<[number, number]> = [];
  let index = 0, lat = 0, lon = 0;
  while (index < str.length) {
    for (const which of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += delta; else lon += delta;
    }
    coords.push([lon / 1e6, lat / 1e6]);
  }
  return coords;
}

export interface RouteResult {
  order: Pt[];
  coordinates: Array<[number, number]>;
  distanceM: number;
  durationS: number | null;
  provider: 'openrouteservice' | 'valhalla' | 'linea_recta';
  profile: string | null;
  warnings: string[];
}

interface ValhallaTrip { trip: { locations: Array<{ original_index: number }>; legs: Array<{ shape: string }>; summary: { length: number; time: number } } }

async function valhalla(path: 'route' | 'optimized_route', seq: Pt[]): Promise<ValhallaTrip> {
  const res = await fetch(`${VALHALLA_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ locations: seq.map((p) => ({ lat: p.lat, lon: p.lon })), costing: 'truck', units: 'kilometers' }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  return (await res.json()) as ValhallaTrip;
}

function fromValhalla(trip: ValhallaTrip['trip'], order: Pt[]): RouteResult {
  const coordinates = trip.legs.flatMap((l, i) => {
    const c = decodePolyline6(l.shape);
    return i === 0 ? c : c.slice(1);
  });
  return { order, coordinates, distanceM: trip.summary.length * 1000, durationS: trip.summary.time,
    provider: 'valhalla', profile: 'truck', warnings: [MACHINERY_WARNING] };
}

async function ors(seq: Pt[]): Promise<{ coordinates: Array<[number, number]>; distanceM: number; durationS: number }> {
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson', {
    method: 'POST',
    headers: { Authorization: config.orsApiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates: seq.map((p) => [p.lon, p.lat]) }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`ORS ${res.status}`);
  const gj = (await res.json()) as { features: Array<{ geometry: { coordinates: Array<[number, number]> }; properties: { summary: { distance: number; duration: number } } }> };
  const f = gj.features[0];
  return { coordinates: f.geometry.coordinates, distanceM: f.properties.summary.distance, durationS: f.properties.summary.duration };
}

function straight(base: Pt, order: Pt[], reason: string): RouteResult {
  const seq = [base, ...order, base];
  let d = 0;
  for (let i = 1; i < seq.length; i++) d += haversine(seq[i - 1], seq[i]);
  return { order, coordinates: seq.map((p) => [p.lon, p.lat]), distanceM: d, durationS: null, provider: 'linea_recta', profile: null,
    warnings: [`${reason} Se muestran líneas rectas entre los puntos; no siguen las calles.`, MACHINERY_WARNING] };
}

/** Ruta siguiendo un orden dado (vista previa o edición manual). */
export async function routeInOrder(base: Pt, order: Pt[]): Promise<RouteResult> {
  const seq = [base, ...order, base];
  if (config.orsApiKey) {
    try {
      const r = await ors(seq);
      return { order, ...r, provider: 'openrouteservice', profile: 'driving-hgv', warnings: [MACHINERY_WARNING] };
    } catch { /* se intenta el siguiente proveedor */ }
  }
  try {
    return fromValhalla((await valhalla('route', seq)).trip, order);
  } catch {
    return straight(base, order, 'No se pudo consultar el servicio de calles.');
  }
}

/** Propone el orden de visita más corto (por calles si el proveedor responde) y su ruta. */
export async function optimizeRoute(base: Pt, stops: Pt[]): Promise<RouteResult> {
  if (!config.orsApiKey && stops.length >= 2) {
    try {
      const seq = [base, ...stops, base];
      const { trip } = await valhalla('optimized_route', seq);
      const order = trip.locations.slice(1, -1).map((l) => seq[l.original_index]).filter((p) => p.id !== 'base');
      if (order.length === stops.length) return fromValhalla(trip, order);
    } catch { /* respaldo local */ }
  }
  return routeInOrder(base, orderStops(base, stops));
}
