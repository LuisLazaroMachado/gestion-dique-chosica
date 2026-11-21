// Pruebas de integración de la API contra una base PostgreSQL/PostGIS de prueba (ENV_FILE=.env.test).
// Cubren los criterios de aceptación de docs/especificacion/05_CALIDAD/01_CRITERIOS_ACEPTACION.md.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

process.env.ENV_FILE ??= '.env.test';
const { buildApp } = await import('../src/app.js');
const { sql } = await import('../src/db.js');
const { hashPassword } = await import('../src/auth.js');

let app: FastifyInstance;
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
const PASS = 'clave-de-prueba-123';

async function login(email: string) {
  const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASS } });
  expect(r.statusCode).toBe(200);
  return r.json().token as string;
}
const call = (who: string, method: string, url: string, payload?: unknown) =>
  app.inject({ method: method as 'GET', url: `/api/v1${url}`, payload: payload as object, headers: { authorization: `Bearer ${tokens[who]}` } });

const inspectionBody = (structureId: string, over: Record<string, unknown> = {}) => ({
  structureId, inspectedAt: new Date(Date.now() - 3600_000).toISOString(), damageScore: 2, cloggingScore: 3,
  activeProcessScore: 1, physicalStatus: 'Deteriorado', accessStatus: 'Sin observación', deviceRecordId: randomUUID(), ...over,
});

beforeAll(async () => {
  await sql.unsafe(`TRUNCATE assignments, access_exceptions, evidence, urgencies, priority_decisions, routes, scenarios,
    reference_features, users RESTART IDENTITY CASCADE`);
  // Tablas con triggers de solo inserción/no borrado: se vacían deshabilitando triggers solo en pruebas.
  await sql.unsafe(`SET session_replication_role = replica;
    DELETE FROM priority_calculations; DELETE FROM priority_batches; DELETE FROM exposure_estimates;
    DELETE FROM inspections; DELETE FROM interventions; DELETE FROM structures; DELETE FROM audit_log;
    SET session_replication_role = DEFAULT;`);
  const h = await hashPassword(PASS);
  for (const [k, role] of [['admin', 'admin'], ['planner', 'planner'], ['insp', 'inspector'], ['insp2', 'inspector']] as const) {
    const [u] = await sql`INSERT INTO users (email, display_name, role, password_hash) VALUES (${k + '@t.pe'}, ${k}, ${role}, ${h}) RETURNING id`;
    ids[k] = u.id;
  }
  await sql`UPDATE settings SET value = ${sql.json({ name: 'Base prueba', lat: -11.937, lon: -76.697 })} WHERE key = 'base_central'`;
  app = await buildApp({ logger: false });
  for (const k of ['admin', 'planner', 'insp', 'insp2']) tokens[k] = await login(k + '@t.pe');
});

afterAll(async () => {
  await app?.close();
  await sql.end();
});

describe('Autenticación y usuarios', () => {
  it('rechaza contraseña incorrecta con mensaje genérico', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@t.pe', password: 'x' } });
    expect(r.statusCode).toBe(401);
  });
  it('sin token no hay acceso', async () => {
    const r = await app.inject({ method: 'GET', url: '/api/v1/structures' });
    expect(r.statusCode).toBe(401);
  });
});

