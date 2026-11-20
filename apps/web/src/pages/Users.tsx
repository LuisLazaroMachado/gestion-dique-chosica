import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Checkbox, Group, Modal, PasswordInput, Select, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ROLE_LABELS, type Role } from '@dique/shared';
import { api, ApiError, type User } from '../api';
import { useAuth } from '../auth';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', displayName: '', role: 'inspector', password: '', canInspect: false, canViewAll: false });
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: User[] }>('/users') });
  const create = useMutation({
    mutationFn: () => api('/users', { body: f }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Usuario creado.' }); setOpen(false); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const isAdmin = me?.role === 'admin';
  const ask = (msg: string) => prompt(msg) ?? '';

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Usuarios</Title>
        <Button onClick={() => setOpen(true)}>Nuevo usuario</Button>
      </Group>
      <Text size="sm" c="dimmed">Cuentas individuales y mínimo privilegio. Desactivar no borra el historial. El especialista acompañante se registra como verificador en la inspección y no necesita cuenta.</Text>
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Nombre</Table.Th><Table.Th>Correo</Table.Th><Table.Th>Rol</Table.Th><Table.Th>Puede inspeccionar</Table.Th><Table.Th>Ve todo el inventario</Table.Th><Table.Th>Activo</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{q.data?.items.map((u) => (
          <Table.Tr key={u.id} opacity={u.active ? 1 : 0.5}>
            <Table.Td>{u.displayName}</Table.Td><Table.Td>{u.email}</Table.Td><Table.Td><Badge variant="light">{ROLE_LABELS[u.role]}</Badge></Table.Td>
            <Table.Td>{u.role === 'inspector' || u.canInspect ? 'Sí' : 'No'}</Table.Td><Table.Td>{u.role !== 'inspector' || u.canViewAll ? 'Sí' : 'No'}</Table.Td>
            <Table.Td><Switch checked={u.active} disabled={!isAdmin || u.id === me?.id}
              onChange={(e) => { const reason = ask('Motivo del cambio:'); if (reason) patch.mutate({ id: u.id, body: { active: e.currentTarget.checked, reason } }); }} /></Table.Td>
            <Table.Td>{isAdmin && (
              <Button size="xs" variant="subtle" onClick={() => {
                const password = ask('Nueva contraseña (mínimo 8 caracteres):'); if (!password) return;
                const reason = ask('Motivo:'); if (reason) patch.mutate({ id: u.id, body: { password, reason } });
              }}>Cambiar contraseña</Button>)}</Table.Td>
          </Table.Tr>))}</Table.Tbody>
      </Table>
      <Modal opened={open} onClose={() => setOpen(false)} title="Nuevo usuario">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <TextInput label="Nombre" required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.currentTarget.value })} />
          <TextInput label="Correo" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
          <Select label="Rol" value={f.role} onChange={(v) => setF({ ...f, role: v ?? 'inspector' })}
            data={(isAdmin ? ['inspector', 'planner', 'admin'] : ['inspector']).map((r) => ({ value: r, label: ROLE_LABELS[r as Role] }))} />
          <PasswordInput label="Contraseña inicial (mín. 8)" required value={f.password} onChange={(e) => setF({ ...f, password: e.currentTarget.value })} />
          {f.role !== 'inspector' && <Checkbox label="Puede inspeccionar" checked={f.canInspect} onChange={(e) => setF({ ...f, canInspect: e.currentTarget.checked })} />}
          {f.role === 'inspector' && <Checkbox label="Puede ver todo el inventario (excepción)" checked={f.canViewAll} onChange={(e) => setF({ ...f, canViewAll: e.currentTarget.checked })} />}
          <Button type="submit" loading={create.isPending}>Crear</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
