import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, FileInput, Group, Modal, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { INTERVENTION_STATUSES } from '@dique/shared';
import { api, ApiError, uploadEvidence, type Structure } from '../api';
import { InterventionBadge, PhysicalBadge, fmtDate } from '../components/Labels';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));
const STATUSES = INTERVENTION_STATUSES.filter((s) => s !== 'Sin intervención');
const toIso = (d: string) => (d ? new Date(d + 'T08:00:00-05:00').toISOString() : null);

export function InterventionsPage() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ structureId: params.get('structureId'), interventionType: '', description: '', machinery: '', assignedTeam: '', plannedStart: '', plannedEnd: '' });
  const [upd, setUpd] = useState({ status: '', actualStart: '', actualEnd: '', verificationNotes: '', reason: '', file: null as File | null, fileType: 'intervencion_despues' });
  const list = useQuery({ queryKey: ['interventions'], queryFn: () => api('/interventions') });
  const structures = useQuery({ queryKey: ['structures'], queryFn: () => api<{ items: Structure[] }>('/structures') });
  const create = useMutation({
    mutationFn: () => api('/interventions', { body: { structureId: form.structureId, interventionType: form.interventionType, description: form.description || null,
      machinery: form.machinery || null, assignedTeam: form.assignedTeam || null, plannedStart: toIso(form.plannedStart), plannedEnd: toIso(form.plannedEnd) } }),
    onSuccess: () => { notifications.show({ color: 'green', message: 'Intervención registrada.' }); setCreating(false); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const update = useMutation({
    mutationFn: async () => {
      if (upd.file) await uploadEvidence(upd.file, { structureId: editing.structure_id, interventionId: editing.id, evidenceType: upd.fileType });
      return api(`/interventions/${editing.id}`, { method: 'PATCH', body: { reason: upd.reason, status: upd.status || undefined,
        actualStart: upd.actualStart ? toIso(upd.actualStart) : undefined, actualEnd: upd.actualEnd ? toIso(upd.actualEnd) : undefined,
        verificationNotes: upd.verificationNotes || undefined } });
    },
    onSuccess: () => { notifications.show({ color: 'green', message: 'Intervención actualizada.' }); setEditing(null); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Intervenciones</Title>
        <Button onClick={() => setCreating(true)}>Nueva intervención</Button>
      </Group>
      <Alert variant="light">
        El sistema registra y planifica intervenciones; no define procedimientos técnicos de mantenimiento o reparación.
        Finalizar un trabajo <b>no</b> cambia el estado físico: este solo cambia con una nueva inspección validada.
      </Alert>
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Creada</Table.Th><Table.Th>Estructura</Table.Th><Table.Th>Tipo</Table.Th><Table.Th>Estado</Table.Th><Table.Th>Estado físico</Table.Th>
          <Table.Th>Maquinaria</Table.Th><Table.Th>Planificada</Table.Th><Table.Th>Ejecutada</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{list.data?.items.map((i: any) => (
          <Table.Tr key={i.id}>
            <Table.Td>{fmtDate(i.created_at)}</Table.Td><Table.Td><Link to={`/inventario/${i.structure_id}`}>{i.structure_code}</Link></Table.Td>
            <Table.Td>{i.intervention_type}</Table.Td><Table.Td><InterventionBadge value={i.status} /></Table.Td><Table.Td><PhysicalBadge value={i.physical_status} /></Table.Td>
            <Table.Td>{i.machinery ?? '—'}</Table.Td><Table.Td>{fmtDate(i.planned_start)} – {fmtDate(i.planned_end)}</Table.Td>
            <Table.Td>{fmtDate(i.actual_start)} – {fmtDate(i.actual_end)}</Table.Td>
            <Table.Td><Button size="xs" variant="light" onClick={() => { setEditing(i); setUpd({ status: i.status, actualStart: '', actualEnd: '', verificationNotes: i.verification_notes ?? '', reason: '', file: null, fileType: 'intervencion_despues' }); }}>Actualizar</Button></Table.Td>
          </Table.Tr>))}</Table.Tbody>
      </Table>
      <Modal opened={creating} onClose={() => setCreating(false)} title="Nueva intervención" size="lg">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Select label="Estructura" required searchable data={(structures.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
            value={form.structureId} onChange={(v) => setForm({ ...form, structureId: v })} />
          <TextInput label="Tipo de trabajo (p. ej. descolmatación, reparación)" required value={form.interventionType} onChange={(e) => setForm({ ...form, interventionType: e.currentTarget.value })} />
          <Textarea label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
          <SimpleGrid cols={2}>
            <TextInput label="Maquinaria" value={form.machinery} onChange={(e) => setForm({ ...form, machinery: e.currentTarget.value })} />
            <TextInput label="Equipo responsable" value={form.assignedTeam} onChange={(e) => setForm({ ...form, assignedTeam: e.currentTarget.value })} />
            <TextInput label="Inicio planificado" type="date" value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.currentTarget.value })} />
            <TextInput label="Fin planificado" type="date" value={form.plannedEnd} onChange={(e) => setForm({ ...form, plannedEnd: e.currentTarget.value })} />
          </SimpleGrid>
          <Button type="submit" loading={create.isPending}>Registrar</Button>
        </Stack>
      </Modal>
      <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Actualizar intervención — ${editing?.structure_code ?? ''}`} size="lg">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
          <Select label="Estado" data={STATUSES} value={upd.status} onChange={(v) => setUpd({ ...upd, status: v ?? '' })} />
          <SimpleGrid cols={2}>
            <TextInput label="Inicio real" type="date" value={upd.actualStart} onChange={(e) => setUpd({ ...upd, actualStart: e.currentTarget.value })} />
            <TextInput label="Fin real" type="date" value={upd.actualEnd} onChange={(e) => setUpd({ ...upd, actualEnd: e.currentTarget.value })} />
          </SimpleGrid>
          <Textarea label="Notas de verificación (obligatorias para 'Verificada')" value={upd.verificationNotes} onChange={(e) => setUpd({ ...upd, verificationNotes: e.currentTarget.value })} />
          <SimpleGrid cols={2}>
            <Select label="Tipo de foto" data={[{ value: 'intervencion_antes', label: 'Antes' }, { value: 'intervencion_despues', label: 'Después' }]} value={upd.fileType} onChange={(v) => setUpd({ ...upd, fileType: v ?? 'intervencion_despues' })} />
            <FileInput label="Evidencia (foto)" accept="image/jpeg,image/png,image/webp" value={upd.file} onChange={(f) => setUpd({ ...upd, file: f })} clearable />
          </SimpleGrid>
          <TextInput label="Motivo del cambio (obligatorio)" required value={upd.reason} onChange={(e) => setUpd({ ...upd, reason: e.currentTarget.value })} />
          <Text size="xs" c="dimmed">Tras finalizar, programe una inspección para actualizar el estado físico.</Text>
          <Button type="submit" loading={update.isPending}>Guardar</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
