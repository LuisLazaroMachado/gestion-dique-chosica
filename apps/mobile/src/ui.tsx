import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

export const C = {
  primary: '#1c4f82', bg: '#f1f3f5', card: '#ffffff', text: '#212529', dim: '#6c757d', border: '#dee2e6',
  ok: '#2f9e44', warn: '#f08c00', danger: '#e03131', info: '#1c7ed6', violet: '#7950f2',
};
export const PHYSICAL_COLORS: Record<string, string> = { Operativo: C.ok, Deteriorado: C.warn, Crítico: C.danger, 'En evaluación': '#868e96' };

export function Btn({ title, onPress, kind = 'primary', disabled, busy, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'light' | 'danger' | 'outline'; disabled?: boolean; busy?: boolean; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? C.danger : kind === 'light' ? '#e7f0fa' : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : C.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1, borderWidth: kind === 'outline' ? 1 : 0, borderColor: C.primary }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[s.btnText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ text, color = C.dim }: { text: string; color?: string }) {
  return <View style={[s.badge, { backgroundColor: color }]}><Text style={s.badgeText}>{text}</Text></View>;
}

export function Chip({ label, selected, onPress, color = C.primary }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, selected && { backgroundColor: color, borderColor: color }]}>
      <Text style={[s.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) { return <Text style={s.label}>{children}</Text>; }
export function Dim({ children }: { children: ReactNode }) { return <Text style={s.dim}>{children}</Text>; }
export function H({ children }: { children: ReactNode }) { return <Text style={s.h}>{children}</Text>; }

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1 },
  headerLink: { color: '#cfe2ff', fontSize: 15, fontWeight: '600' },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: C.border },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7, marginRight: 6, marginBottom: 6, backgroundColor: '#fff' },
  chipText: { fontSize: 14, color: C.text },
  label: { fontSize: 13, fontWeight: '700', color: C.text, marginTop: 12, marginBottom: 6 },
  dim: { fontSize: 13, color: C.dim },
  h: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 4 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: C.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