describe('Inventario', () => {
  it('el responsable crea estructuras con código único permanente', async () => {
    const mk = (name: string, lat: number) => call('planner', 'POST', '/structures', {
      name, structureType: 'dique_transversal', watershed: 'Pedregal', originInventory: 'linea_base_2024',
      location: { lat, lon: -76.70, confidence: 'provisional', label: 'Estimado', method: 'prueba', source: 'prueba' },
    });
    const a = await mk('Dique A', -11.92); const b = await mk('Dique B', -11.921); const c = await mk('Dique C', -11.922);
    expect(a.statusCode).toBe(201);
    ids.s1 = a.json().id; ids.s2 = b.json().id; ids.s3 = c.json().id;
    expect(a.json().code).not.toBe(b.json().code);
    expect(a.json().code).toMatch(/^PDC-\d{4}$/);
    expect(a.json().physicalStatus).toBe('En evaluación');
  });
  it('el inspector no puede crear estructuras', async () => {
    const r = await call('insp', 'POST', '/structures', { name: 'X', structureType: 'otro', watershed: 'Q', originInventory: 'ampliacion' });
    expect(r.statusCode).toBe(403);
  });
  it('editar exige motivo y queda auditado con antes/después', async () => {
    const bad = await call('planner', 'PATCH', `/structures/${ids.s1}`, { name: 'Nuevo' });
    expect(bad.statusCode).toBe(400);
    const ok = await call('planner', 'PATCH', `/structures/${ids.s1}`, { name: 'Dique A (renombrado)', reason: 'Nombre oficial' });
    expect(ok.statusCode).toBe(200);
    const [a] = await sql`SELECT * FROM audit_log WHERE entity_id = ${ids.s1} AND action = 'editar_estructura'`;
    expect(a.reason).toBe('Nombre oficial');
    expect(a.before_data.name).toBe('Dique A');
  });
  it('no se pueden borrar estructuras físicamente', async () => {
    await expect(sql`DELETE FROM structures WHERE id = ${ids.s3}`).rejects.toThrow(/borrado lógico/);
  });
});

describe('Asignaciones y permisos del inspector', () => {
  it('el inspector solo ve lo asignado', async () => {
    const r = await call('planner', 'POST', '/assignments', { structureIds: [ids.s1, ids.s2], inspectorId: ids.insp });
    expect(r.statusCode).toBe(201);
    ids.asg1 = r.json().ids[0];
    const list = await call('insp', 'GET', '/structures');
    expect(list.json().items.map((s: { id: string }) => s.id).sort()).toEqual([ids.s1, ids.s2].sort());
    const other = await call('insp2', 'GET', `/structures/${ids.s1}`);
    expect(other.statusCode).toBe(403);
  });
  it('el inspector no puede inspeccionar una estructura no asignada', async () => {
    const r = await call('insp', 'POST', '/inspections', inspectionBody(ids.s3));
    expect(r.statusCode).toBe(403);
  });
  it('con excepción registrada sí puede', async () => {
    const x = await call('planner', 'POST', '/access-exceptions', { structureId: ids.s3, userId: ids.insp, reason: 'Cobertura por ausencia' });
    expect(x.statusCode).toBe(201);
    const r = await call('insp', 'GET', `/structures/${ids.s3}`);
    expect(r.statusCode).toBe(200);
  });
});

