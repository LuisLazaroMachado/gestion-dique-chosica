// Carga inicial: usuarios, inventario (línea base + ampliaciones), inspecciones de referencia,
// exposición estimada, escenarios nivel A y capas de referencia. Idempotente: no duplica si ya hay datos.
//
// Contraseñas: se leen de SEED_ADMIN_PASSWORD / SEED_PLANNER_PASSWORD / SEED_INSPECTOR_PASSWORD; si faltan,
// se generan al azar y se guardan en credenciales-iniciales.txt (ignorado por git). Cámbielas tras el primer acceso.
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from '../db.js';
import { hashPassword } from '../auth.js';
import { config } from '../config.js';
import { audit } from '../audit.js';
import { recalculatePriorities } from '../services/priority.js';

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(await readFile(join(here, '../../seed/seed.json'), 'utf8'));

const [{ n }] = await sql`SELECT count(*)::int AS n FROM structures`;
if (n > 0 && !process.argv.includes('--force-users')) {
  console.log(`La base ya tiene ${n} estructuras: no se vuelve a cargar el inventario.`);
  await sql.end();
  process.exit(0);
}

const pw = (env: string) => process.env[env] || randomBytes(9).toString('base64url');
const creds = {
  admin: { email: 'admin@priori-dique.pe', name: 'Administrador del sistema', pass: pw('SEED_ADMIN_PASSWORD') },
  planner: { email: 'responsable@priori-dique.pe', name: 'Responsable de planificación', pass: pw('SEED_PLANNER_PASSWORD') },
  inspector: { email: 'inspector@priori-dique.pe', name: 'Inspector de campo', pass: pw('SEED_INSPECTOR_PASSWORD') },
  inspector2: { email: 'inspector2@priori-dique.pe', name: 'Inspector de campo 2', pass: pw('SEED_INSPECTOR_PASSWORD') },
};

