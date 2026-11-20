import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { kvGet, listAssignments, queueCounts } from '../db';
import { syncAll, downloadAssignments } from '../sync';
import { ApiError } from '../api';
import { Badge, Btn, C, Card, Dim, H, PHYSICAL_COLORS, s } from '../ui';

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : 'Nunca');

export function HomeScreen({ onOpen, onRecords, onLogout }: { onOpen: (structureId: string, assignmentId: string) => void; onRecords: () => void; onLogout: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [counts, setCounts] = useState<any>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  const load = useCallback(async () => {
    setItems(await listAssignments());
    setCounts(await queueCounts());
    setLastSync(await kvGet('last_sync'));
    const u = await kvGet('user'); setUser(u ? JSON.parse(u) : null);
  }, []);

  useEffect(() => {
    load();
    const unsub = NetInfo.addEventListener((st) => setOnline(Boolean(st.isConnected && st.isInternetReachable !== false)));
    return unsub;
  }, [load]);

  const sync = async () => {
    setBusy(true);
    const r = await syncAll();
    await load();
    setBusy(false);
    if (!r.ok) Alert.alert('No se pudo enviar todo', `${r.message}\n\nTus inspecciones siguen guardadas en el teléfono. Vuelve a intentarlo cuando tengas internet.`);
  };
  const refresh = async () => {
    setBusy(true);
    try { await downloadAssignments(); } catch (e) { Alert.alert('Sin conexión', e instanceof ApiError ? e.full : String(e)); }
    await load(); setBusy(false);
  };

  const pending = (counts?.inspections?.pendiente ?? 0) + (counts?.inspections?.enviado ?? 0) + (counts?.photos?.pendiente ?? 0) + (counts?.corrections?.pendiente ?? 0);
  const errors = (counts?.inspections?.error ?? 0) + (counts?.photos?.error ?? 0) + (counts?.corrections?.error ?? 0);

  return (
    <View style={s.screen}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Por inspeccionar</Text>
        <Pressable onPress={onRecords}><Text style={s.headerLink}>Mis envíos</Text></Pressable>
        <Pressable onPress={() => Alert.alert('Cerrar sesión', 'Lo que no hayas enviado se queda guardado en el teléfono.', [{ text: 'Cancelar' }, { text: 'Salir', onPress: onLogout }])}>
          <Text style={s.headerLink}>Salir</Text>
        </Pressable>
      </View>
      <View style={{ padding: 12 }}>
        <Card style={{ marginBottom: 6 }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '700' }}>{user?.displayName ?? ''}</Text>
              <Dim>{online === null ? '…' : online ? '● Con internet' : '○ Sin internet: puedes seguir trabajando'}{'\n'}Último envío: {fmt(lastSync)}</Dim>
              <View style={[s.row, { marginTop: 6, flexWrap: 'wrap' }]}>
                <Badge text={`Por enviar: ${pending}`} color={pending ? C.warn : C.dim} />
                <Badge text={`Enviados: ${(counts?.inspections?.confirmado ?? 0)} inspecciones, ${(counts?.photos?.confirmado ?? 0)} fotos`} color={C.ok} />
                {errors > 0 && <Badge text={`No se pudieron enviar: ${errors}`} color={C.danger} />}
              </View>
            </View>
          </View>
          <View style={[s.row, { marginTop: 10 }]}>
            <Btn title="Enviar pendientes" onPress={sync} busy={busy} style={{ flex: 1 }} />
            <Btn title="Actualizar lista" kind="light" onPress={refresh} disabled={busy} style={{ flex: 1 }} />
          </View>
        </Card>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={<Dim>No tienes estructuras por inspeccionar. Si te asignaron alguna, toca "Actualizar lista" con internet.</Dim>}
        renderItem={({ item }) => (
          <Pressable onPress={() => onOpen(item.structureId, item.id)}>
            <Card>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <H>{item.structure?.code ?? 'Sin código'}</H>
                {item.structure && <Badge text={item.structure.physicalStatus} color={PHYSICAL_COLORS[item.structure.physicalStatus]} />}
              </View>
              <Text>{item.structure?.name}</Text>
              <Dim>Plazo: {item.dueAt ? new Date(item.dueAt).toLocaleDateString('es-PE') : 'Sin plazo'} · Encargado por: {item.assignedByName}</Dim>
              {item.instructions ? <Text style={{ marginTop: 4, fontStyle: 'italic' }}>{item.instructions}</Text> : null}
              {item.structure?.location?.label !== 'Documentado' && <Text style={{ color: C.warn, marginTop: 4, fontSize: 12 }}>Ubicación aproximada: confírmala en el lugar</Text>}
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
