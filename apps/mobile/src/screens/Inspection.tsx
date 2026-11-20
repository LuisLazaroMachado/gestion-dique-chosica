import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getLastInspection, getStructure, type LocalStructure } from '../db';
import { saveInspectionLocally } from '../sync';
import { ACCESS_STATUSES, PHOTO_TYPES, PHYSICAL_STATUSES, SAFETY_RULES, SCALE_DESCRIPTORS, SCALE_NAMES, type PhotoType } from '../catalog';
import { Badge, Btn, C, Card, Chip, Dim, H, Label, PHYSICAL_COLORS, s } from '../ui';

type Key = 'D' | 'C' | 'A';
interface Photo { uri: string; type: PhotoType; capturedAt: string; location: { lat: number; lon: number; mock?: boolean } | null }

export function StructureScreen({ structureId, onBack, onInspect }: { structureId: string; onBack: () => void; onInspect: () => void }) {
  const [st, setSt] = useState<LocalStructure | null>(null);
  const [last, setLast] = useState<any>(null);
  useEffect(() => { getStructure(structureId).then(setSt); getLastInspection(structureId).then(setLast); }, [structureId]);
  if (!st) return null;
  const L = st.location;
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={onBack}><Text style={s.headerLink}>‹ Volver</Text></Pressable>
        <Text style={s.headerTitle}>{st.code}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12 }}>
        <Card>
          <H>{st.name}</H>
          <View style={[s.row, { flexWrap: 'wrap', marginVertical: 4 }]}>
            <Badge text={st.physicalStatus} color={PHYSICAL_COLORS[st.physicalStatus]} />
            <Badge text={st.originInventory === 'linea_base_2024' ? 'Línea base 2024' : 'Ampliación'} color={C.info} />
          </View>
          <Dim>Quebrada: {st.watershed}</Dim>
          <Dim>Coordenada maestra: {L ? `${L.lat.toFixed(6)}, ${L.lon.toFixed(6)}` : 'sin coordenadas'}</Dim>
          {L && <Text style={{ color: L.label === 'Documentado' ? C.ok : C.warn, fontSize: 13 }}>Ubicación {L.label.toLowerCase()} ({L.confidence}). {L.label !== 'Documentado' ? 'Verifique en campo y reporte en observaciones si difiere.' : ''}</Text>}
          {st.sourceReference ? <Dim>Fuente: {st.sourceReference}</Dim> : null}
        </Card>
        <Card>
          <H>Última inspección</H>
          {last ? (
            <>
              <Dim>{new Date(last.inspected_at).toLocaleDateString('es-PE')} · {last.validation_status} · {last.data_label}</Dim>
              <Text>D = {last.damage_score ?? '—'} · C = {last.clogging_score ?? '—'} · A = {last.active_process_score ?? '—'}</Text>
              <Text>Estado físico: {last.physical_status} · Acceso: {last.access_status}</Text>
            </>
          ) : <Dim>Sin inspecciones previas.</Dim>}
        </Card>
        <Card style={{ borderColor: C.warn }}>
          <H>Antes de empezar: seguridad</H>
          {SAFETY_RULES.map((r) => <Text key={r} style={{ marginBottom: 3 }}>• {r}</Text>)}
        </Card>
        <Btn title="Nueva inspección" onPress={onInspect} />
      </ScrollView>
    </View>
  );
}

function ScoreSelector({ k, value, reason, onChange, onReason }: {
  k: Key; value: number | null | undefined; reason: string; onChange: (v: number | null) => void; onReason: (r: string) => void;
}) {
  return (
    <Card>
      <H>{k} — {SCALE_NAMES[k]}</H>
      {SCALE_DESCRIPTORS[k].map((d, i) => (
        <Pressable key={i} onPress={() => onChange(i)} style={{ flexDirection: 'row', paddingVertical: 7, alignItems: 'flex-start' }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: C.primary, marginRight: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: value === i ? C.primary : '#fff' }}>
            <Text style={{ fontWeight: '800', color: value === i ? '#fff' : C.primary }}>{i}</Text>
          </View>
          <Text style={{ flex: 1, fontSize: 14 }}>{d}</Text>
        </Pressable>
      ))}
      <Pressable onPress={() => onChange(null)} style={{ paddingVertical: 6 }}>
        <Text style={{ color: value === null ? C.danger : C.dim, fontWeight: value === null ? '700' : '400' }}>
          {value === null ? '● ' : '○ '}No determinado (no se calculará la prioridad)
        </Text>
      </Pressable>
      {value === null && (
        <TextInput style={s.input} placeholder="Motivo (obligatorio), p. ej. no visible desde punto seguro" value={reason} onChangeText={onReason} />
      )}
    </Card>
  );
}