describe('Inspecciones', () => {
  it('registra y la sincronización es idempotente (sin duplicados)', async () => {
    const body = inspectionBody(ids.s1, { assignmentId: ids.asg1 });
    const r1 = await call('insp', 'POST', '/inspections', body);
    expect(r1.statusCode).toBe(201);
    const r2 = await call('insp', 'POST', '/inspections', body);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().duplicate).toBe(true);
    expect(r2.json().id).toBe(r1.json().id);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM inspections WHERE device_record_id = ${body.deviceRecordId}`;
    expect(n).toBe(1);
    ids.i1 = r1.json().id;
  });
  it('D/C/A fuera de 0–3 se rechaza', async () => {
    const r = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, { damageScore: 4 }));
    expect(r.statusCode).toBe(400);
  });
  it('un indicador faltante exige motivo', async () => {
    const r = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, { activeProcessScore: null }));
    expect(r.statusCode).toBe(400);
    const ok = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, { activeProcessScore: null, undeterminedReasons: { A: 'Ladera no visible por neblina' } }));
    expect(ok.statusCode).toBe(201);
    ids.iIncomplete = ok.json().id;
  });
  it('acceso difícil exige describir la causa', async () => {
    const r = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, { accessStatus: 'Difícil' }));
    expect(r.statusCode).toBe(400);
  });
  it('el puntaje P enviado por el cliente se ignora', async () => {
    const r = await call('insp', 'POST', '/inspections', { ...inspectionBody(ids.s2), p: 1, priority: 1 });
    expect(r.statusCode).toBe(201);
    expect(r.json().p).toBeUndefined();
  });
  it('la corrección guarda antes/después, autor y motivo', async () => {
    const r = await call('insp', 'PATCH', `/inspections/${ids.i1}`, { reason: 'Error de digitación', changes: { cloggingScore: 2 } });
    expect(r.statusCode).toBe(200);
    const d = await call('insp', 'GET', `/inspections/${ids.i1}`);
    expect(d.json().corrections[0].before_data.clogging_score).toBe(3);
    expect(d.json().corrections[0].after_data.clogging_score).toBe(2);
    expect(d.json().corrections[0].reason).toBe('Error de digitación');
  });
  it('el inspector no puede validar', async () => {
    const r = await call('insp', 'POST', `/inspections/${ids.i1}/validate`, { decision: 'Validado' });
    expect(r.statusCode).toBe(403);
  });
});

describe('Acceso de maquinaria', () => {
  it('guarda si llega la maquinaria, los obstáculos y el punto del vehículo', async () => {
    const r = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, {
      machineryAccess: 'No', accessObstacles: ['escaleras', 'sin_camino'],
      vehiclePoint: { lat: -11.9215, lon: -76.7005, mock: true },
    }));
    expect(r.statusCode).toBe(201);
    expect(r.json().machineryAccess).toBe('No');
    expect(r.json().accessObstacles).toEqual(['escaleras', 'sin_camino']);
    expect(r.json().vehiclePoint.lat).toBeCloseTo(-11.9215, 6);
    ids.iMach = r.json().id;
  });
  it('si la maquinaria no llega exige un obstáculo o una descripción', async () => {
    const bad = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, { machineryAccess: 'No' }));
    expect(bad.statusCode).toBe(400);
    const ok = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, { machineryAccess: 'No', accessStatus: 'Difícil', accessNotes: 'Solo hay escaleras' }));
    expect(ok.statusCode).toBe(201);
  });
  it('acepta inspecciones de versiones anteriores de la app (sin el dato)', async () => {
    const r = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2));
    expect(r.statusCode).toBe(201);
    expect(r.json().machineryAccess).toBeNull();
  });
});

describe('Priorización', () => {
  it('sin exposición no se calcula P', async () => {
    const v = await call('planner', 'POST', `/inspections/${ids.i1}/validate`, { decision: 'Validado' });
    expect(v.statusCode).toBe(200);
    const p = await call('planner', 'GET', '/priorities');
    expect(p.json().items).toHaveLength(0);
    expect(p.json().notCalculated.find((x: { id: string }) => x.id === ids.s1).reason).toMatch(/personas expuestas/i);
  });
  it('al validar, la estructura toma el estado físico observado', async () => {
    const s = await call('planner', 'GET', `/structures/${ids.s1}`);
    expect(s.json().physicalStatus).toBe('Deteriorado');
  });
  it('fórmula exacta con Nmax del inventario vigente', async () => {
    const e1 = await call('planner', 'POST', '/exposure-estimates', {
      structureId: ids.s1, method: 'VxH', affectedHomes: 100, personsPerHome: 3, methodNotes: 'prueba', source: 'prueba',
      dataLabel: 'Estimado', confidence: 'baja', validFrom: '2026-11-19' });
    expect(e1.statusCode).toBe(201);
    expect(e1.json().estimatedPersons).toBe(300);
    await call('planner', 'POST', '/exposure-estimates', {
      structureId: ids.s2, method: 'dato_oficial', estimatedPersons: 600, methodNotes: 'prueba', source: 'prueba',
      dataLabel: 'Documentado', confidence: 'media', validFrom: '2026-11-19' });
    const p = await call('planner', 'GET', '/priorities');
    const s1 = p.json().items.find((x: { structureId: string }) => x.structureId === ids.s1);
    // D=2, C=2 (corregido), A=1 → E = 5/9; N=300, Nmax=600 → X=0.5
    expect(s1.e).toBeCloseTo(5 / 9, 10);
    expect(s1.x).toBeCloseTo(0.5, 10);
    expect(s1.p).toBeCloseTo((5 / 9) * 0.5, 10);
    expect(s1.nMax).toBe(600);
  });
  it('estructura con inspección validada incompleta no recibe P', async () => {
    await call('planner', 'POST', `/inspections/${ids.iIncomplete}/validate`, { decision: 'Validado' });
    const p = await call('planner', 'GET', '/priorities');
    expect(p.json().items.find((x: { structureId: string }) => x.structureId === ids.s2)).toBeUndefined();
    expect(p.json().notCalculated.find((x: { id: string }) => x.id === ids.s2).reason).toMatch(/no evaluó/);
  });
  it('actualizar N exige motivo y conserva el valor anterior', async () => {
    const bad = await call('planner', 'POST', '/exposure-estimates', {
      structureId: ids.s1, method: 'VxH', affectedHomes: 120, personsPerHome: 3, methodNotes: 'conteo nuevo', source: 'padrón',
      dataLabel: 'Estimado', confidence: 'baja', validFrom: '2026-11-20' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toMatch(/motivo/);
    const ok = await call('planner', 'POST', '/exposure-estimates', {
      structureId: ids.s1, method: 'VxH', affectedHomes: 120, personsPerHome: 3, methodNotes: 'conteo nuevo', source: 'padrón',
      dataLabel: 'Estimado', confidence: 'baja', validFrom: '2026-11-20', changeReason: 'Conteo actualizado' });
    expect(ok.statusCode).toBe(201);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM exposure_estimates WHERE structure_id = ${ids.s1}`;
    expect(n).toBe(2);
  });
  it('la urgencia operativa no altera P', async () => {
    const before = (await call('planner', 'GET', '/priorities')).json().items.find((x: { structureId: string }) => x.structureId === ids.s1).p;
    const u = await call('planner', 'POST', '/urgencies', { structureId: ids.s1, level: 'Urgente', justification: 'Lluvias anunciadas' });
    expect(u.statusCode).toBe(201);
    const after = (await call('planner', 'GET', '/priorities')).json().items.find((x: { structureId: string }) => x.structureId === ids.s1);
    expect(after.p).toBe(before);
    expect(after.urgency.level).toBe('Urgente');
  });
  it('los cálculos de prioridad y la auditoría son inalterables', async () => {
    await expect(sql`UPDATE priority_calculations SET p = 1`).rejects.toThrow(/solo inserción/);
    await expect(sql`DELETE FROM audit_log`).rejects.toThrow(/solo inserción/);
  });
});

