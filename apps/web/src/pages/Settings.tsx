import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Group, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, ApiError, API_URL } from '../api';
import { PageHeader } from '../components/Help';

export function SettingsPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api('/settings') });
  const get = (k: string) => q.data?.items.find((s: any) => s.key === k);
  const [interval, setInterval] = useState<number | ''>(6);
  const [base, setBase] = useState({ name: '', lat: '' as number | '', lon: '' as number | '' });
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!q.data) return;
    setInterval(Number(get('inspection_interval_months')?.value ?? 6));
    const b = get('base_central')?.value ?? {};
    setBase({ name: b.name ?? '', lat: b.lat ?? '', lon: b.lon ?? '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: unknown }) => api(`/settings/${key}`, { method: 'PUT', body: { value, reason } }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Configuración guardada.' }); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  return (
    <Stack maw={720}>
      <PageHeader title="Configuración" description="Ajustes generales del sistema. Escribe primero el motivo del cambio: queda en el historial." />
      <TextInput label="¿Por qué haces el cambio? (obligatorio)" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      <Card withBorder>
        <Text fw={600}>¿Cada cuánto inspeccionar?</Text>
        <Text size="xs" c="dimmed">Tiempo máximo entre dos inspecciones de una misma estructura. Por ahora son 6 meses; un especialista puede ajustarlo. Después de un huaico conviene inspeccionar apenas sea seguro.</Text>
        <Group align="end" mt="xs">
          <NumberInput label="Meses" min={1} max={36} value={interval} onChange={(v) => setInterval(v as number)} />
          <Button onClick={() => save.mutate({ key: 'inspection_interval_months', value: Number(interval) })} disabled={!reason}>Guardar</Button>
        </Group>
      </Card>
      <Card withBorder>
        <Text fw={600}>Base de la maquinaria</Text>
        <Text size="xs" c="dimmed">Lugar desde donde sale y adonde vuelve la maquinaria en los recorridos.</Text>
        <TextInput label="Nombre" mt="xs" value={base.name} onChange={(e) => setBase({ ...base, name: e.currentTarget.value })} />
        <Group grow>
          <NumberInput label="Latitud" decimalScale={6} value={base.lat} onChange={(v) => setBase({ ...base, lat: v as number })} />
          <NumberInput label="Longitud" decimalScale={6} value={base.lon} onChange={(v) => setBase({ ...base, lon: v as number })} />
        </Group>
        <Button mt="sm" disabled={!reason || base.lat === '' || base.lon === ''}
          onClick={() => save.mutate({ key: 'base_central', value: { name: base.name, lat: Number(base.lat), lon: Number(base.lon) } })}>Guardar base</Button>
      </Card>
      <Alert variant="light" color="gray">Servidor: {API_URL}</Alert>
    </Stack>
  );
}
