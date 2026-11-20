import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Group, NumberInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, ApiError, API_URL } from '../api';

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
    onSuccess: () => { notifications.show({ color: 'green', message: 'Configuración guardada (auditada).' }); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  return (
    <Stack maw={720}>
      <Title order={2}>Configuración</Title>
      <TextInput label="Motivo de los cambios (obligatorio)" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
      <Card withBorder>
        <Text fw={600}>Intervalo de inspección</Text>
        <Text size="xs" c="dimmed">Intervalo administrativo provisional (6 meses), ajustable por el especialista. Un evento de huaico activa inspección posterior cuando sea seguro.</Text>
        <Group align="end" mt="xs">
          <NumberInput label="Meses" min={1} max={36} value={interval} onChange={(v) => setInterval(v as number)} />
          <Button onClick={() => save.mutate({ key: 'inspection_interval_months', value: Number(interval) })} disabled={!reason}>Guardar</Button>
        </Group>
      </Card>
      <Card withBorder>
        <Text fw={600}>Base central (origen de rutas)</Text>
        <Text size="xs" c="dimmed">{get('base_central')?.notes}</Text>
        <TextInput label="Nombre" mt="xs" value={base.name} onChange={(e) => setBase({ ...base, name: e.currentTarget.value })} />
        <Group grow>
          <NumberInput label="Latitud" decimalScale={6} value={base.lat} onChange={(v) => setBase({ ...base, lat: v as number })} />
          <NumberInput label="Longitud" decimalScale={6} value={base.lon} onChange={(v) => setBase({ ...base, lon: v as number })} />
        </Group>
        <Button mt="sm" disabled={!reason || base.lat === '' || base.lon === ''}
          onClick={() => save.mutate({ key: 'base_central', value: { name: base.name, lat: Number(base.lat), lon: Number(base.lon) } })}>Guardar base</Button>
      </Card>
      <Alert variant="light" color="gray">Servidor de la API: {API_URL}</Alert>
    </Stack>
  );
}