describe('Intervenciones', () => {
  it('finalizar una intervención NO convierte la estructura en Operativa', async () => {
    const c = await call('planner', 'POST', '/interventions', { structureId: ids.s1, interventionType: 'Descolmatación' });
    expect(c.statusCode).toBe(201);
    const f = await call('planner', 'PATCH', `/interventions/${c.json().id}`, { status: 'Finalizada', reason: 'Trabajo concluido' });
    expect(f.statusCode).toBe(200);
    const s = (await call('planner', 'GET', `/structures/${ids.s1}`)).json();
    expect(s.interventionStatus).toBe('Finalizada');
    expect(s.physicalStatus).toBe('Deteriorado');
  });
  it('verificar exige notas de verificación', async () => {
    const c = await call('planner', 'POST', '/interventions', { structureId: ids.s2, interventionType: 'Reparación' });
    const v = await call('planner', 'PATCH', `/interventions/${c.json().id}`, { status: 'Verificada', reason: 'ok' });
    expect(v.statusCode).toBe(400);
  });
});

describe('Rutas', () => {
  it('calcula ruta desde la base, incluye acceso difícil y exige justificar cambios de orden', async () => {
    const r = await call('planner', 'POST', '/routes', { name: 'Ruta prueba', structureIds: [ids.s1, ids.s2, ids.s3] });
    expect(r.statusCode).toBe(201);
    const route = r.json();
    expect(route.structureIdsCalc).toHaveLength(3);
    const reversed = [...route.structureIdsCalc].reverse();
    const bad = await call('planner', 'PATCH', `/routes/${route.id}/order`, { structureIdsFinal: reversed });
    expect(bad.statusCode).toBe(400);
    const ok = await call('planner', 'PATCH', `/routes/${route.id}/order`, { structureIdsFinal: reversed, justification: 'Acceso por la parte alta' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().structureIdsCalc).toEqual(route.structureIdsCalc);
    expect(ok.json().structureIdsFinal).toEqual(reversed);
  });
  it('la vista previa devuelve la ruta sin guardar nada', async () => {
    const [{ n: before }] = await sql`SELECT count(*)::int AS n FROM routes`;
    const r = await call('planner', 'POST', '/routes/preview', { structureIds: [ids.s2, ids.s1] });
    expect(r.statusCode).toBe(200);
    expect(r.json().geometry.coordinates.length).toBeGreaterThan(1);
    expect(r.json().distanceM).toBeGreaterThan(0);
    const [{ n: after }] = await sql`SELECT count(*)::int AS n FROM routes`;
    expect(after).toBe(before);
  });
});

describe('Rutas con acceso de maquinaria', () => {
  it('la vista previa informa el acceso y llega hasta el punto del vehículo', async () => {
    await call('planner', 'POST', `/inspections/${ids.iMach}/validate`, { decision: 'Validado' });
    const r = await call('planner', 'POST', '/routes/preview', { structureIds: [ids.s2] });
    expect(r.statusCode).toBe(200);
    const stop = r.json().stops.find((x: { structureId: string }) => x.structureId === ids.s2);
    expect(stop).toBeTruthy();
    expect(['No', null]).toContain(stop.machineryAccess);
    expect(r.json().warnings.join(' ')).toMatch(/maquinaria|acceso/i);
  });
  it('un punto del vehículo a más de 2 km del dique se ignora y se avisa', async () => {
    const far = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, {
      inspectedAt: new Date(Date.now() - 120_000).toISOString(), machineryAccess: 'Solo pequeña', accessObstacles: ['camino_angosto'],
      vehiclePoint: { lat: -12.05, lon: -77.03, mock: false },
    }));
    expect(far.statusCode).toBe(201);
    let r = await call('planner', 'POST', '/routes/preview', { structureIds: [ids.s2] });
    expect(r.statusCode).toBe(200);
    let stop = r.json().stops.find((x: { structureId: string }) => x.structureId === ids.s2);
    expect(stop.vehiclePoint).toBeNull();
    expect(stop.vehiclePointFarKm).toBeGreaterThan(2);
    expect(r.json().warnings.join(' ')).toMatch(/lejos del dique/);

    const near = await call('insp', 'POST', '/inspections', inspectionBody(ids.s2, {
      inspectedAt: new Date(Date.now() - 60_000).toISOString(), machineryAccess: 'Solo pequeña', accessObstacles: ['camino_angosto'],
      vehiclePoint: { lat: -11.9215, lon: -76.7005, mock: true },
    }));
    expect(near.statusCode).toBe(201);
    r = await call('planner', 'POST', '/routes/preview', { structureIds: [ids.s2] });
    stop = r.json().stops.find((x: { structureId: string }) => x.structureId === ids.s2);
    expect(stop.vehiclePoint?.lat).toBeCloseTo(-11.9215, 6);
    expect(stop.vehiclePointFarKm).toBeNull();
  });
});

