import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Modal, Paper, Select, SimpleGrid, Stack, Table, Tabs, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, ApiError, type PriorityItem } from '../api';
import { DataLabel, PhysicalBadge, URGENCY_COLORS, fmt, fmtDateTime } from '../components/Labels';
import { HelpTip, PageHeader } from '../components/Help';
import { ACCESS_LABELS } from '@dique/shared';

export function PrioritiesPage() {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState<{ decision: string; justification: string } | null>(null);
  const q = useQuery({ queryKey: ['priorities'], queryFn: () => api<{ batch: any; items: PriorityItem[]; notCalculated: any[] }>('/priorities') });
  const decisions = useQuery({ queryKey: ['decisions'], queryFn: () => api('/priorities/decisions') });
  const recalc = useMutation({
    mutationFn: () => api('/priorities/recalculate', { body: { reason: 'Recálculo manual desde la web' } }),
    onSuccess: (r: any) => { notifications.show({ color: 'green', message: `Prioridades actualizadas: ${r.calculated} calculadas, ${r.skipped.length} con información faltante.` }); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  const decide = useMutation({
    mutationFn: () => api('/priorities/decisions', { body: { structureIds: selected, ...decision } }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Decisión registrada.' }); setDecision(null); setSelected([]); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  if (q.isLoading) return <Loader />;
  if (q.error) return <Alert color="red">{(q.error as Error).message}</Alert>;
  const { batch, items, notCalculated } = q.data!;
  const rows = items.filter((r) => !origin || r.originInventory === origin);
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Stack>
      <PageHeader title="Prioridades"
        description="Orden sugerido para atender las estructuras: primero las que están más dañadas y tienen más personas viviendo en la zona que podrían afectar. La decisión final siempre es del responsable."
        actions={<Group>
          <Button variant="default" disabled={!selected.length} onClick={() => setDecision({ decision: '', justification: '' })}>Registrar decisión ({selected.length})</Button>
          <Button onClick={() => recalc.mutate()} loading={recalc.isPending}>Actualizar</Button>
        </Group>} />
      <Card withBorder>
        <Text fw={600} mb={6}>¿Cómo se calcula?</Text>
        <SimpleGrid cols={{ base: 1, md: 3 }} spacing="sm">
          <Paper withBorder p="sm" bg="gray.0">
            <Text size="sm" fw={600}>1. Estado de la estructura (E)</Text>
            <Text size="xs">El inspector califica de 0 a 3 el daño (D), el material acumulado (C) y la erosión (A). Se suman y se dividen entre 9.</Text>
            <Text size="sm" mt={4} ff="monospace">E = (D + C + A) / 9</Text>
          </Paper>
          <Paper withBorder p="sm" bg="gray.0">
            <Text size="sm" fw={600}>2. Personas expuestas (X)</Text>
            <Text size="xs">Personas en la zona que podría afectar (N), comparadas con la estructura que tiene más personas en todo el inventario (Nmax = {Math.round(batch?.n_max ?? 0)}).</Text>
            <Text size="sm" mt={4} ff="monospace">X = N / Nmax</Text>
          </Paper>
          <Paper withBorder p="sm" bg="blue.0">
            <Text size="sm" fw={600}>3. Prioridad (P)</Text>
            <Text size="xs">Se multiplican ambos. Va de 0 a 1: mientras más alto, más urge. No es la probabilidad de que falle.</Text>
            <Text size="sm" mt={4} ff="monospace">P = E × X</Text>
          </Paper>
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="xs">
          Ejemplo: daño 2, material 3 y erosión 1 dan E = 6/9 = 0.67. Con 300 personas, y siendo 600 el máximo del inventario, X = 0.5. Entonces P = 0.67 × 0.5 = 0.33.
          La urgencia y la dificultad de acceso se muestran aparte y no cambian este número. Última actualización: {fmtDateTime(batch?.calculated_at)}.
        </Text>
        {batch?.warnings?.map((w: string) => <Alert key={w} color="orange" mt="xs">{w}</Alert>)}
      </Card>
      <Tabs defaultValue="ranking">
        <Tabs.List>
          <Tabs.Tab value="ranking">Orden de prioridad ({items.length})</Tabs.Tab>
          <Tabs.Tab value="sin">Falta información ({notCalculated.length})</Tabs.Tab>
          <Tabs.Tab value="dec">Decisiones del responsable ({decisions.data?.items?.length ?? 0})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="ranking" pt="sm">
          <Group mb="sm">
            <Select placeholder="Filtrar por registro" clearable w={260} value={origin} onChange={setOrigin}
              data={[{ value: 'linea_base_2024', label: 'Inventario inicial' }, { value: 'ampliacion', label: 'Agregadas después' }]} />
            <Text size="xs" c="dimmed">Marca varias estructuras para registrar una decisión (por ejemplo, en caso de empate).</Text>
          </Group>
          <Table.ScrollContainer minWidth={1200}>
            <Table striped highlightOnHover>
              <Table.Thead><Table.Tr>
                <Table.Th /><Table.Th>#</Table.Th><Table.Th>Código</Table.Th><Table.Th>Quebrada</Table.Th>
                <Table.Th><Group gap={2} wrap="nowrap">D<HelpTip label="Daño en la estructura (0 a 3)" /></Group></Table.Th>
                <Table.Th><Group gap={2} wrap="nowrap">C<HelpTip label="Material acumulado (0 a 3)" /></Group></Table.Th>
                <Table.Th><Group gap={2} wrap="nowrap">A<HelpTip label="Erosión o deslizamiento activo (0 a 3)" /></Group></Table.Th>
                <Table.Th><Group gap={2} wrap="nowrap">E<HelpTip label="Estado de la estructura (0 a 1)" /></Group></Table.Th>
                <Table.Th><Group gap={2} wrap="nowrap">N<HelpTip label="Personas expuestas" /></Group></Table.Th>
                <Table.Th><Group gap={2} wrap="nowrap">X<HelpTip label="Exposición comparada con el máximo (0 a 1)" /></Group></Table.Th>
                <Table.Th>Prioridad</Table.Th>
                <Table.Th>Urgencia</Table.Th><Table.Th>Acceso</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Datos</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>{rows.map((r, k) => (
                <Table.Tr key={r.structureId} bg={r.tie ? 'yellow.0' : undefined}>
                  <Table.Td><Checkbox checked={selected.includes(r.structureId)} onChange={() => toggle(r.structureId)} /></Table.Td>
                  <Table.Td>{k + 1}</Table.Td>
                  <Table.Td><Link to={`/inventario/${r.structureId}`}>{r.code}</Link><Text size="xs" c="dimmed">{r.name}</Text></Table.Td>
                  <Table.Td>{r.watershed}</Table.Td>
                  <Table.Td>{r.d}</Table.Td><Table.Td>{r.c}</Table.Td><Table.Td>{r.a}</Table.Td><Table.Td>{fmt(r.e, 3)}</Table.Td>
                  <Table.Td>{Number(r.n).toFixed(0)}</Table.Td><Table.Td>{fmt(r.x, 3)}</Table.Td>
                  <Table.Td><b>{fmt(r.p, 3)}</b>{r.tie && <Tooltip label="Tiene la misma prioridad que otra estructura: decide cuál va primero y registra el motivo"><Badge ml={4} size="xs" color="yellow">empate</Badge></Tooltip>}</Table.Td>
                  <Table.Td>{r.urgency ? <Tooltip label={r.urgency.justification}><Badge color={URGENCY_COLORS[r.urgency.level]}>{r.urgency.level}</Badge></Tooltip> : '-'}</Table.Td>
                  <Table.Td>{r.accessStatus ? (ACCESS_LABELS[r.accessStatus] ?? r.accessStatus) : '-'}</Table.Td>
                  <Table.Td><PhysicalBadge value={r.physicalStatus} /></Table.Td>
                  <Table.Td>{r.inspectionLabel === 'Documentado' && r.exposureLabel === 'Documentado' ? <DataLabel value="Documentado" size="xs" /> : <DataLabel value="Estimado" size="xs" />}</Table.Td>
                </Table.Tr>))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>
        <Tabs.Panel value="sin" pt="sm">
          <Text size="sm" c="dimmed" mb="xs">A estas estructuras les falta información para calcular su prioridad. El motivo indica qué se necesita.</Text>
          <Table striped><Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Quebrada</Table.Th><Table.Th>Motivo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{notCalculated.map((r) => (
              <Table.Tr key={r.id}><Table.Td><Link to={`/inventario/${r.id}`}>{r.code}</Link></Table.Td><Table.Td>{r.name}</Table.Td><Table.Td>{r.watershed}</Table.Td><Table.Td>{r.reason}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
        </Tabs.Panel>
        <Tabs.Panel value="dec" pt="sm">
          <Table striped><Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Quién</Table.Th><Table.Th>Decisión</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Estructuras</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{decisions.data?.items?.map((d: any) => (
              <Table.Tr key={d.id}><Table.Td>{fmtDateTime(d.created_at)}</Table.Td><Table.Td>{d.author}</Table.Td><Table.Td>{d.decision}</Table.Td><Table.Td>{d.justification}</Table.Td>
                <Table.Td>{d.structure_ids.map((id: string) => items.find((i) => i.structureId === id)?.code ?? id.slice(0, 8)).join(', ')}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
        </Tabs.Panel>
      </Tabs>
      <Modal opened={!!decision} onClose={() => setDecision(null)} title="Registrar una decisión">
        {decision && (
          <Stack component="form" onSubmit={(e) => { e.preventDefault(); decide.mutate(); }}>
            <Text size="sm">Estructuras: {selected.map((id) => items.find((i) => i.structureId === id)?.code).join(', ')}</Text>
            <TextInput label="¿Qué decidiste? (p. ej. atender primero PDC-0012)" required value={decision.decision} onChange={(e) => setDecision({ ...decision, decision: e.currentTarget.value })} />
            <Textarea label="¿Por qué? (obligatorio)" required value={decision.justification} onChange={(e) => setDecision({ ...decision, justification: e.currentTarget.value })} />
            <Button type="submit" loading={decide.isPending}>Registrar</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
