import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Card, Checkbox, Group, Loader, Modal, Select, Stack, Table, Tabs, Text, Textarea, TextInput, Title, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, ApiError, type PriorityItem } from '../api';
import { DataLabel, PhysicalBadge, URGENCY_COLORS, fmt, fmtDateTime } from '../components/Labels';

export function PrioritiesPage() {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [decision, setDecision] = useState<{ decision: string; justification: string } | null>(null);
  const q = useQuery({ queryKey: ['priorities'], queryFn: () => api<{ batch: any; items: PriorityItem[]; notCalculated: any[] }>('/priorities') });
  const decisions = useQuery({ queryKey: ['decisions'], queryFn: () => api('/priorities/decisions') });
  const recalc = useMutation({
    mutationFn: () => api('/priorities/recalculate', { body: { reason: 'Recálculo manual desde la web' } }),
    onSuccess: (r: any) => { notifications.show({ color: 'green', message: `Nuevo lote: ${r.calculated} con P, ${r.skipped.length} sin cálculo. Nmax = ${r.nMax}.` }); qc.invalidateQueries(); },
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
      <Group justify="space-between">
        <Title order={2}>Priorización</Title>
        <Group>
          <Button variant="default" disabled={!selected.length} onClick={() => setDecision({ decision: '', justification: '' })}>
            Registrar decisión ({selected.length})
          </Button>
          <Button onClick={() => recalc.mutate()} loading={recalc.isPending}>Recalcular</Button>
        </Group>
      </Group>
      <Card withBorder>
        <Text size="sm"><b>Fórmula aprobada ({batch?.formula_version}):</b> E = (D + C + A) / 9 · X = N / Nmax · P = E × X</Text>
        <Text size="sm">Lote vigente: {fmtDateTime(batch?.calculated_at)} · Nmax = {batch?.n_max} · Inventario vigente: {batch?.inventory_count} · Motivo: {batch?.reason}</Text>
        <Text size="xs" c="dimmed" mt={4}>
          P es un índice relativo de apoyo (no es probabilidad de falla ni clasificación normativa). Prioridad, urgencia y viabilidad logística se muestran por
          separado; el acceso difícil no excluye. Empates: decisión manual justificada del responsable.
        </Text>
        {batch?.warnings?.map((w: string) => <Alert key={w} color="orange" mt="xs">{w}</Alert>)}
      </Card>
      <Tabs defaultValue="ranking">
        <Tabs.List>
          <Tabs.Tab value="ranking">Ranking ({items.length})</Tabs.Tab>
          <Tabs.Tab value="sin">Sin cálculo ({notCalculated.length})</Tabs.Tab>
          <Tabs.Tab value="dec">Decisiones ({decisions.data?.items?.length ?? 0})</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="ranking" pt="sm">
          <Select placeholder="Filtrar por origen" clearable w={260} mb="sm" value={origin} onChange={setOrigin}
            data={[{ value: 'linea_base_2024', label: 'Línea base 2024' }, { value: 'ampliacion', label: 'Ampliaciones' }]} />
          <Table.ScrollContainer minWidth={1200}>
            <Table striped highlightOnHover>
              <Table.Thead><Table.Tr>
                <Table.Th /><Table.Th>#</Table.Th><Table.Th>Código</Table.Th><Table.Th>Quebrada</Table.Th>
                <Table.Th>D</Table.Th><Table.Th>C</Table.Th><Table.Th>A</Table.Th><Table.Th>E</Table.Th>
                <Table.Th>N</Table.Th><Table.Th>X</Table.Th><Table.Th>P</Table.Th>
                <Table.Th>Urgencia</Table.Th><Table.Th>Acceso (logística)</Table.Th><Table.Th>Estado físico</Table.Th><Table.Th>Datos</Table.Th>
              </Table.Tr></Table.Thead>
              <Table.Tbody>{rows.map((r, k) => (
                <Table.Tr key={r.structureId} bg={r.tie ? 'yellow.0' : undefined}>
                  <Table.Td><Checkbox checked={selected.includes(r.structureId)} onChange={() => toggle(r.structureId)} /></Table.Td>
                  <Table.Td>{k + 1}</Table.Td>
                  <Table.Td><Link to={`/inventario/${r.structureId}`}>{r.code}</Link><Text size="xs" c="dimmed">{r.name}</Text></Table.Td>
                  <Table.Td>{r.watershed}</Table.Td>
                  <Table.Td>{r.d}</Table.Td><Table.Td>{r.c}</Table.Td><Table.Td>{r.a}</Table.Td><Table.Td>{fmt(r.e, 3)}</Table.Td>
                  <Table.Td>{Number(r.n).toFixed(0)}</Table.Td><Table.Td>{fmt(r.x, 3)}</Table.Td>
                  <Table.Td><b>{fmt(r.p, 4)}</b>{r.tie && <Tooltip label="Empate exacto con otra estructura: requiere decisión manual justificada"><Badge ml={4} size="xs" color="yellow">empate</Badge></Tooltip>}</Table.Td>
                  <Table.Td>{r.urgency ? <Tooltip label={r.urgency.justification}><Badge color={URGENCY_COLORS[r.urgency.level]}>{r.urgency.level}</Badge></Tooltip> : '—'}</Table.Td>
                  <Table.Td>{r.accessStatus ?? '—'}</Table.Td>
                  <Table.Td><PhysicalBadge value={r.physicalStatus} /></Table.Td>
                  <Table.Td><Group gap={2}><DataLabel value={r.inspectionLabel} size="xs" /><DataLabel value={r.exposureLabel} size="xs" /></Group></Table.Td>
                </Table.Tr>))}</Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Tabs.Panel>
        <Tabs.Panel value="sin" pt="sm">
          <Text size="sm" c="dimmed" mb="xs">Estas estructuras no tienen P porque falta información. No se presentan con prioridad.</Text>
          <Table striped><Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Quebrada</Table.Th><Table.Th>Motivo</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{notCalculated.map((r) => (
              <Table.Tr key={r.id}><Table.Td><Link to={`/inventario/${r.id}`}>{r.code}</Link></Table.Td><Table.Td>{r.name}</Table.Td><Table.Td>{r.watershed}</Table.Td><Table.Td>{r.reason}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
        </Tabs.Panel>
        <Tabs.Panel value="dec" pt="sm">
          <Table striped><Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Autor</Table.Th><Table.Th>Decisión</Table.Th><Table.Th>Justificación</Table.Th><Table.Th>Estructuras</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{decisions.data?.items?.map((d: any) => (
              <Table.Tr key={d.id}><Table.Td>{fmtDateTime(d.created_at)}</Table.Td><Table.Td>{d.author}</Table.Td><Table.Td>{d.decision}</Table.Td><Table.Td>{d.justification}</Table.Td>
                <Table.Td>{d.structure_ids.map((id: string) => items.find((i) => i.structureId === id)?.code ?? id.slice(0, 8)).join(', ')}</Table.Td></Table.Tr>))}</Table.Tbody></Table>
        </Tabs.Panel>
      </Tabs>
      <Modal opened={!!decision} onClose={() => setDecision(null)} title="Decisión manual del responsable">
        {decision && (
          <Stack component="form" onSubmit={(e) => { e.preventDefault(); decide.mutate(); }}>
            <Text size="sm">Estructuras: {selected.map((id) => items.find((i) => i.structureId === id)?.code).join(', ')}</Text>
            <TextInput label="Decisión (p. ej. atender primero PDC-0012)" required value={decision.decision} onChange={(e) => setDecision({ ...decision, decision: e.currentTarget.value })} />
            <Textarea label="Justificación (obligatoria)" required value={decision.justification} onChange={(e) => setDecision({ ...decision, justification: e.currentTarget.value })} />
            <Button type="submit" loading={decide.isPending}>Registrar</Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
