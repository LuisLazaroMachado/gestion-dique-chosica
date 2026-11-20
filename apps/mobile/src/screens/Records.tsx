import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { getDb, type OutboxInspection } from '../db';
import { queueCorrection, syncAll } from '../sync';
import { Badge, Btn, C, Card, Dim, H, Label, s } from '../ui';

const STATUS_COLORS: Record<string, string> = { pendiente: C.warn, enviado: C.info, confirmado: C.ok, error: C.danger };
const STATUS_LABELS: Record<string, string> = { pendiente: 'Por enviar', enviado: 'Enviando', confirmado: 'Enviada', error: 'No se pudo enviar' };

export function RecordsScreen({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Array<OutboxInspection & { code: string; photos: any[]; corrections: any[] }>>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [corr, setCorr] = useState({ D: '', C: '', A: '', reason: '' });

  const load = useCallback(async () => {
    const db = await getDb();
    const ins = await db.getAllAsync<OutboxInspection & { sdata: string | null }>(
      'SELECT o.*, s.data AS sdata FROM outbox_inspections o LEFT JOIN structures s ON s.id = o.structure_id ORDER BY o.created_at DESC LIMIT 100');
    const out = [];
    for (const r of ins) {
      const photos = await db.getAllAsync('SELECT id, evidence_type, status, error FROM outbox_photos WHERE inspection_local_id = ?', r.id);
      const corrections = await db.getAllAsync('SELECT id, status, error, payload FROM outbox_corrections WHERE inspection_local_id = ?', r.id);
      const p = JSON.parse(r.payload);
      out.push({ ...r, code: r.sdata ? JSON.parse(r.sdata).code : p.structureId.slice(0, 8), photos, corrections });
    }
    setRows(out);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submitCorrection = async (id: string) => {
    const changes: Record<string, number> = {};
    for (const [k, f] of [['D', 'damageScore'], ['C', 'cloggingScore'], ['A', 'activeProcessScore']] as const) {
      const v = corr[k].trim();
      if (v !== '') {
        const n = Number(v);
        if (!Number.isInteger(n) || n < 0 || n > 3) { Alert.alert('Valor inválido', `${k} debe ser 0, 1, 2 o 3`); return; }
        changes[f] = n;
      }
    }
    if (!Object.keys(changes).length) { Alert.alert('Sin cambios', 'Indique al menos un valor corregido.'); return; }
    if (corr.reason.trim().length < 3) { Alert.alert('Motivo', 'Indique el motivo de la corrección.'); return; }
    await queueCorrection(id, corr.reason.trim(), changes);
    setEditing(null); setCorr({ D: '', C: '', A: '', reason: '' });
    const r = await syncAll(); await load();
    Alert.alert(r.ok ? 'Corrección enviada' : 'Corrección guardada', r.ok ? 'Queda registrado el valor anterior, el nuevo y el motivo.' : 'Se enviará cuando tengas internet.');
  };

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={onBack}><Text style={s.headerLink}>‹ Volver</Text></Pressable>
        <Text style={s.headerTitle}>Mis envíos</Text>
      </View>
      <FlatList data={rows} keyExtractor={(r) => r.id} contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        ListEmptyComponent={<Dim>Todavía no has hecho inspecciones en este teléfono.</Dim>}
        renderItem={({ item }) => {
          const p = JSON.parse(item.payload);
          return (
            <Card>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <H>{item.code}</H>
                <Badge text={STATUS_LABELS[item.status] ?? item.status} color={STATUS_COLORS[item.status]} />
              </View>
              <Dim>{new Date(p.inspectedAt).toLocaleString('es-PE')} · Daño {p.damageScore ?? 's/d'} · Material {p.cloggingScore ?? 's/d'} · Erosión {p.activeProcessScore ?? 's/d'} · {p.physicalStatus}</Dim>
              <Dim>Fotos enviadas: {item.photos.filter((f: any) => f.status === 'confirmado').length} de {item.photos.length}</Dim>
              {p.machineryAccess ? <Dim>Maquinaria: {p.machineryAccess === 'Sí' ? 'sí llega' : p.machineryAccess === 'No' ? 'no llega' : p.machineryAccess === 'Solo pequeña' ? 'solo pequeña' : 'no se sabe'}</Dim> : null}
              {item.error ? <Text style={{ color: C.danger, marginTop: 4 }}>{item.error}</Text> : null}
              {item.photos.filter((f: any) => f.error).map((f: any) => <Text key={f.id} style={{ color: C.danger, fontSize: 12 }}>Foto {f.evidence_type}: {f.error}</Text>)}
              {item.validation_status && (
                <Text style={{ marginTop: 4, fontWeight: '700', color: item.validation_status === 'Observado' ? C.warn : item.validation_status === 'Validado' ? C.ok : C.info }}>
                  {item.validation_status === 'Validado' ? 'Revisada y aprobada por el responsable' : item.validation_status === 'Observado' ? 'El responsable pidió revisar' : 'Esperando revisión del responsable'}{item.validation_notes ? `: ${item.validation_notes}` : ''}
                </Text>
              )}
              {item.corrections.map((c: any) => (
                <Text key={c.id} style={{ fontSize: 12, color: c.status === 'error' ? C.danger : C.dim }}>
                  Corrección: {JSON.parse(c.payload).reason} · {c.status}{c.error ? ` (${c.error})` : ''}
                </Text>
              ))}
              {item.status === 'confirmado' && editing !== item.id && (
                <Btn title="Corregir" kind="outline" onPress={() => setEditing(item.id)} style={{ marginTop: 8, paddingVertical: 8 }} />
              )}
              {editing === item.id && (
                <View style={{ marginTop: 8 }}>
                  <Label>Nuevos valores (deja vacío lo que no cambia)</Label>
                  <View style={s.row}>
                    {(['D', 'C', 'A'] as const).map((k) => (
                      <TextInput placeholderTextColor="#868e96" key={k} style={[s.input, { flex: 1 }]} placeholder={k} keyboardType="number-pad" maxLength={1}
                        value={corr[k]} onChangeText={(v) => setCorr({ ...corr, [k]: v })} />
                    ))}
                  </View>
                  <TextInput placeholderTextColor="#868e96" style={[s.input, { marginTop: 6 }]} placeholder="Motivo de la corrección (obligatorio)" value={corr.reason} onChangeText={(v) => setCorr({ ...corr, reason: v })} />
                  <View style={[s.row, { marginTop: 6 }]}>
                    <Btn title="Enviar corrección" onPress={() => submitCorrection(item.id)} style={{ flex: 1, paddingVertical: 8 }} />
                    <Btn title="Cancelar" kind="outline" onPress={() => setEditing(null)} style={{ flex: 1, paddingVertical: 8 }} />
                  </View>
                </View>
              )}
            </Card>
          );
        }} />
    </View>
  );
}