await sql.begin(async (tx) => {
  const ids: Record<string, string> = {};
  for (const [key, c] of Object.entries(creds)) {
    const role = key.startsWith('inspector') ? 'inspector' : key;
    const [u] = await tx`
      INSERT INTO users (email, display_name, role, password_hash, can_inspect, can_view_all)
      VALUES (${c.email}, ${c.name}, ${role}, ${await hashPassword(c.pass)}, ${role !== 'inspector'}, false)
      ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`;
    ids[key] = u.id;
  }
  // Autor de los registros de referencia: usuario de sistema inactivo (no puede iniciar sesión).
  const [refUser] = await tx`
    INSERT INTO users (email, display_name, role, password_hash, active)
    VALUES ('referencia.contraloria@sistema.local', 'Registro de referencia (fuentes oficiales)', 'inspector',
            ${await hashPassword(randomBytes(24).toString('hex'))}, false)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id`;

  await tx`UPDATE settings SET value = ${tx.json({ name: seed.baseCentral.name, lat: seed.baseCentral.lat, lon: seed.baseCentral.lon })},
           notes = ${'Ubicación ESTIMADA. ' + seed.baseCentral.source} WHERE key = 'base_central'`;

  const firstInspector: string[] = [];
  for (const s of seed.structures) {
    const [{ seq }] = await tx`SELECT nextval('structure_code_seq') AS seq`;
    const code = `PDC-${String(seq).padStart(4, '0')}`;
    const L = s.location;
    const physical = s.inspection.physical;
    const [row] = await tx`
      INSERT INTO structures (code, name, structure_type, material, watershed, origin_inventory, source_reference,
        source_number, working_id, reconciliation_status, physical_status, geom, location_confidence, location_label,
        location_method, location_source, location_date, location_precision_m, location_crs_original, location_responsible,
        elevation_m, created_by)
      VALUES (${code}, ${s.name}, ${s.structureType}, ${s.material}, ${s.watershed}, ${s.originInventory}, ${s.sourceReference},
        ${s.sourceNumber}, ${s.workingId}, ${s.reconciliationStatus}, ${physical},
        ${`SRID=4326;POINT(${L.lon} ${L.lat})`}::geometry, ${L.confidence}, ${L.label}, ${L.method}, ${L.source}, ${L.date},
        ${L.precisionM}, ${L.crsOriginal}, ${L.responsible}, ${s.elevationM}, ${ids.admin})
      RETURNING id`;
    const i = s.inspection;
    await tx`
      INSERT INTO inspections (structure_id, inspector_id, verifier_name, verifier_role, inspected_at, damage_score,
        clogging_score, active_process_score, physical_status, access_status, access_notes, observations,
        validation_status, validation_notes, validated_by, validated_at, data_label, source_reference)
      VALUES (${row.id}, ${refUser.id}, ${'Comisión de control OCI y personal de la Gerencia de Gestión de Riesgo y Desastres'},
        ${'Fuente oficial'}, ${i.inspectedAt}, ${i.d}, ${i.c}, ${i.a}, ${physical}, ${i.access}, ${i.access_notes},
        ${i.notes}, 'Validado', ${'Registro de referencia cargado desde la fuente; D/C/A estimados a partir de la descripción documentada.'},
        ${ids.admin}, now(), 'Estimado', ${i.sourceReference})`;
    const e = s.exposure;
    await tx`
      INSERT INTO exposure_estimates (structure_id, method, affected_homes, persons_per_home, estimated_persons, persons_low,
        persons_high, method_notes, source, data_label, confidence, polygon, polygon_version, valid_from, created_by)
      VALUES (${row.id}, 'VxH', ${e.V}, ${e.H}, ${e.N}, ${e.low}, ${e.high},
        ${`${seed.exposureMethod.description} Edificaciones en el polígono: ${e.buildings}.`},
        ${'OpenStreetMap (edificaciones, consulta 19-11-2026); INEI/GeoPerú 2017; CENEPRED Vizcachera 2026'}, 'Estimado', 'baja',
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(e.polygon)}), 4326)), 'D8-v1', ${'2026-11-19'}, ${ids.admin})`;
    await tx`
      INSERT INTO scenarios (structure_id, scenario_type, name, corridor, zone, parameters, engine_version, validation_level,
        data_label, limitations, sources)
      VALUES (${row.id}, 'S2', ${'Corredor hipotético por relieve ante pérdida de contención'},
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(s.scenario.corridor)}), 4326)),
        ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(s.scenario.zone)}), 4326)),
        ${tx.json({ metodo: 'Flujo D8 sobre DEM', dem: 'Copernicus GLO-30 (~30 m)', ancho_tramo_m: 35, ancho_abanico_m: 70,
                    longitud_m: s.scenario.lengthM, origen: 'Ubicación estimada del dique' })},
        'nivel-A-0.1', 'A', 'Hipotético',
        ${'Visualización conceptual: no calcula profundidad, velocidad, caudal ni tiempo de llegada. El DEM de 30 m no resuelve '
          + 'quebradas angostas ni obras urbanas; D8 da un único camino. No declara zonas seguras fuera del corredor. '
          + 'Requiere topografía de detalle, parámetros físicos y validación profesional para uso ingenieril.'},
        ${'DEM Copernicus GLO-30; ubicación de la estructura (ver su ficha)'})`;
    if (s.watershed === 'Pedregal' && firstInspector.length < 4) firstInspector.push(row.id);
    else if (s.watershed === 'Quirio' && firstInspector.length < 7) firstInspector.push(row.id);
  }

  for (const f of seed.referenceLayers.features) {
    await tx`
      INSERT INTO reference_features (layer, name, geom, properties, data_label, source)
      VALUES (${f.properties.layer}, ${f.properties.name}, ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}), 4326),
        ${tx.json(f.properties)}, ${f.properties.label}, ${f.properties.source})`;
  }

  // Asignaciones de ejemplo para probar la app móvil.
  for (const sid of firstInspector) {
    await tx`INSERT INTO assignments (structure_id, inspector_id, assigned_by, due_at, instructions)
             VALUES (${sid}, ${ids.inspector}, ${ids.planner}, now() + interval '14 days',
                     ${'Inspección de seguimiento. Verificar ubicación (coordenada estimada) y registrar D, C, A con fotos.'})`;
  }
  await audit(tx, { actorId: ids.admin, action: 'carga_inicial', entityType: 'system',
    after: { structures: seed.structures.length, generatedAt: seed.generatedAt }, reason: 'Carga inicial desde tools/geodata/estimate.py' });
  await recalculatePriorities(tx, ids.admin, 'Carga inicial del inventario');
});

const lines = [
  'Credenciales iniciales de Priori Dique Chosica (cámbielas tras el primer acceso).',
  `Generado: ${new Date().toISOString()} — Base de datos: ${config.databaseUrl.replace(/:[^:@/]+@/, ':***@')}`,
  '',
  ...Object.values(creds).map((c) => `${c.name.padEnd(30)} ${c.email.padEnd(32)} ${c.pass}`),
];
const file = join(config.repoRoot, process.env.CREDENTIALS_FILE ?? 'credenciales-iniciales.txt');
await writeFile(file, lines.join('\n') + '\n', 'utf8');
console.log(`Carga completada: ${seed.structures.length} estructuras. Credenciales guardadas en ${file}`);
await sql.end();