describe('Reportes', () => {
  it('descarga la lista de prioridades en Excel', async () => {
    const r = await call('planner', 'GET', '/reports/priorities.xlsx');
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('spreadsheetml');
    expect(r.rawPayload.subarray(0, 2).toString()).toBe('PK');
  });
  it('descarga la ficha de una estructura en PDF', async () => {
    const r = await call('planner', 'GET', `/reports/structures/${ids.s1}.pdf`);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toContain('pdf');
    expect(r.rawPayload.subarray(0, 4).toString()).toBe('%PDF');
  });
  it('el inspector no puede descargar reportes', async () => {
    const r = await call('insp', 'GET', '/reports/priorities.xlsx');
    expect(r.statusCode).toBe(403);
  });
});

describe('Evidencias', () => {
  it('carga con checksum, privada e idempotente', async () => {
    const img = Buffer.from('fake-jpeg-content-for-test');
    const checksum = createHash('sha256').update(img).digest('hex');
    const meta = { structureId: ids.s1, inspectionId: ids.i1, evidenceType: 'general', contentType: 'image/jpeg',
      sizeBytes: img.length, checksumSha256: checksum, deviceRecordId: randomUUID() };
    const u = await call('insp', 'POST', '/evidence/upload-url', meta);
    expect(u.statusCode).toBe(201);
    const put = await app.inject({ method: 'PUT', url: u.json().uploadUrl, payload: img, headers: { 'content-type': 'image/jpeg' } });
    expect(put.statusCode).toBe(200);
    expect(put.json().uploadStatus).toBe('confirmada');
    const again = await call('insp', 'POST', '/evidence/upload-url', meta);
    expect(again.json().evidenceId).toBe(u.json().evidenceId);
    const noAuth = await app.inject({ method: 'GET', url: `/api/v1/evidence/${u.json().evidenceId}/content` });
    expect(noAuth.statusCode).toBe(401);
    const other = await call('insp2', 'GET', `/evidence/${u.json().evidenceId}/content`);
    expect(other.statusCode).toBe(403);
    const ok = await call('planner', 'GET', `/evidence/${u.json().evidenceId}/content`);
    expect(ok.statusCode).toBe(200);
    expect(ok.rawPayload.equals(img)).toBe(true);
  });
  it('rechaza archivo con checksum distinto', async () => {
    const meta = { structureId: ids.s1, inspectionId: ids.i1, evidenceType: 'dano', contentType: 'image/jpeg', sizeBytes: 5,
      checksumSha256: 'a'.repeat(64) };
    const u = await call('insp', 'POST', '/evidence/upload-url', meta);
    const put = await app.inject({ method: 'PUT', url: u.json().uploadUrl, payload: Buffer.from('12345'), headers: { 'content-type': 'image/jpeg' } });
    expect(put.statusCode).toBe(400);
  });
});