export function InspectionScreen({ structureId, assignmentId, onDone, onCancel }: {
  structureId: string; assignmentId: string | null; onDone: () => void; onCancel: () => void;
}) {
  const [st, setSt] = useState<LocalStructure | null>(null);
  const [scores, setScores] = useState<Record<Key, number | null | undefined>>({ D: undefined, C: undefined, A: undefined });
  const [reasons, setReasons] = useState<Record<Key, string>>({ D: '', C: '', A: '' });
  const [physical, setPhysical] = useState<string | null>(null);
  const [access, setAccess] = useState<string>('Sin observación');
  const [accessNotes, setAccessNotes] = useState('');
  const [observations, setObservations] = useState('');
  const [verifier, setVerifier] = useState('');
  const [verifierRole, setVerifierRole] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [gps, setGps] = useState<{ lat: number; lon: number; accuracyM?: number; mock?: boolean } | null>(null);
  const [useGps, setUseGps] = useState(true);
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(new Date().toISOString());

  useEffect(() => { getStructure(structureId).then(setSt); }, [structureId]);

  const captureGps = async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert('Ubicación', 'Permiso denegado. La inspección puede guardarse sin GPS.'); return null; }
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const g = { lat: loc.coords.latitude, lon: loc.coords.longitude, accuracyM: loc.coords.accuracy ?? undefined, mock: loc.mocked ?? false };
      setGps(g);
      return g;
    } catch { Alert.alert('Ubicación', 'No se obtuvo GPS. Puede continuar sin ubicación.'); return null; }
  };
  useEffect(() => { if (useGps) captureGps(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const addPhoto = async (type: PhotoType, fromCamera: boolean) => {
    if (type === 'acceso' && photos.filter((p) => p.type === 'acceso').length >= 3) { Alert.alert('Máximo 3 fotos de acceso'); return; }
    if (fromCamera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { Alert.alert('Cámara', 'Permiso denegado.'); return; }
    }
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.[0]) return;
    const loc = useGps ? (gps ?? (await captureGps())) : null;
    setPhotos((p) => [...p, { uri: res.assets[0].uri, type, capturedAt: new Date().toISOString(), location: loc ? { lat: loc.lat, lon: loc.lon, mock: loc.mock } : null }]);
  };

  const validate = (): string | null => {
    for (const k of ['D', 'C', 'A'] as Key[]) {
      if (scores[k] === undefined) return `Seleccione un valor para ${k} (${SCALE_NAMES[k]}) o marque "No determinado".`;
      if (scores[k] === null && !reasons[k].trim()) return `Indique el motivo por el que ${k} no se determinó.`;
    }
    if (!physical) return 'Seleccione el estado físico.';
    if ((access === 'Difícil' || access === 'Restringido') && !accessNotes.trim()) return 'Describa la causa de la dificultad o restricción de acceso.';
    if (!photos.some((p) => p.type === 'general')) return 'La foto de vista general es obligatoria (si es seguro tomarla).';
    return null;
  };

  const save = async () => {
    const err = validate();
    if (err) {
      if (err.startsWith('La foto de vista general')) {
        Alert.alert('Falta foto general', `${err}\n¿Guardar de todos modos?`, [{ text: 'Volver' }, { text: 'Guardar sin foto', onPress: () => doSave(true) }]);
      } else Alert.alert('Revise el formulario', err);
      return;
    }
    doSave(false);
  };

  const doSave = async (noGeneralPhoto: boolean) => {
    setBusy(true);
    const undeterminedReasons: Record<string, string> = {};
    (['D', 'C', 'A'] as Key[]).forEach((k) => { if (scores[k] === null) undeterminedReasons[k] = reasons[k].trim(); });
    let obs = observations.trim();
    if (noGeneralPhoto) obs = `${obs}${obs ? '\n' : ''}[Sin foto de vista general]`.trim();
    const payload = {
      structureId, assignmentId, inspectedAt: startedAt,
      verifierName: verifier.trim() || null, verifierRole: verifierRole.trim() || null,
      damageScore: scores.D ?? null, cloggingScore: scores.C ?? null, activeProcessScore: scores.A ?? null,
      physicalStatus: physical, accessStatus: access, accessNotes: accessNotes.trim() || null, observations: obs || null,
      undeterminedReasons, deviceLocation: useGps && gps ? gps : null,
    };
    try {
      await saveInspectionLocally(structureId, payload, photos);
      Alert.alert('Guardado en el teléfono', 'La inspección se enviará al sincronizar. No se perderá aunque cierre la app.');
      onDone();
    } catch (e) {
      Alert.alert('Error al guardar', String(e));
    }
    setBusy(false);
  };

  if (!st) return null;
  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Pressable onPress={() => Alert.alert('Descartar', '¿Salir sin guardar?', [{ text: 'No' }, { text: 'Sí, salir', onPress: onCancel }])}><Text style={s.headerLink}>‹ Cancelar</Text></Pressable>
        <Text style={s.headerTitle}>Inspección {st.code}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Card>
          <Dim>{st.name} · Inicio: {new Date(startedAt).toLocaleString('es-PE')}</Dim>
          <Label>Especialista / verificador acompañante (opcional)</Label>
          <TextInput style={s.input} value={verifier} onChangeText={setVerifier} placeholder="Nombre" />
          <TextInput style={[s.input, { marginTop: 6 }]} value={verifierRole} onChangeText={setVerifierRole} placeholder="Cargo o especialidad" />
        </Card>
        {(['D', 'C', 'A'] as Key[]).map((k) => (
          <ScoreSelector key={k} k={k} value={scores[k]} reason={reasons[k]}
            onChange={(v) => setScores({ ...scores, [k]: v })} onReason={(r) => setReasons({ ...reasons, [k]: r })} />
        ))}
        <Card>
          <H>Estado físico</H>
          <Dim>Decisión del inspector; no se deriva automáticamente de D+C+A.</Dim>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {PHYSICAL_STATUSES.map((p) => <Chip key={p} label={p} selected={physical === p} color={PHYSICAL_COLORS[p]} onPress={() => setPhysical(p)} />)}
          </View>
        </Card>
        <Card>
          <H>Accesibilidad</H>
          <Dim>Dificultad no equivale a imposibilidad.</Dim>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {ACCESS_STATUSES.map((a) => <Chip key={a} label={a} selected={access === a} onPress={() => setAccess(a)} />)}
          </View>
          {(access === 'Difícil' || access === 'Restringido') && (
            <TextInput style={s.input} placeholder="Causa (obligatoria)" value={accessNotes} onChangeText={setAccessNotes} multiline />
          )}
        </Card>
        <Card>
          <H>Fotos ({photos.length})</H>
          {PHOTO_TYPES.map((t) => (
            <View key={t.value} style={{ marginBottom: 10 }}>
              <Text style={{ fontWeight: '700' }}>{t.label} <Text style={{ fontWeight: '400', color: C.dim }}>· {t.hint}</Text></Text>
              <View style={[s.row, { marginTop: 4 }]}>
                <Btn title="Cámara" kind="light" onPress={() => addPhoto(t.value, true)} style={{ paddingVertical: 8, flex: 1 }} />
                <Btn title="Galería" kind="outline" onPress={() => addPhoto(t.value, false)} style={{ paddingVertical: 8, flex: 1 }} />
              </View>
              <ScrollView horizontal style={{ marginTop: 4 }}>
                {photos.map((p, i) => p.type === t.value && (
                  <Pressable key={i} onLongPress={() => setPhotos(photos.filter((_, j) => j !== i))}>
                    <Image source={{ uri: p.uri }} style={{ width: 90, height: 90, borderRadius: 8, marginRight: 6 }} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ))}
          <Dim>Mantenga presionada una foto para quitarla. No fotografíe desde posiciones inseguras; evite rostros y placas.</Dim>
        </Card>
        <Card>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <H>GPS del teléfono (evidencia)</H>
            <Switch value={useGps} onValueChange={(v) => { setUseGps(v); if (v) captureGps(); else setGps(null); }} />
          </View>
          {useGps && (gps ? (
            <>
              <Text>{gps.lat.toFixed(6)}, {gps.lon.toFixed(6)} {gps.accuracyM ? `(± ${gps.accuracyM.toFixed(0)} m)` : ''}</Text>
              {gps.mock && <Badge text="Ubicación simulada (se registra como tal)" color={C.violet} />}
            </>
          ) : <Dim>Obteniendo ubicación…</Dim>)}
          <Dim>El GPS del teléfono no reemplaza la coordenada maestra de la estructura.</Dim>
          {useGps && <Btn title="Actualizar GPS" kind="outline" onPress={captureGps} style={{ marginTop: 6, paddingVertical: 8 }} />}
        </Card>
        <Card>
          <H>Observaciones</H>
          <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={observations} onChangeText={setObservations}
            placeholder="Detalles relevantes, diferencias de ubicación, riesgos observados…" />
        </Card>
        <Btn title="Revisar y guardar" onPress={save} busy={busy} />
      </ScrollView>
    </View>
  );
}
