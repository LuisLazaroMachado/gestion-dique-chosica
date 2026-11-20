import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Group, Loader, SimpleGrid, Stack, Table, Text, Badge, Progress } from '@mantine/core';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { PHYSICAL_COLORS, INTERVENTION_COLORS, fmt, fmtDateTime } from '../components/Labels';
import { HelpTip, PageHeader } from '../components/Help';

function Stat({ label, value, hint, help, color }: { label: string; value: number | string; hint?: string; help?: string; color?: string }) {
  return (
    <Card withBorder padding="md">
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={600}>{label}</Text>
        {help && <HelpTip label={help} />}
      </Group>
      <Text size="1.9rem" fw={700} c={color}>{value}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Card>
  );
}

function Distribution({ title, help, rows, colors }: { title: string; help: string; rows: Array<{ status: string; n: number }>; colors: Record<string, string> }) {
  const total = rows.reduce((a, r) => a + r.n, 0) || 1;
  return (
    <Card withBorder>
      <Group gap={4} mb="xs"><Text fw={600}>{title}</Text><HelpTip label={help} /></Group>
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
  const months = 6;
  return (
    <Stack>
      <PageHeader title="Tablero" description="Resumen del estado de los diques y estructuras de protección de Lurigancho-Chosica." />

      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
        <Stat label="Estructuras registradas" value={d.inventory.total}
          hint={`${d.inventory.linea_base} del inventario inicial y ${d.inventory.ampliacion} agregadas después`}
          help="El inventario inicial son los 52 diques que identificó la Contraloría en diciembre de 2024. Las agregadas después se registraron luego." />
        <Stat label="Inspecciones por revisar" value={d.pendingReview} color={d.pendingReview ? 'orange' : undefined}
          hint="Enviadas desde el celular, esperan tu aprobación"
          help="Cuando un inspector envía una inspección desde la app, aparece aquí hasta que la apruebes o la devuelvas en 'Revisar inspecciones'." />
        <Stat label="Inspecciones encargadas" value={d.openAssignments}
          hint="Asignadas a inspectores y aún no realizadas"
          help="Estructuras que encargaste revisar a un inspector y que todavía no inspecciona. Se gestionan en 'Encargar inspecciones'." />
        <Stat label="Ubicaciones por confirmar" value={d.inventory.ubic_estimada} color="orange"
          hint={`${d.inventory.ubic_documentada} confirmadas`}
          help="Estructuras cuya ubicación en el mapa es aproximada. Se confirman con el GPS del inspector en el lugar." />
      </SimpleGrid>

      <Card withBorder>
        <Group gap={4} mb="sm">
          <Text fw={600}>¿Cuándo toca inspeccionar?</Text>
          <HelpTip label={`Cada estructura debe inspeccionarse al menos cada ${months} meses (plazo ajustable en Configuración). Estos números cambian cuando apruebas una inspección nueva.`} />
        </Group>
        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <div><Text size="1.6rem" fw={700} c="green">{d.inspections.vigentes}</Text><Text size="sm">Al día</Text><Text size="xs" c="dimmed">Inspeccionadas hace menos de {months} meses</Text></div>
          <div><Text size="1.6rem" fw={700} c="yellow.7">{d.inspections.proximas}</Text><Text size="sm">Toca pronto</Text><Text size="xs" c="dimmed">Vencen en los próximos 30 días</Text></div>
          <div><Text size="1.6rem" fw={700} c="red">{d.inspections.vencidas}</Text><Text size="sm">Atrasadas</Text><Text size="xs" c="dimmed">Su última inspección tiene más de {months} meses</Text></div>
          <div><Text size="1.6rem" fw={700}>{d.inspections.sin_inspeccion}</Text><Text size="sm">Nunca inspeccionadas</Text><Text size="xs" c="dimmed">Sin ninguna inspección aprobada</Text></div>
        </SimpleGrid>
      </Card>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Distribution title="¿En qué estado están?" rows={d.physical} colors={PHYSICAL_COLORS}
          help="Estado físico según la última inspección aprobada. Solo cambia con una inspección nueva, no al registrar un trabajo." />
        <Distribution title="¿Qué trabajos tienen?" rows={d.intervention} colors={INTERVENTION_COLORS}
          help="Situación del último trabajo registrado en cada estructura (limpieza, reparación, etc.). Cambia al crear o actualizar un trabajo." />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Card withBorder>
          <Group justify="space-between" mb="xs">
            <Group gap={4}><Text fw={600}>Las 10 que más urge atender</Text>
              <HelpTip label="Ordenadas por prioridad (de 0 a 1): combina qué tan dañada está la estructura con cuántas personas viven en la zona que podría afectar. Ver 'Prioridades' para el detalle." /></Group>
            <Text size="xs" c="dimmed">Actualizado: {fmtDateTime(d.latestBatch?.calculated_at)}</Text>
          </Group>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Estructura</Table.Th><Table.Th>Prioridad</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.top.map((t: any) => (
                <Table.Tr key={t.structure_id}>
                  <Table.Td><Link to={`/inventario/${t.structure_id}`}>{t.code}</Link></Table.Td>
                  <Table.Td>{t.name}</Table.Td>
                  <Table.Td><b>{fmt(t.p, 2)}</b></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
        <Card withBorder>
          <Text fw={600} mb="xs">Por quebrada</Text>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>Quebrada</Table.Th><Table.Th>Registro</Table.Th><Table.Th>Estructuras</Table.Th><Table.Th>En estado crítico</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {d.byWatershed.map((w: any) => (
                <Table.Tr key={w.watershed + w.origin_inventory}>
                  <Table.Td>{w.watershed}</Table.Td>
                  <Table.Td>{w.origin_inventory === 'linea_base_2024' ? 'Inventario inicial' : 'Agregada después'}</Table.Td>
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