describe('Usuarios desactivados', () => {
  it('pierden el acceso de inmediato, sin borrar su historial', async () => {
    const r = await call('admin', 'PATCH', `/users/${ids.insp2}`, { active: false, reason: 'Fin de contrato' });
    expect(r.statusCode).toBe(200);
    const me = await call('insp2', 'GET', '/me');
    expect(me.statusCode).toBe(401);
    const [u] = await sql`SELECT id FROM users WHERE id = ${ids.insp2}`;
    expect(u).toBeTruthy();
  });
  it('cada cuenta nueva recibe un código de personal según su rol', async () => {
    const r = await call('planner', 'POST', '/users', { email: 'nuevo.inspector@t.pe', displayName: 'Nuevo inspector', role: 'inspector', password: 'abcdefgh1' });
    expect(r.statusCode).toBe(201);
    expect(r.json().staffCode).toMatch(/^INS-\d{3}$/);
    const [{ n }] = await sql`SELECT count(*)::int AS n FROM users WHERE staff_code = ${r.json().staffCode}`;
    expect(n).toBe(1);
  });
  it('el responsable no puede crear administradores', async () => {
    const r = await call('planner', 'POST', '/users', { email: 'nuevo@t.pe', displayName: 'Nuevo', role: 'admin', password: 'abcdefgh1' });
    expect(r.statusCode).toBe(403);
  });
});
