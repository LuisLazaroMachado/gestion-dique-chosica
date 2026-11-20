import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Checkbox, Modal, PasswordInput, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Paper } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ROLE_LABELS, type Role } from '@dique/shared';
import { api, ApiError, type User } from '../api';
import { useAuth } from '../auth';
import { PageHeader } from '../components/Help';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));

export function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', displayName: '', role: 'inspector', password: '', canInspect: false, canViewAll: false });
  const q = useQuery({ queryKey: ['users'], queryFn: () => api<{ items: User[] }>('/users') });
  const create = useMutation({
    mutationFn: () => api('/users', { body: f }),
    onSuccess: (u: any) => { notifications.show({ color: 'green', message: `Cuenta creada con el código ${u.staffCode}.` }); setOpen(false); qc.invalidateQueries({ queryKey: ['users'] }); },
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
      <PageHeader title="Usuarios"
        description="Cuentas de las personas que usan el sistema. Cada persona tiene su propia cuenta y un código que la identifica en todos sus registros."
        actions={<Button onClick={() => setOpen(true)}>{isAdmin ? 'Nueva cuenta' : 'Nuevo inspector'}</Button>} />
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Paper withBorder p="sm"><Text size="sm" fw={600}>Inspector (INS)</Text><Text size="xs">Usa la app del celular. Inspecciona solo las estructuras que se le encargan.</Text></Paper>
        <Paper withBorder p="sm"><Text size="sm" fw={600}>Responsable de planificación (RES)</Text><Text size="xs">Usa esta web: encarga inspecciones, las aprueba, decide prioridades y trabajos. Puede crear cuentas de inspector. Puede haber más de uno.</Text></Paper>
        <Paper withBorder p="sm"><Text size="sm" fw={600}>Administrador (ADM)</Text><Text size="xs">Gestiona todas las cuentas y la configuración.</Text></Paper>
      </SimpleGrid>
      <Text size="xs" c="dimmed">El especialista que acompaña una inspección no necesita cuenta: el inspector anota su nombre en la app. Desactivar una cuenta no borra lo que esa persona registró.</Text>
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Código</Table.Th><Table.Th>Nombre</Table.Th><Table.Th>Correo</Table.Th><Table.Th>Rol</Table.Th><Table.Th>Puede inspeccionar</Table.Th><Table.Th>Ve todas las estructuras</Table.Th><Table.Th>Cuenta activa</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{q.data?.items.filter((u) => !u.email.endsWith('@sistema.local')).map((u) => (
          <Table.Tr key={u.id} opacity={u.active ? 1 : 0.5}>
            <Table.Td><Badge variant="outline">{u.staffCode}</Badge></Table.Td>
            <Table.Td>{u.displayName}</Table.Td><Table.Td>{u.email}</Table.Td><Table.Td><Badge variant="light">{ROLE_LABELS[u.role]}</Badge></Table.Td>
            <Table.Td>{u.role === 'inspector' || u.canInspect ? 'Sí' : 'No'}</Table.Td><Table.Td>{u.role !== 'inspector' || u.canViewAll ? 'Sí' : 'No'}</Table.Td>
            <Table.Td><Switch checked={u.active} disabled={!isAdmin || u.id === me?.id}
              onChange={(e) => { const checked = e.currentTarget.checked; const reason = ask(checked ? '¿Por qué se reactiva la cuenta?' : '¿Por qué se desactiva la cuenta?'); if (reason) patch.mutate({ id: u.id, body: { active: checked, reason } }); }} />
              <Text size="xs" c="dimmed">{u.active ? 'Sí' : 'No'}</Text></Table.Td>
            <Table.Td>{isAdmin && (
              <Button size="xs" variant="subtle" onClick={() => {
                const password = ask('Nueva contraseña (mínimo 8 caracteres):'); if (!password) return;
                const reason = ask('¿Por qué se cambia la contraseña?'); if (reason) patch.mutate({ id: u.id, body: { password, reason } });
              }}>Cambiar contraseña</Button>)}</Table.Td>
          </Table.Tr>))}</Table.Tbody>
      </Table>
      <Modal opened={open} onClose={() => setOpen(false)} title="Nueva cuenta">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <TextInput label="Nombre" required value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.currentTarget.value })} />
          <TextInput label="Correo" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.currentTarget.value })} />
          <Select label="Rol" value={f.role} onChange={(v) => setF({ ...f, role: v ?? 'inspector' })}
            data={(isAdmin ? ['inspector', 'planner', 'admin'] : ['inspector']).map((r) => ({ value: r, label: ROLE_LABELS[r as Role] }))} />
          <PasswordInput label="Contraseña inicial (mínimo 8 caracteres)" required value={f.password} onChange={(e) => setF({ ...f, password: e.currentTarget.value })} />
          {f.role !== 'inspector' && <Checkbox label="También puede hacer inspecciones con la app" checked={f.canInspect} onChange={(e) => setF({ ...f, canInspect: e.currentTarget.checked })} />}
          {f.role === 'inspector' && <Checkbox label="Puede ver todas las estructuras (excepción)" checked={f.canViewAll} onChange={(e) => setF({ ...f, canViewAll: e.currentTarget.checked })} />}
          <Text size="xs" c="dimmed">El código (por ejemplo INS-003) se asigna solo al crear la cuenta.</Text>
          <Button type="submit" loading={create.isPending}>Crear cuenta</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
