import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Title, Badge, Progress } from '@mantine/core';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PHYSICAL_COLORS, INTERVENTION_COLORS, fmt, fmtDateTime } from '../components/Labels';

function Stat({ label, value, hint, color }: { label: string; value: number | string; hint?: string; color?: string }) {
  return (
    <Card withBorder padding="md">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      <Text size="1.8rem" fw={700} c={color}>{value}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Card>
  );
}

function Distribution({ title, rows, colors }: { title: string; rows: Array<{ status: string; n: number }>; colors: Record<string, string> }) {
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <Card withBorder>
      <Text fw={600} mb="xs">{title}</Text>
      <Progress.Root size={22}>
        {rows.map((r) => (
          <Progress.Section key={r.status} value={(r.n / total) * 100} color={colors[r.status] ?? 'gray'}>
            <Progress.Label>{r.n}</Progress.Label>
          </Progress.Section>
        ))}
      </Progress.Root>
      <Group gap="xs" mt="xs">
        {rows.map((r) => <Badge key={r.status} color={colors[r.status] ?? 'gray'} variant="light">{r.status}: {r.n}</Badge>)}
      </Group>
    </Card>
  );
}

export function DashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard'], queryFn: () => api('/dashboard') });
  if (isLoading) return <Loader />;
  if (error) return <Alert color="red">{(error as Error).message}</Alert>;
  const d = data;
  return (
    <Stack>
      <Title order={2}>Tablero</Title>
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <Stat label="Estructuras activas" value={d.inventory.total} hint={`Línea base 2024: ${d.inventory.linea_base} · Ampliaciones: ${d.inventory.ampliacion}`} />
        <Stat label="Pendientes de revisión" value={d.pendingReview} hint="Inspecciones enviadas sin validar" color={d.pendingReview ? 'orange' : undefined} />
        <Stat label="Asignaciones abiertas" value={d.openAssignments} />
        <Stat label="Ubicaciones estimadas" value={d.inventory.ubic_estimada} hint={`Documentadas: ${d.inventory.ubic_documentada}`} color="orange" />
      </SimpleGrid>
      {Number(d.inventory.ubic_estimada) > 0 && (
        <Alert color="orange" title="Datos estimados">
          {d.inventory.ubic_estimada} estructuras tienen ubicación estimada (no verificada). Las inspecciones de referencia, la exposición
          y por tanto la prioridad incluyen valores estimados. Verifique en campo y actualice desde la ficha de cada estructura.
        </Alert>
      )}
      <SimpleGrid cols={{ base: 1, md: 4 }}>
        <Stat label="Inspecciones vigentes" value={d.inspections.vigentes} />
        <Stat label="Próximas (30 días)" value={d.inspections.proximas} color="yellow.7" />
        <Stat label="Vencidas" value={d.inspections.vencidas} color="red" hint="Según intervalo administrativo provisional" />
        <Stat label="Sin inspección validada" value={d.inspections.sin_inspeccion} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Distribution title="Estado físico" rows={d.physical} colors={PHYSICAL_COLORS} />
        <Distribution title="Estado de intervención" rows={d.intervention} colors={INTERVENTION_COLORS} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Text fw={600}>Mayor prioridad relativa (P)</Text>
            <Text size="xs" c="dimmed">Cálculo: {fmtDateTime(d.latestBatch?.calculated_at)} · Nmax = {d.latestBatch?.n_max ?? '—'}</Text>
          </Group>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Estructura</Table.Th><Table.Th>P</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.top.map((t: any) => (
                <Table.Tr key={t.structure_id}>
                  <Table.Td><Link to={`/inventario/${t.structure_id}`}>{t.code}</Link></Table.Td>
                  <Table.Td>{t.name}</Table.Td>
                  <Table.Td>{fmt(t.p, 3)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt="xs">P es un índice relativo de apoyo: no es probabilidad de falla ni clasificación de riesgo.</Text>
        </Card>
        <Card withBorder>
          <Text fw={600} mb="xs">Por quebrada</Text>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Quebrada</Table.Th><Table.Th>Inventario</Table.Th><Table.Th>Estructuras</Table.Th><Table.Th>Críticas</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.byWatershed.map((w: any) => (
                <Table.Tr key={w.watershed + w.origin_inventory}>
                  <Table.Td>{w.watershed}</Table.Td>
                  <Table.Td>{w.origin_inventory === 'linea_base_2024' ? 'Línea base' : 'Ampliación'}</Table.Td>
                  <Table.Td>{w.n}</Table.Td>
                  <Table.Td>{w.criticos}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </SimpleGrid>
    </Stack>
  );
}
