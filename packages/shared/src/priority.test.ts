import { describe, expect, it } from 'vitest';
import { computeNMax, computePriority } from './priority.js';

describe('computePriority (fórmula aprobada P-1.0)', () => {
  it('reproduce el ejemplo del documento de priorización', () => {
    const r = computePriority({ d: 2, c: 3, a: 1, n: 300, nMax: 600 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.e).toBeCloseTo(6 / 9, 12);
      expect(r.x).toBe(0.5);
      expect(r.p).toBeCloseTo(1 / 3, 12);
    }
  });

  it('no calcula si falta D, C o A', () => {
    for (const k of ['d', 'c', 'a'] as const) {
      const r = computePriority({ d: 1, c: 1, a: 1, n: 10, nMax: 10, [k]: null });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.missing).toContain(k.toUpperCase());
    }
  });

  it('rechaza puntajes fuera de 0–3 o no enteros', () => {
    expect(computePriority({ d: 4, c: 0, a: 0, n: 1, nMax: 1 }).ok).toBe(false);
    expect(computePriority({ d: 1.5, c: 0, a: 0, n: 1, nMax: 1 }).ok).toBe(false);
    expect(computePriority({ d: -1, c: 0, a: 0, n: 1, nMax: 1 }).ok).toBe(false);
  });

  it('Nmax = 0 → X = 0 con advertencia', () => {
    const r = computePriority({ d: 3, c: 3, a: 3, n: 0, nMax: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.x).toBe(0);
      expect(r.p).toBe(0);
      expect(r.warnings).toHaveLength(1);
    }
  });

  it('rechaza N negativo o N > Nmax', () => {
    expect(computePriority({ d: 1, c: 1, a: 1, n: -1, nMax: 5 }).ok).toBe(false);
    expect(computePriority({ d: 1, c: 1, a: 1, n: 6, nMax: 5 }).ok).toBe(false);
  });

  it('no calcula sin exposición', () => {
    expect(computePriority({ d: 1, c: 1, a: 1, n: null, nMax: 5 }).ok).toBe(false);
  });

  it('máximos: D=C=A=3 y N=Nmax → P=1', () => {
    const r = computePriority({ d: 3, c: 3, a: 3, n: 50, nMax: 50 });
    expect(r.ok && r.p).toBe(1);
  });

  it('no redondea valores intermedios', () => {
    const r = computePriority({ d: 1, c: 0, a: 0, n: 1, nMax: 3 });
    expect(r.ok && r.p).toBe((1 / 9) * (1 / 3));
  });
});

describe('computeNMax', () => {
  it('toma el mayor N ignorando vacíos', () => {
    expect(computeNMax([10, null, 40, undefined, 5])).toBe(40);
    expect(computeNMax([])).toBe(0);
  });
});
