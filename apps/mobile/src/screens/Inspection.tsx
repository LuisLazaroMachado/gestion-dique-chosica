import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { getLastInspection, getStructure, type LocalStructure } from '../db';
import { saveInspectionLocally } from '../sync';
import { ACCESS_OBSTACLES, MACHINERY_ACCESS, MACHINERY_ACCESS_LABELS, ACCESS_LABELS, ACCESS_STATUSES, PHOTO_TYPES, PHYSICAL_STATUSES, SAFETY_RULES, SCALE_DESCRIPTORS, SCALE_NAMES, type PhotoType } from '../catalog';
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
            <Badge text={st.originInventory === 'linea_base_2024' ? 'Inventario inicial' : 'Agregada después'} color={C.info} />
          </View>
          <Dim>Quebrada: {st.watershed}</Dim>
          <Dim>Ubicación registrada: {L ? `${L.lat.toFixed(6)}, ${L.lon.toFixed(6)}` : 'sin ubicación'}</Dim>
          {L && <Text style={{ color: L.label === 'Documentado' ? C.ok : C.warn, fontSize: 13 }}>{L.label === 'Documentado' ? 'Ubicación confirmada.' : 'Ubicación aproximada: si en el lugar no coincide, anótalo en observaciones.'}</Text>}
        </Card>
        <Card>
          <H>Última inspección</H>
          {last ? (
            <>
              <Dim>{new Date(last.inspected_at).toLocaleDateString('es-PE')}</Dim>
              <Text>Daño: {last.damage_score ?? 'sin dato'} · Material acumulado: {last.clogging_score ?? 'sin dato'} · Erosión: {last.active_process_score ?? 'sin dato'}</Text>
              <Text>Estado: {last.physical_status} · Acceso: {ACCESS_LABELS[last.access_status] ?? last.access_status}</Text>
            </>
          ) : <Dim>Sin inspecciones previas.</Dim>}
        </Card>
        <Card style={{ borderColor: C.warn }}>
          <H>Antes de empezar: tu seguridad primero</H>
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
      <H>{k}: {SCALE_NAMES[k]}</H>
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
          {value === null ? '● ' : '○ '}No se pudo evaluar
        </Text>
      </Pressable>
      {value === null && (
        <TextInput placeholderTextColor="#868e96" style={s.input} placeholder="¿Por qué? (obligatorio), p. ej. no se ve desde un lugar seguro" value={reason} onChangeText={onReason} />
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
  const [machinery, setMachinery] = useState<string | null>(null);
  const [obstacles, setObstacles] = useState<string[]>([]);
  const [vehiclePoint, setVehiclePoint] = useState<{ lat: number; lon: number; mock?: boolean } | null>(null);
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
    const remaining = type === 'acceso' ? 3 - photos.filter((p) => p.type === 'acceso').length : 10;
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.6, exif: false,
      allowsMultipleSelection: !fromCamera, selectionLimit: remaining };
    const res = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (res.canceled || !res.assets?.length) return;
    const loc = useGps ? (gps ?? (await captureGps())) : null;
    const now = new Date().toISOString();
    setPhotos((p) => [...p, ...res.assets.slice(0, remaining).map((a) => ({ uri: a.uri, type, capturedAt: now, location: loc ? { lat: loc.lat, lon: loc.lon, mock: loc.mock } : null }))]);
  };

  const markVehiclePoint = async () => {
    const g = await captureGps();
    if (g) {
      setVehiclePoint({ lat: g.lat, lon: g.lon, mock: g.mock });
      Alert.alert('Punto marcado', 'Se guardó tu ubicación actual como el último punto donde llega un vehículo.');
    }
  };

  const validate = (): string | null => {
    for (const k of ['D', 'C', 'A'] as Key[]) {
      if (scores[k] === undefined) return `Elige un valor para "${SCALE_NAMES[k]}" o marca "No se pudo evaluar".`;
      if (scores[k] === null && !reasons[k].trim()) return `Explica por qué no se pudo evaluar "${SCALE_NAMES[k]}".`;
    }
    if (!physical) return 'Elige el estado general de la estructura.';
    if ((access === 'Difícil' || access === 'Restringido') && !accessNotes.trim()) return 'Explica por qué fue difícil llegar.';
    if (!machinery) return 'Indica si puede llegar maquinaria hasta la estructura (o "No se sabe").';
    if ((machinery === 'No' || machinery === 'Solo pequeña') && !obstacles.length && !accessNotes.trim()) {
      return 'Marca al menos un obstáculo o describe el camino, para que el responsable sepa por qué no llega la maquinaria.';
    }
    if (!photos.some((p) => p.type === 'general')) return 'La foto de vista general es obligatoria, si es seguro tomarla.';
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
    const needsAccessPhoto = (machinery && machinery !== 'Sí') || access === 'Difícil' || access === 'Restringido' || access === 'No determinado';
    if (needsAccessPhoto && !photos.some((p) => p.type === 'acceso')) {
      Alert.alert('Falta foto del camino', 'El responsable decidirá cómo llegar con la maquinaria según tus fotos. ¿Tomas una foto del camino (si es seguro) o guardas sin ella?',
        [{ text: 'Tomar foto', onPress: () => addPhoto('acceso', true) }, { text: 'Guardar sin foto', onPress: () => doSave(false) }]);
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
      machineryAccess: machinery, accessObstacles: obstacles, vehiclePoint,
    };
    try {
      await saveInspectionLocally(structureId, payload, photos);
      Alert.alert('Inspección guardada', 'Quedó guardada en el teléfono. Se enviará cuando toques "Enviar pendientes" con internet. No se pierde aunque cierres la app.');
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
          <Text style={{ fontWeight: '700', marginTop: 10 }}>¿Te acompaña un especialista? (opcional)</Text>
          <Dim>Si alguien, como un ingeniero, te ayuda a evaluar, anota sus datos.</Dim>
          <Label>Nombre del especialista</Label>
          <TextInput placeholderTextColor="#868e96" style={s.input} value={verifier} onChangeText={setVerifier} placeholder="Ej.: Ing. Ana Torres" />
          <Label>Profesión o cargo</Label>
          <TextInput placeholderTextColor="#868e96" style={s.input} value={verifierRole} onChangeText={setVerifierRole} placeholder="Ej.: Ingeniera civil" />
        </Card>
        {(['D', 'C', 'A'] as Key[]).map((k) => (
          <ScoreSelector key={k} k={k} value={scores[k]} reason={reasons[k]}
            onChange={(v) => setScores({ ...scores, [k]: v })} onReason={(r) => setReasons({ ...reasons, [k]: r })} />
        ))}
        <Card>
          <H>Estado general de la estructura</H>
          <Dim>Tu evaluación general según lo que viste.</Dim>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {PHYSICAL_STATUSES.map((p) => <Chip key={p} label={p} selected={physical === p} color={PHYSICAL_COLORS[p]} onPress={() => setPhysical(p)} />)}
          </View>
        </Card>
        <Card>
          <H>¿Cómo es el camino hasta la estructura?</H>
          <Dim>Tu observación del acceso. Ayuda a planificar cómo llegarán las personas y la maquinaria.</Dim>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {ACCESS_STATUSES.map((a) => <Chip key={a} label={ACCESS_LABELS[a]} selected={access === a} onPress={() => setAccess(a)} />)}
          </View>
          {(access === 'Difícil' || access === 'Restringido') && (
            <TextInput placeholderTextColor="#868e96" style={s.input} placeholder="¿Qué lo dificulta o impide? (obligatorio)" value={accessNotes} onChangeText={setAccessNotes} multiline />
          )}
        </Card>
        <Card>
          <H>¿Puede llegar maquinaria hasta la estructura?</H>
          <Dim>Por ejemplo, una retroexcavadora o un volquete. El responsable decidirá cómo llegar con esta información y tus fotos.</Dim>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
            {MACHINERY_ACCESS.map((m) => <Chip key={m} label={MACHINERY_ACCESS_LABELS[m]} selected={machinery === m}
              color={m === 'Sí' ? C.ok : m === 'No' ? C.danger : m === 'Solo pequeña' ? C.warn : C.dim} onPress={() => setMachinery(m)} />)}
          </View>
          {machinery && machinery !== 'Sí' && (
            <>
              <Label>¿Qué lo impide o dificulta? (marca todos los que apliquen)</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {ACCESS_OBSTACLES.map((o) => <Chip key={o.value} label={o.label} selected={obstacles.includes(o.value)}
                  onPress={() => setObstacles(obstacles.includes(o.value) ? obstacles.filter((x) => x !== o.value) : [...obstacles, o.value])} />)}
              </View>
              <Label>¿Hasta dónde llega un vehículo?</Label>
              <Dim>Párate en el último punto donde puede llegar un vehículo y toca el botón. La ruta de la maquinaria terminará ahí.</Dim>
              <Btn title={vehiclePoint ? 'Volver a marcar el punto' : 'Marcar aquí el último punto en vehículo'} kind="light" onPress={markVehiclePoint} style={{ marginTop: 6 }} />
              {vehiclePoint && <Text style={{ marginTop: 4 }}>Punto marcado: {vehiclePoint.lat.toFixed(5)}, {vehiclePoint.lon.toFixed(5)}{vehiclePoint.mock ? ' (simulado)' : ''}</Text>}
              <Dim>No olvides tomar fotos del camino en la sección "Camino de acceso".</Dim>
            </>
          )}
        </Card>
        <Card>
          <H>Fotos ({photos.length})</H>
          <Dim>Puedes agregar varias fotos de cada tipo. Desde la galería puedes elegir varias a la vez.</Dim>
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
          <Dim>Mantén presionada una foto para quitarla. No tomes fotos desde lugares peligrosos y evita captar rostros o placas.</Dim>
        </Card>
        <Card>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <H>Ubicación del teléfono</H>
            <Switch value={useGps} onValueChange={(v) => { setUseGps(v); if (v) captureGps(); else setGps(null); }} />
          </View>
          {useGps && (gps ? (
            <>
              <Text>{gps.lat.toFixed(6)}, {gps.lon.toFixed(6)} {gps.accuracyM ? `(± ${gps.accuracyM.toFixed(0)} m)` : ''}</Text>
              {gps.mock && <Badge text="Ubicación simulada (quedará marcada así)" color={C.violet} />}
            </>
          ) : <Dim>Obteniendo ubicación…</Dim>)}
          <Dim>Se guarda como prueba de dónde se hizo la inspección.</Dim>
          {useGps && <Btn title="Actualizar GPS" kind="outline" onPress={captureGps} style={{ marginTop: 6, paddingVertical: 8 }} />}
        </Card>
        <Card>
          <H>Observaciones</H>
          <TextInput placeholderTextColor="#868e96" style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} multiline value={observations} onChangeText={setObservations}
            placeholder="Cualquier detalle importante: riesgos, cambios, si la ubicación no coincide…" />
        </Card>
        <Btn title="Guardar inspección" onPress={save} busy={busy} />
      </ScrollView>
    </View>
  );
}
