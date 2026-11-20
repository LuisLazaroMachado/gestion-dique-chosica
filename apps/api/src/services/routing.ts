import { config } from '../config.js';

// Servicio de ruteo desacoplado. Ordena las paradas (vecino más cercano + mejora 2-opt) y,
// si hay clave de openrouteservice, obtiene la geometría vial con el perfil de camión (driving-hgv).
// Sin clave, devuelve líneas rectas con advertencia. Ningún proveedor garantiza aptitud para
// maquinaria pesada: la ruta siempre requiere revisión humana (riesgo R7).

export interface Pt { id: string; lat: number; lon: number }

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

/** Orden de visita: vecino más cercano desde la base, luego 2-opt (ida y vuelta a la base). */
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

export interface RouteGeometry {
  coordinates: Array<[number, number]>;
  distanceM: number;
  durationS: number | null;
  provider: 'openrouteservice' | 'linea_recta';
  profile: string | null;
  warnings: string[];
}

export async function buildGeometry(base: Pt, order: Pt[]): Promise<RouteGeometry> {
  const seq = [base, ...order, base];
  const warnings = ['Verifique la ruta: el cálculo no considera restricciones específicas de maquinaria pesada.'];
  if (config.orsApiKey) {
    try {
      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson', {
        method: 'POST',
        headers: { Authorization: config.orsApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: seq.map((p) => [p.lon, p.lat]) }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const gj = (await res.json()) as {
          features: Array<{ geometry: { coordinates: Array<[number, number]> }; properties: { summary: { distance: number; duration: number } } }>;
        };
        const f = gj.features[0];
        return {
          coordinates: f.geometry.coordinates, distanceM: f.properties.summary.distance,
          durationS: f.properties.summary.duration, provider: 'openrouteservice', profile: 'driving-hgv', warnings,
        };
      }
      warnings.push(`El proveedor de ruteo respondió ${res.status}; se muestran tramos en línea recta.`);
    } catch {
      warnings.push('No se pudo contactar al proveedor de ruteo; se muestran tramos en línea recta.');
    }
  } else {
    warnings.push('Sin proveedor de ruteo configurado: tramos en línea recta, no siguen las vías.');
  }
  let d = 0;
  for (let i = 1; i < seq.length; i++) d += haversine(seq[i - 1], seq[i]);
  return { coordinates: seq.map((p) => [p.lon, p.lat]), distanceM: d, durationS: null, provider: 'linea_recta', profile: null, warnings };
}
