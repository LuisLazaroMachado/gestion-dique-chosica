import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Modal, MultiSelect, Select, Stack, Table, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { api, ApiError, type Structure, type User } from '../api';
import { fmtDate, fmtDateTime } from '../components/Labels';
import { PageHeader } from '../components/Help';
import { ASSIGNMENT_STATUS_LABELS } from '@dique/shared';

const STATUS_COLORS: Record<string, string> = { asignada: 'blue', en_curso: 'yellow', completada: 'green', cancelada: 'gray' };

export function AssignmentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ inspectorId: null as string | null, structureIds: [] as string[], dueAt: '', instructions: '' });
  const list = useQuery({ queryKey: ['assignments'], queryFn: () => api('/assignments') });
  const users = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: User[] }>('/users') });
  const structures = useQuery({ queryKey: ['structures'], queryFn: () => api<{ items: Structure[] }>('/structures') });
  const create = useMutation({
    mutationFn: () => api('/assignments', { body: { inspectorId: form.inspectorId, structureIds: form.structureIds,
      dueAt: form.dueAt ? new Date(form.dueAt + 'T23:59:00-05:00').toISOString() : null, instructions: form.instructions || null } }),
    onSuccess: (r: any) => { notifications.show({ color: 'green', message: `Listo: ${r.ids.length} estructura(s) encargada(s).` }); setOpen(false); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api(`/assignments/${id}`, { method: 'PATCH', body: { status: 'cancelada', reason } }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (e) => notifications.show({ color: 'red', message: e instanceof ApiError ? e.full : String(e) }),
  });
  const inspectors = (users.data?.items ?? []).filter((u) => u.active !== false && (u.role === 'inspector' || u.canInspect));

  return (
    <Stack>
      <PageHeader title="Encargar inspecciones"
        description="Elige qué estructuras debe revisar cada inspector. Las verá en su celular al tocar 'Actualizar lista'. Un inspector solo puede inspeccionar lo que se le encargó."
        actions={<Button onClick={() => setOpen(true)}>Nuevo encargo</Button>} />
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Estructura</Table.Th><Table.Th>Quebrada</Table.Th><Table.Th>Inspector</Table.Th>
          <Table.Th>Plazo</Table.Th><Table.Th>Situación</Table.Th><Table.Th>Encargado por</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{list.data?.items.map((a: any) => (
          <Table.Tr key={a.id}>
            <Table.Td>{fmtDateTime(a.assignedAt)}</Table.Td><Table.Td>{a.structureCode} · {a.structureName}</Table.Td><Table.Td>{a.watershed}</Table.Td>
            <Table.Td>{a.inspectorName}</Table.Td><Table.Td>{fmtDate(a.dueAt)}</Table.Td>
            <Table.Td><Badge color={STATUS_COLORS[a.status]}>{ASSIGNMENT_STATUS_LABELS[a.status] ?? a.status}</Badge></Table.Td><Table.Td>{a.assignedByName}</Table.Td>
            <Table.Td>{(a.status === 'asignada' || a.status === 'en_curso') && (
              <Button size="xs" variant="subtle" color="red" onClick={() => {
                const reason = prompt('¿Por qué se cancela este encargo?');
                if (reason) cancel.mutate({ id: a.id, reason });
              }}>Cancelar</Button>)}</Table.Td>
          </Table.Tr>))}</Table.Tbody>
      </Table>
      <Modal opened={open} onClose={() => setOpen(false)} title="Nuevo encargo de inspección" size="lg">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Select label="Inspector" required data={inspectors.map((u) => ({ value: u.id, label: `${u.staffCode ?? ''} ${u.displayName}`.trim() }))}
            value={form.inspectorId} onChange={(v) => setForm({ ...form, inspectorId: v })} />
          <MultiSelect label="Estructuras" required searchable maxDropdownHeight={300}
            data={(structures.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
            value={form.structureIds} onChange={(v) => setForm({ ...form, structureIds: v })} />
          <TextInput label="Fecha límite (opcional)" type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.currentTarget.value })} />
          <Textarea label="Indicaciones para el inspector (opcional)" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.currentTarget.value })} />
          <Button type="submit" loading={create.isPending}>Encargar</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
