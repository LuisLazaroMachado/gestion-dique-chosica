import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, FileInput, Modal, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { INTERVENTION_STATUSES } from '@dique/shared';
import { api, ApiError, uploadEvidence, type Structure } from '../api';
import { InterventionBadge, PhysicalBadge, fmtDate } from '../components/Labels';
import { PageHeader } from '../components/Help';

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
    onSuccess: () => { notifications.show({ color: 'green', message: 'Trabajo registrado.' }); setCreating(false); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const update = useMutation({
    mutationFn: async () => {
      if (upd.file) await uploadEvidence(upd.file, { structureId: editing.structure_id, interventionId: editing.id, evidenceType: upd.fileType });
      return api(`/interventions/${editing.id}`, { method: 'PATCH', body: { reason: upd.reason, status: upd.status || undefined,
        actualStart: upd.actualStart ? toIso(upd.actualStart) : undefined, actualEnd: upd.actualEnd ? toIso(upd.actualEnd) : undefined,
        verificationNotes: upd.verificationNotes || undefined } });
    },
    onSuccess: () => { notifications.show({ color: 'green', message: 'Trabajo actualizado.' }); setEditing(null); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });

  return (
    <Stack>
      <PageHeader title="Trabajos (intervenciones)"
        description="Registra y sigue los trabajos en las estructuras: limpieza, reparación, envío de maquinaria, etc. Al terminar un trabajo, encarga una nueva inspección: el estado de la estructura solo cambia cuando un inspector la vuelve a revisar."
        actions={<Button onClick={() => setCreating(true)}>Nuevo trabajo</Button>} />
      <Table striped>
        <Table.Thead><Table.Tr><Table.Th>Registrado</Table.Th><Table.Th>Estructura</Table.Th><Table.Th>Trabajo</Table.Th><Table.Th>Situación</Table.Th><Table.Th>Estado de la estructura</Table.Th>
          <Table.Th>Maquinaria</Table.Th><Table.Th>Fechas previstas</Table.Th><Table.Th>Fechas reales</Table.Th><Table.Th /></Table.Tr></Table.Thead>
        <Table.Tbody>{list.data?.items.map((i: any) => (
          <Table.Tr key={i.id}>
            <Table.Td>{fmtDate(i.created_at)}</Table.Td><Table.Td><Link to={`/inventario/${i.structure_id}`}>{i.structure_code}</Link></Table.Td>
            <Table.Td>{i.intervention_type}</Table.Td><Table.Td><InterventionBadge value={i.status} /></Table.Td><Table.Td><PhysicalBadge value={i.physical_status} /></Table.Td>
            <Table.Td>{i.machinery ?? '-'}</Table.Td><Table.Td>{fmtDate(i.planned_start)} a {fmtDate(i.planned_end)}</Table.Td>
            <Table.Td>{fmtDate(i.actual_start)} a {fmtDate(i.actual_end)}</Table.Td>
            <Table.Td><Button size="xs" variant="light" onClick={() => { setEditing(i); setUpd({ status: i.status, actualStart: '', actualEnd: '', verificationNotes: i.verification_notes ?? '', reason: '', file: null, fileType: 'intervencion_despues' }); }}>Actualizar</Button></Table.Td>
          </Table.Tr>))}</Table.Tbody>
      </Table>
      <Modal opened={creating} onClose={() => setCreating(false)} title="Nuevo trabajo" size="lg">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Select label="Estructura" required searchable data={(structures.data?.items ?? []).map((s) => ({ value: s.id, label: `${s.code} · ${s.name}` }))}
            value={form.structureId} onChange={(v) => setForm({ ...form, structureId: v })} />
          <TextInput label="¿Qué trabajo es? (p. ej. limpieza de material, reparación)" required value={form.interventionType} onChange={(e) => setForm({ ...form, interventionType: e.currentTarget.value })} />
          <Textarea label="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} />
          <SimpleGrid cols={2}>
            <TextInput label="Maquinaria" value={form.machinery} onChange={(e) => setForm({ ...form, machinery: e.currentTarget.value })} />
            <TextInput label="Equipo a cargo" value={form.assignedTeam} onChange={(e) => setForm({ ...form, assignedTeam: e.currentTarget.value })} />
            <TextInput label="Inicio previsto" type="date" value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.currentTarget.value })} />
            <TextInput label="Fin previsto" type="date" value={form.plannedEnd} onChange={(e) => setForm({ ...form, plannedEnd: e.currentTarget.value })} />
          </SimpleGrid>
          <Button type="submit" loading={create.isPending}>Registrar</Button>
        </Stack>
      </Modal>
      <Modal opened={!!editing} onClose={() => setEditing(null)} title={`Actualizar trabajo en ${editing?.structure_code ?? ''}`} size="lg">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); update.mutate(); }}>
          <Select label="Situación" data={STATUSES} value={upd.status} onChange={(v) => setUpd({ ...upd, status: v ?? '' })} />
          <SimpleGrid cols={2}>
            <TextInput label="Inicio real" type="date" value={upd.actualStart} onChange={(e) => setUpd({ ...upd, actualStart: e.currentTarget.value })} />
            <TextInput label="Fin real" type="date" value={upd.actualEnd} onChange={(e) => setUpd({ ...upd, actualEnd: e.currentTarget.value })} />
          </SimpleGrid>
          <Textarea label="Notas de verificación (necesarias para marcar 'Verificada')" value={upd.verificationNotes} onChange={(e) => setUpd({ ...upd, verificationNotes: e.currentTarget.value })} />
          <SimpleGrid cols={2}>
            <Select label="Tipo de foto" data={[{ value: 'intervencion_antes', label: 'Antes' }, { value: 'intervencion_despues', label: 'Después' }]} value={upd.fileType} onChange={(v) => setUpd({ ...upd, fileType: v ?? 'intervencion_despues' })} />
            <FileInput label="Foto (opcional)" accept="image/jpeg,image/png,image/webp" value={upd.file} onChange={(f) => setUpd({ ...upd, file: f })} clearable />
          </SimpleGrid>
          <TextInput label="¿Qué cambió? (obligatorio)" required value={upd.reason} onChange={(e) => setUpd({ ...upd, reason: e.currentTarget.value })} />
          <Text size="xs" c="dimmed">Al terminar el trabajo, encarga una inspección para actualizar el estado de la estructura.</Text>
          <Button type="submit" loading={update.isPending}>Guardar</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
