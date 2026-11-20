// Fórmula aprobada (docs/especificacion/02_INSPECCION/03_PRIORIZACION.md):
//   E = (D + C + A) / 9      X = N / Nmax      P = E × X
// Reglas: D, C y A enteros 0–3 y completos; sin ellos NO se calcula P. N y Nmax ≥ 0.
// Si Nmax = 0 → X = 0 con advertencia. No se redondean valores intermedios.
// P es un índice relativo de apoyo: no es probabilidad de falla ni clasificación de riesgo.

export const FORMULA_VERSION = 'P-1.0';

export interface PriorityInput {
  d: number | null | undefined;
  c: number | null | undefined;
  a: number | null | undefined;
  n: number | null | undefined;
  nMax: number | null | undefined;
}

export type PriorityResult =
  | { ok: true; e: number; x: number; p: number; warnings: string[]; formulaVersion: string }
  | { ok: false; reason: string; missing: string[] };

const isScore = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 3;

export function computePriority(input: PriorityInput): PriorityResult {
  const missing: string[] = [];
  for (const k of ['d', 'c', 'a'] as const) {
    if (input[k] === null || input[k] === undefined) missing.push(k.toUpperCase());
  }
  if (missing.length) {
    return { ok: false, reason: `Faltan indicadores: ${missing.join(', ')}. No se calcula P.`, missing };
  }
  for (const k of ['d', 'c', 'a'] as const) {
    if (!isScore(input[k])) {
      return { ok: false, reason: `${k.toUpperCase()} debe ser un entero entre 0 y 3.`, missing: [] };
    }
  }
  if (input.n === null || input.n === undefined) {
    return { ok: false, reason: 'Falta la exposición N de la estructura. No se calcula P.', missing: ['N'] };
  }
  if (input.nMax === null || input.nMax === undefined) {
    return { ok: false, reason: 'Falta Nmax del inventario vigente.', missing: ['Nmax'] };
  }
  const n = Number(input.n);
  const nMax = Number(input.nMax);
  if (!Number.isFinite(n) || n < 0 || !Number.isFinite(nMax) || nMax < 0) {
    return { ok: false, reason: 'N y Nmax deben ser números no negativos.', missing: [] };
  }
  if (n > nMax) {
    return { ok: false, reason: 'N no puede ser mayor que Nmax (Nmax es el mayor N del inventario vigente).', missing: [] };
  }
  const warnings: string[] = [];
  const e = ((input.d as number) + (input.c as number) + (input.a as number)) / 9;
  let x: number;
  if (nMax === 0) {
    x = 0;
    warnings.push('Nmax = 0: la exposición del inventario necesita revisión; X se fija en 0.');
  } else {
    x = n / nMax;
  }
  return { ok: true, e, x, p: e * x, warnings, formulaVersion: FORMULA_VERSION };
}

/** Nmax = mayor N entre las estructuras del inventario vigente que tienen exposición. */
export function computeNMax(values: Array<number | null | undefined>): number {
  let max = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v) && v > max) max = v;
  return max;
}
