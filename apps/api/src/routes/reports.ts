import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  ACCESS_LABELS, ACCESS_OBSTACLE_LABELS, DATA_LABEL_TEXT, MACHINERY_ACCESS_LABELS, MATERIAL_LABELS, ORIGIN_LABELS,
  STRUCTURE_TYPE_LABELS, VALIDATION_LABELS, type Material, type StructureType,
} from '@dique/shared';
import { sql } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { notFound } from '../errors.js';
import { storage } from '../storage.js';

// Reportes descargables para informes, oficios y reuniones: lista de prioridades e inventario (Excel)
// y ficha individual de cada estructura (PDF). Todos indican qué datos son aproximados.

const lima = (d: unknown, withTime = false) => {
  if (!d) return '-';
  const date = new Date(d as string);
  return withTime
    ? date.toLocaleString('es-PE', { timeZone: 'America/Lima', dateStyle: 'short', timeStyle: 'short' })
    : date.toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
};
const num = (v: unknown, digits = 3) => (v == null ? null : Number(Number(v).toFixed(digits)));
const today = () => new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' }).replace(/\//g, '-');

function styleHeader(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C4F82' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
}

export async function reportRoutes(app: FastifyInstance) {
  // ───── Excel: prioridades, falta de información e inventario ─────
  app.get('/reports/priorities.xlsx', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const [batch] = await sql`SELECT * FROM priority_batches ORDER BY calculated_at DESC LIMIT 1`;
    const rows = batch ? await sql`
      SELECT pc.*, s.code, s.name, s.watershed, s.origin_inventory, s.physical_status, s.intervention_status,
             i.data_label AS insp_label, e.data_label AS exp_label, li.access_status, li.machinery_access,
             ur.level AS urgency, ur.justification AS urgency_reason
        FROM priority_calculations pc
        JOIN structures s ON s.id = pc.structure_id
        JOIN inspections i ON i.id = pc.inspection_id
        JOIN exposure_estimates e ON e.id = pc.exposure_id
        LEFT JOIN LATERAL (SELECT access_status, machinery_access FROM inspections x WHERE x.structure_id = s.id
                            AND x.validation_status <> 'Observado' ORDER BY inspected_at DESC LIMIT 1) li ON true
        LEFT JOIN LATERAL (SELECT level, justification FROM urgencies u WHERE u.structure_id = s.id ORDER BY created_at DESC LIMIT 1) ur ON true
       WHERE pc.batch_id = ${batch.id} ORDER BY pc.p DESC, s.code` : [];
    const missing = batch ? await sql`
      SELECT s.code, s.name, s.watershed FROM structures s
       WHERE s.active AND NOT EXISTS (SELECT 1 FROM priority_calculations pc WHERE pc.batch_id = ${batch.id} AND pc.structure_id = s.id)
       ORDER BY s.code` : [];
    const inventory = await sql`
      SELECT s.*, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon, li.inspected_at, li.machinery_access, li.access_status
        FROM structures s
        LEFT JOIN LATERAL (SELECT inspected_at, machinery_access, access_status FROM inspections i
                            WHERE i.structure_id = s.id AND i.validation_status = 'Validado' ORDER BY inspected_at DESC LIMIT 1) li ON true
       WHERE s.active ORDER BY s.origin_inventory, s.watershed, s.source_number NULLS LAST, s.code`;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Priori Dique Chosica';
    wb.created = new Date();

    const info = wb.addWorksheet('Cómo leer');
    info.columns = [{ width: 110 }];
    [
      'Priori Dique Chosica: reporte de prioridades e inventario',
      `Generado: ${lima(new Date(), true)} por ${user.displayName} (${user.staffCode})`,
      `Cálculo de prioridades: ${lima(batch?.calculated_at, true)}. Personas expuestas máximas del inventario (Nmax): ${batch ? Math.round(Number(batch.n_max)) : '-'}`,
      '',
      'Prioridad (P) = Estado (E) × Exposición (X). Va de 0 a 1: mientras más alta, más urge atender. No es la probabilidad de falla.',
      'E = (Daño + Material acumulado + Erosión) / 9, cada uno calificado de 0 a 3 por el inspector.',
      'X = Personas expuestas (N) / Nmax.',
      'La urgencia y el acceso se informan aparte y no cambian la prioridad. La decisión final es del responsable.',
      '"Aproximado" indica datos calculados con un método que aún deben confirmarse en campo.',
    ].forEach((t, i) => { const r = info.addRow([t]); if (i === 0) r.font = { bold: true, size: 14 }; });

    const ws = wb.addWorksheet('Prioridades');
    ws.columns = [
      { header: 'N.°', key: 'rank', width: 6 }, { header: 'Código', key: 'code', width: 11 }, { header: 'Estructura', key: 'name', width: 36 },
      { header: 'Quebrada', key: 'ws', width: 18 }, { header: 'Registro', key: 'origin', width: 18 },
      { header: 'Daño (D)', key: 'd', width: 9 }, { header: 'Material (C)', key: 'c', width: 11 }, { header: 'Erosión (A)', key: 'a', width: 10 },
      { header: 'Estado E', key: 'e', width: 9 }, { header: 'Personas N', key: 'n', width: 11 }, { header: 'Exposición X', key: 'x', width: 11 },
      { header: 'Prioridad P', key: 'p', width: 11 }, { header: 'Urgencia', key: 'urg', width: 11 }, { header: 'Motivo de urgencia', key: 'urgr', width: 30 },
      { header: 'Acceso', key: 'acc', width: 16 }, { header: 'Maquinaria', key: 'mach', width: 22 }, { header: 'Estado físico', key: 'phys', width: 14 },
      { header: 'Trabajos', key: 'int', width: 16 }, { header: 'Datos', key: 'data', width: 12 },
    ];
    rows.forEach((r, i) => ws.addRow({
      rank: i + 1, code: r.code, name: r.name, ws: r.watershed, origin: ORIGIN_LABELS[r.origin_inventory] ?? r.origin_inventory,
      d: r.d, c: r.c, a: r.a, e: num(r.e), n: Math.round(Number(r.n_persons)), x: num(r.x), p: num(r.p, 4),
      urg: r.urgency ?? '-', urgr: r.urgency_reason ?? '', acc: r.access_status ? (ACCESS_LABELS[r.access_status] ?? r.access_status) : '-',
      mach: r.machinery_access ? MACHINERY_ACCESS_LABELS[r.machinery_access] : 'Sin dato', phys: r.physical_status, int: r.intervention_status,
      data: r.insp_label === 'Documentado' && r.exp_label === 'Documentado' ? 'Confirmado' : 'Aproximado',
    }));
    styleHeader(ws);

    const wm = wb.addWorksheet('Falta información');
    wm.columns = [{ header: 'Código', key: 'code', width: 11 }, { header: 'Estructura', key: 'name', width: 40 }, { header: 'Quebrada', key: 'ws', width: 20 }];
    missing.forEach((r) => wm.addRow({ code: r.code, name: r.name, ws: r.watershed }));
    styleHeader(wm);

    const wi = wb.addWorksheet('Inventario');
    wi.columns = [
      { header: 'Código', key: 'code', width: 11 }, { header: 'Nombre', key: 'name', width: 36 }, { header: 'Quebrada', key: 'ws', width: 18 },
      { header: 'Registro', key: 'origin', width: 18 }, { header: 'Tipo', key: 'type', width: 18 }, { header: 'Material', key: 'mat', width: 14 },
      { header: 'Estado físico', key: 'phys', width: 14 }, { header: 'Trabajos', key: 'int', width: 16 },
      { header: 'Latitud', key: 'lat', width: 12 }, { header: 'Longitud', key: 'lon', width: 12 }, { header: 'Ubicación', key: 'loc', width: 13 },
      { header: 'Última inspección aprobada', key: 'last', width: 16 }, { header: 'Maquinaria', key: 'mach', width: 22 },
    ];
    inventory.forEach((s) => wi.addRow({
      code: s.code, name: s.name, ws: s.watershed, origin: ORIGIN_LABELS[s.origin_inventory] ?? s.origin_inventory,
      type: STRUCTURE_TYPE_LABELS[s.structure_type as StructureType] ?? s.structure_type, mat: MATERIAL_LABELS[s.material as Material] ?? s.material,
      phys: s.physical_status, int: s.intervention_status, lat: num(s.lat, 6), lon: num(s.lon, 6),
      loc: DATA_LABEL_TEXT[s.location_label] ?? s.location_label, last: lima(s.inspected_at),
      mach: s.machinery_access ? MACHINERY_ACCESS_LABELS[s.machinery_access] : 'Sin dato',
    }));
    styleHeader(wi);

    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('Content-Disposition', `attachment; filename="prioridades-diques-${today()}.xlsx"`);
    return reply.send(buf);
  });

  // ───── PDF: ficha individual de una estructura ─────
  app.get('/reports/structures/:id.pdf', async (req, reply) => {
    const user = await authenticate(req);
    requireRole(user, 'planner', 'admin');
    const { id } = req.params as { id: string };
    const [s] = await sql`SELECT s.*, ST_Y(s.geom) AS lat, ST_X(s.geom) AS lon FROM structures s WHERE s.id = ${id}`;
    if (!s) throw notFound('Estructura no encontrada');
    const insps = await sql`
      SELECT i.*, u.display_name AS inspector_name, u.staff_code AS inspector_code,
             ST_Y(i.vehicle_point) AS veh_lat, ST_X(i.vehicle_point) AS veh_lon
        FROM inspections i JOIN users u ON u.id = i.inspector_id
       WHERE i.structure_id = ${id} ORDER BY i.inspected_at DESC LIMIT 5`;
    const [prio] = await sql`SELECT * FROM priority_calculations WHERE structure_id = ${id} ORDER BY calculated_at DESC LIMIT 1`;
    const [exp] = await sql`SELECT * FROM exposure_estimates WHERE structure_id = ${id} ORDER BY valid_from DESC, created_at DESC LIMIT 1`;
    const [urg] = await sql`SELECT * FROM urgencies WHERE structure_id = ${id} ORDER BY created_at DESC LIMIT 1`;
    const ints = await sql`SELECT * FROM interventions WHERE structure_id = ${id} ORDER BY created_at DESC LIMIT 5`;
    const last = insps.find((i) => i.validation_status !== 'Observado') ?? null;
    const photos = last ? await sql`
      SELECT id, object_key, evidence_type, content_type FROM evidence
       WHERE inspection_id = ${last.id} AND upload_status = 'confirmada' AND content_type IN ('image/jpeg','image/png')
       ORDER BY (evidence_type = 'general') DESC, created_at LIMIT 2` : [];

    const doc = new PDFDocument({ size: 'A4', margin: 46, info: { Title: `Ficha ${s.code}`, Author: 'Priori Dique Chosica' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const blue = '#1c4f82';
    const W = doc.page.width - 92;
    const section = (title: string) => {
      if (doc.y > doc.page.height - 140) doc.addPage();
      doc.moveDown(0.6).fillColor(blue).font('Helvetica-Bold').fontSize(12).text(title);
      doc.moveTo(46, doc.y + 2).lineTo(46 + W, doc.y + 2).strokeColor('#ced4da').stroke();
      doc.moveDown(0.4).fillColor('#212529').font('Helvetica').fontSize(10);
    };
    const field = (label: string, value: unknown) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(String(value ?? '-'));
    };

    doc.rect(0, 0, doc.page.width, 70).fill(blue);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(`${s.code}  ${s.name}`, 46, 20, { width: W });
    doc.font('Helvetica').fontSize(9).text(`Ficha de estructura de protección · Priori Dique Chosica · ${lima(new Date(), true)}`, 46, 46);
    doc.fillColor('#212529').fontSize(10).text('', 46, 90);

    section('Datos generales');
    field('Quebrada', s.watershed);
    field('Registro', ORIGIN_LABELS[s.origin_inventory] ?? s.origin_inventory);
    field('Tipo', STRUCTURE_TYPE_LABELS[s.structure_type as StructureType] ?? s.structure_type);
    field('Material', MATERIAL_LABELS[s.material as Material] ?? s.material);
    field('Estado físico', s.physical_status);
    field('Trabajos', s.intervention_status);
    field('Coordenadas', s.lat != null ? `${Number(s.lat).toFixed(6)}, ${Number(s.lon).toFixed(6)}` : 'Sin ubicación');
    field('Ubicación', `${DATA_LABEL_TEXT[s.location_label] ?? s.location_label}${s.location_precision_m ? ` (margen ± ${s.location_precision_m} m)` : ''}`);
    if (s.elevation_m != null) field('Altitud', `${s.elevation_m} m s. n. m.`);
    if (s.lat != null) doc.fillColor('#1c7ed6').text('Ver en Google Maps', { link: `https://www.google.com/maps?q=${s.lat},${s.lon}`, underline: true }).fillColor('#212529');

    section('Prioridad');
    if (prio) {
      doc.font('Helvetica-Bold').fontSize(16).text(`P = ${Number(prio.p).toFixed(2)}`).font('Helvetica').fontSize(10);
      field('Estado de la estructura (E)', `${Number(prio.e).toFixed(2)}  (daño ${prio.d} + material ${prio.c} + erosión ${prio.a}, sobre 9)`);
      field('Personas expuestas (X)', `${Number(prio.x).toFixed(2)}  (${Math.round(Number(prio.n_persons))} de ${Math.round(Number(prio.n_max))}, el máximo del inventario)`);
      field('Calculado', lima(prio.calculated_at, true));
      doc.fontSize(8).fillColor('#6c757d').text('P = E × X. Va de 0 a 1; mientras más alta, más urge. No es la probabilidad de falla.').fillColor('#212529').fontSize(10);
    } else {
      doc.text('Falta información para calcular la prioridad.');
    }
    if (urg) field('Urgencia', `${urg.level}: ${urg.justification}`);
    if (exp) {
      field('Personas expuestas (N)', `${Math.round(Number(exp.estimated_persons))}${exp.method === 'VxH' ? ` (${exp.affected_homes} viviendas × ${exp.persons_per_home} personas)` : ''}`);
      field('Tipo de dato', DATA_LABEL_TEXT[exp.data_label] ?? exp.data_label);
    }

    section('Acceso');
    if (last) {
      field('Camino hasta la estructura', ACCESS_LABELS[last.access_status] ?? last.access_status);
      if (last.access_notes) field('Detalle', last.access_notes);
      field('¿Llega maquinaria?', last.machinery_access ? MACHINERY_ACCESS_LABELS[last.machinery_access] : 'Sin dato');
      if (last.access_obstacles?.length) field('Obstáculos', last.access_obstacles.map((o: string) => ACCESS_OBSTACLE_LABELS[o] ?? o).join(', '));
      if (last.veh_lat != null) field('Último punto en vehículo', `${Number(last.veh_lat).toFixed(6)}, ${Number(last.veh_lon).toFixed(6)}`);
    } else {
      doc.text('Sin inspecciones.');
    }

    section('Inspecciones recientes');
    if (!insps.length) doc.text('Sin inspecciones.');
    for (const i of insps) {
      doc.font('Helvetica-Bold').text(`${lima(i.inspected_at, true)} · ${i.inspector_name} (${i.inspector_code}) · ${VALIDATION_LABELS[i.validation_status] ?? i.validation_status}`);
      doc.font('Helvetica').text(`Daño ${i.damage_score ?? '-'} · Material ${i.clogging_score ?? '-'} · Erosión ${i.active_process_score ?? '-'} · Estado: ${i.physical_status}${i.data_label !== 'Documentado' ? ' · Valores aproximados' : ''}`);
      if (i.observations) doc.fontSize(9).fillColor('#495057').text(i.observations, { width: W }).fillColor('#212529').fontSize(10);
      doc.moveDown(0.3);
    }

    if (photos.length) {
      section('Fotos de la última inspección');
      const y0 = doc.y;
      let x = 46;
      for (const ph of photos) {
        try {
          const img = await storage.get(ph.object_key);
          doc.image(img, x, y0, { fit: [W / 2 - 8, 180] });
          x += W / 2 + 8;
        } catch { /* foto no disponible */ }
      }
      doc.y = y0 + 190;
    }

    section('Trabajos');
    if (!ints.length) doc.text('Sin trabajos registrados.');
    for (const t of ints) doc.text(`${lima(t.created_at)} · ${t.intervention_type} · ${t.status}${t.machinery ? ` · Maquinaria: ${t.machinery}` : ''}`);

    doc.moveDown(1).fontSize(8).fillColor('#6c757d').text(
      'Herramienta de apoyo a la decisión. No certifica la seguridad estructural ni emite alertas oficiales. '
      + 'Los datos marcados como aproximados deben confirmarse en campo.', { width: W });
    doc.end();
    const pdf = await done;
    reply.header('Content-Type', 'application/pdf').header('Content-Disposition', `attachment; filename="ficha-${s.code}.pdf"`);
    return reply.send(pdf);
  });
}
