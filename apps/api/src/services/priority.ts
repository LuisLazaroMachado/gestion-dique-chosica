import { FORMULA_VERSION, computeNMax, computePriority } from '@dique/shared';
import type { Db } from '../db.js';
import { audit } from '../audit.js';

/**
 * Recalcula la prioridad de todo el inventario vigente y la guarda como un lote nuevo (inalterable).
 * - Inspección usada: la última VALIDADA de cada estructura.
 * - Exposición usada: la vigente (valid_from más reciente).
 * - Nmax: mayor N entre las estructuras activas con exposición.
 * Estructuras sin D/C/A completos o sin exposición no reciben P (se informan como "sin cálculo").
 */
export async function recalculatePriorities(db: Db, actorId: string | null, reason: string) {
  const rows = await db`
    WITH last_insp AS (
      SELECT DISTINCT ON (structure_id) id, structure_id, damage_score, clogging_score, active_process_score, data_label
        FROM inspections WHERE validation_status = 'Validado'
       ORDER BY structure_id, inspected_at DESC, created_at DESC
    ), last_exp AS (
      SELECT DISTINCT ON (structure_id) id, structure_id, estimated_persons, data_label
        FROM exposure_estimates
       ORDER BY structure_id, valid_from DESC, created_at DESC
    )
    SELECT s.id, s.code, li.id AS inspection_id, li.damage_score AS d, li.clogging_score AS c,
           li.active_process_score AS a, le.id AS exposure_id, le.estimated_persons AS n,
           li.data_label AS insp_label, le.data_label AS exp_label
      FROM structures s
      LEFT JOIN last_insp li ON li.structure_id = s.id
      LEFT JOIN last_exp le ON le.structure_id = s.id
     WHERE s.active`;

  const nMax = computeNMax(rows.map((r) => (r.exposure_id ? Number(r.n) : null)));
  const nMaxRow = rows.find((r) => r.exposure_id && Number(r.n) === nMax && nMax > 0);
  const batchWarnings: string[] = [];
  if (nMax === 0) batchWarnings.push('Nmax = 0: revise los datos de exposición del inventario.');

  const [batch] = await db`
    INSERT INTO priority_batches (formula_version, n_max, n_max_structure, inventory_count, warnings, reason, triggered_by)
    VALUES (${FORMULA_VERSION}, ${nMax}, ${nMaxRow?.id ?? null}, ${rows.length}, ${batchWarnings}, ${reason}, ${actorId})
    RETURNING id, calculated_at`;

  let calculated = 0;
  const skipped: Array<{ structureId: string; code: string; reason: string }> = [];
  for (const r of rows) {
    if (!r.inspection_id) {
      skipped.push({ structureId: r.id, code: r.code, reason: 'Falta una inspección aprobada' });
      continue;
    }
    const res = computePriority({ d: r.d, c: r.c, a: r.a, n: r.exposure_id ? Number(r.n) : null, nMax });
    if (!res.ok) {
      skipped.push({ structureId: r.id, code: r.code, reason: res.reason });
      continue;
    }
    const warnings = [...res.warnings];
    if (r.insp_label !== 'Documentado') warnings.push(`Inspección ${String(r.insp_label).toLowerCase()}`);
    if (r.exp_label !== 'Documentado') warnings.push(`Exposición ${String(r.exp_label).toLowerCase()}`);
    await db`
      INSERT INTO priority_calculations
        (batch_id, structure_id, inspection_id, exposure_id, d, c, a, n_persons, n_max, e, x, p, warnings, formula_version)
      VALUES (${batch.id}, ${r.id}, ${r.inspection_id}, ${r.exposure_id}, ${r.d}, ${r.c}, ${r.a}, ${Number(r.n)},
              ${nMax}, ${res.e}, ${res.x}, ${res.p}, ${warnings}, ${res.formulaVersion})`;
    calculated++;
  }
  await audit(db, {
    actorId, action: 'recalcular_prioridad', entityType: 'priority_batch', entityId: batch.id,
    after: { nMax, calculated, skipped: skipped.length, inventory: rows.length }, reason,
  });
  return { batchId: batch.id as string, calculatedAt: batch.calculated_at, nMax, calculated, skipped };
}
