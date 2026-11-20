import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Code, Group, Loader, Select, Stack, Table, Text, Title } from '@mantine/core';
import { api } from '../api';
import { fmtDateTime } from '../components/Labels';

const ENTITIES = ['structure', 'inspection', 'assignment', 'exposure', 'priority_batch', 'urgency', 'priority_decision', 'intervention',
  'route', 'evidence', 'user', 'setting', 'access_exception', 'system'];

export function AuditPage() {
  const [entity, setEntity] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['audit', entity], queryFn: () => api(`/audit?limit=500${entity ? `&entityType=${entity}` : ''}`) });
  return (
    <Stack>
      <Title order={2}>Auditoría</Title>
      <Text size="sm" c="dimmed">Registro inalterable: actor, fecha, acción, entidad, antes/después y motivo. No puede editarse ni borrarse.</Text>
      <Group><Select placeholder="Tipo de entidad" data={ENTITIES} value={entity} onChange={setEntity} clearable /></Group>
      {q.isLoading ? <Loader /> : (
        <Table striped>
          <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Actor</Table.Th><Table.Th>Acción</Table.Th><Table.Th>Entidad</Table.Th><Table.Th>Motivo</Table.Th><Table.Th>Antes / después</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{q.data?.items.map((a: any) => (
            <Table.Tr key={a.id}>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(a.occurred_at)}</Table.Td><Table.Td>{a.actor_name ?? 'Sistema'}</Table.Td>
              <Table.Td>{a.action}</Table.Td><Table.Td><Text size="xs">{a.entity_type}<br />{a.entity_id?.slice(0, 8)}</Text></Table.Td>
              <Table.Td>{a.reason ?? '—'}</Table.Td>
              <Table.Td><Code block style={{ maxHeight: 110, maxWidth: 520, overflow: 'auto', fontSize: 11 }}>{JSON.stringify({ antes: a.before_data, despues: a.after_data })}</Code></Table.Td>
            </Table.Tr>))}</Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
