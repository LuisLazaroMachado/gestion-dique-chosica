import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Badge, Button, Card, Group, Image, Loader, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Table, Text,
  Textarea, TextInput, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { EVIDENCE_TYPE_LABELS, SCALE_DESCRIPTORS, SCALE_NAMES, type EvidenceType } from '@dique/shared';
import { api, ApiError, evidenceObjectUrl } from '../api';
import { DataLabel, PhysicalBadge, fmtDateTime } from '../components/Labels';

const errMsg = (e: unknown) => (e instanceof ApiError ? e.full : String(e));
const V_COLORS: Record<string, string> = { Enviado: 'blue', Validado: 'green', Observado: 'orange' };

export function InspectionsPage() {
  const [status, setStatus] = useState('Enviado');
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['inspections', status], queryFn: () => api(`/inspections?${status !== 'todas' ? `validationStatus=${status}&` : ''}limit=300`) });
  return (
    <Stack>
      <Title order={2}>Inspecciones</Title>
      <SegmentedControl value={status} onChange={setStatus} w={480}
        data={[{ value: 'Enviado', label: 'Por revisar' }, { value: 'Observado', label: 'Observadas' }, { value: 'Validado', label: 'Validadas' }, { value: 'todas', label: 'Todas' }]} />
      {q.isLoading ? <Loader /> : (
        <Table striped highlightOnHover>
          <Table.Thead><Table.Tr><Table.Th>Fecha</Table.Th><Table.Th>Estructura</Table.Th><Table.Th>Inspector</Table.Th><Table.Th>D</Table.Th><Table.Th>C</Table.Th><Table.Th>A</Table.Th>
            <Table.Th>Completa</Table.Th><Table.Th>Estado físico</Table.Th><Table.Th>Validación</Table.Th><Table.Th>Dato</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>{q.data?.items.map((i: any) => (
            <Table.Tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/inspecciones/${i.id}`)}>
              <Table.Td>{fmtDateTime(i.inspectedAt)}</Table.Td><Table.Td>{i.structureCode} — {i.structureName}</Table.Td><Table.Td>{i.inspectorName}</Table.Td>
              <Table.Td>{i.damageScore ?? '—'}</Table.Td><Table.Td>{i.cloggingScore ?? '—'}</Table.Td><Table.Td>{i.activeProcessScore ?? '—'}</Table.Td>
              <Table.Td>{i.complete ? 'Sí' : <Badge color="orange" size="sm">Incompleta</Badge>}</Table.Td>
              <Table.Td><PhysicalBadge value={i.physicalStatus} /></Table.Td><Table.Td><Badge color={V_COLORS[i.validationStatus]}>{i.validationStatus}</Badge></Table.Td>
              <Table.Td><DataLabel value={i.dataLabel} size="xs" /></Table.Td>
            </Table.Tr>))}</Table.Tbody>
        </Table>
      )}
      {q.data?.items.length === 0 && <Text c="dimmed">No hay inspecciones en esta categoría.</Text>}
    </Stack>
  );
}

function Photo({ id, label }: { id: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { let u: string; evidenceObjectUrl(id).then((x) => { u = x; setUrl(x); }).catch(() => setErr(true)); return () => { if (u) URL.revokeObjectURL(u); }; }, [id]);
  return (
    <Card withBorder p="xs">
      {url ? <a href={url} target="_blank" rel="noreferrer"><Image src={url} h={160} fit="cover" radius="sm" /></a> : err ? <Text size="xs" c="red">No disponible</Text> : <Loader size="sm" />}
      <Text size="xs" mt={4}>{label}</Text>
    </Card>
  );
}

function Score({ k, value }: { k: 'D' | 'C' | 'A'; value: number | null }) {
  return (
    <Card withBorder>
      <Text size="xs" c="dimmed">{k} — {SCALE_NAMES[k]}</Text>
      <Text size="1.6rem" fw={700}>{value ?? '—'}</Text>
      <Text size="xs">{value == null ? 'No registrado (no se calcula P)' : SCALE_DESCRIPTORS[k][value]}</Text>
    </Card>
  );
}

export function InspectionDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [observe, setObserve] = useState(false);
  const [notes, setNotes] = useState('');
  const [correct, setCorrect] = useState(false);
  const [corr, setCorr] = useState<{ d: number | ''; c: number | ''; a: number | ''; physical: string; reason: string }>({ d: '', c: '', a: '', physical: '', reason: '' });
  const q = useQuery({ queryKey: ['inspection', id], queryFn: () => api(`/inspections/${id}`) });
  const validate = useMutation({
    mutationFn: (decision: 'Validado' | 'Observado') => api(`/inspections/${id}/validate`, { body: { decision, notes: notes || null } }),
    onSuccess: (r: any) => {
      notifications.show({ color: 'green', message: r.priority ? `Validada. Prioridad recalculada: ${r.priority.calculated} estructuras con P.` : 'Inspección observada.' });
      setObserve(false); qc.invalidateQueries();
    },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  const fix = useMutation({
    mutationFn: () => {
      const changes: Record<string, unknown> = {};
      if (corr.d !== '') changes.damageScore = corr.d;
      if (corr.c !== '') changes.cloggingScore = corr.c;
      if (corr.a !== '') changes.activeProcessScore = corr.a;
      if (corr.physical) changes.physicalStatus = corr.physical;
      return api(`/inspections/${id}`, { method: 'PATCH', body: { reason: corr.reason, changes } });
    },
    onSuccess: () => { notifications.show({ color: 'green', message: 'Corrección registrada con antes/después.' }); setCorrect(false); qc.invalidateQueries(); },
    onError: (e) => notifications.show({ color: 'red', message: errMsg(e) }),
  });
  if (q.isLoading) return <Loader />;
  if (q.error) return <Alert color="red">{errMsg(q.error)}</Alert>;
  const i = q.data;
  const reasons = Object.entries(i.undeterminedReasons ?? {});
  return (
    <Stack>
      <Text size="sm" c="dimmed"><Link to="/inspecciones">Inspecciones</Link> / {i.structureCode}</Text>
      <Group justify="space-between">
        <div>
          <Title order={2}>Inspección de <Link to={`/inventario/${i.structureId}`}>{i.structureCode}</Link></Title>
          <Text size="sm">{i.structureName} · {fmtDateTime(i.inspectedAt)} · Inspector: {i.inspectorName}{i.verifierName ? ` · Verificador: ${i.verifierName}` : ''}</Text>
        </div>
        <Group>
          <Badge size="lg" color={V_COLORS[i.validationStatus]}>{i.validationStatus}</Badge>
          <DataLabel value={i.dataLabel} />
        </Group>
      </Group>
      {i.dataLabel !== 'Documentado' && <Alert color="orange">Registro de referencia con valores estimados a partir de la fuente: {i.sourceReference}</Alert>}
      {!i.complete && <Alert color="orange" title="Inspección incompleta">Falta al menos un indicador D/C/A. No se calculará prioridad con esta inspección.</Alert>}
      <SimpleGrid cols={{ base: 1, md: 3 }}>
        <Score k="D" value={i.damageScore} /><Score k="C" value={i.cloggingScore} /><Score k="A" value={i.activeProcessScore} />
      </SimpleGrid>
      <Card withBorder>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <div><Text size="xs" c="dimmed">Estado físico observado</Text><PhysicalBadge value={i.physicalStatus} /></div>
          <div><Text size="xs" c="dimmed">Accesibilidad</Text><Text size="sm">{i.accessStatus}{i.accessNotes ? ` — ${i.accessNotes}` : ''}</Text></div>
          <div><Text size="xs" c="dimmed">GPS del teléfono (evidencia)</Text>
            <Text size="sm">{i.deviceLocation ? `${i.deviceLocation.lat.toFixed(6)}, ${i.deviceLocation.lon.toFixed(6)}` : '—'}
              {i.deviceLocation?.mock && <Badge color="grape" ml={6} size="sm">Ubicación simulada</Badge>}</Text></div>
        </SimpleGrid>
        {i.observations && <><Text size="xs" c="dimmed" mt="sm">Observaciones</Text><Text size="sm">{i.observations}</Text></>}
        {reasons.length > 0 && <><Text size="xs" c="dimmed" mt="sm">Campos no determinados</Text>{reasons.map(([k, v]) => <Text size="sm" key={k}>{k}: {String(v)}</Text>)}</>}
        {i.validationNotes && <><Text size="xs" c="dimmed" mt="sm">Notas de validación</Text><Text size="sm">{i.validationNotes}</Text></>}
      </Card>
      <Title order={4}>Evidencias ({i.evidence.length})</Title>
      <SimpleGrid cols={{ base: 2, md: 5 }}>
        {i.evidence.filter((e: any) => e.upload_status === 'confirmada').map((e: any) => (
          <Photo key={e.id} id={e.id} label={`${EVIDENCE_TYPE_LABELS[e.evidence_type as EvidenceType]}${e.location_mock ? ' · GPS simulado' : ''}`} />
        ))}
      </SimpleGrid>
      {i.evidence.some((e: any) => e.upload_status !== 'confirmada') && <Text size="xs" c="orange">Hay fotos pendientes de sincronización desde el móvil.</Text>}
      {i.corrections.length > 0 && (
        <>
          <Title order={4}>Correcciones</Title>
          <Table striped><Table.Tbody>{i.corrections.map((c: any, k: number) => (
            <Table.Tr key={k}><Table.Td>{fmtDateTime(c.occurred_at)}</Table.Td><Table.Td>{c.actor_name}</Table.Td><Table.Td>{c.reason}</Table.Td>
              <Table.Td><Text size="xs">D {c.before_data.damage_score}→{c.after_data.damage_score} · C {c.before_data.clogging_score}→{c.after_data.clogging_score} · A {c.before_data.active_process_score}→{c.after_data.active_process_score}</Text></Table.Td></Table.Tr>))}</Table.Tbody></Table>
        </>
      )}
      <Group>
        <Button color="green" onClick={() => validate.mutate('Validado')} loading={validate.isPending} disabled={i.validationStatus === 'Validado'}>Validar</Button>
        <Button color="orange" variant="light" onClick={() => setObserve(true)}>Observar</Button>
        <Button variant="default" onClick={() => setCorrect(true)}>Corregir</Button>
      </Group>
      <Modal opened={observe} onClose={() => setObserve(false)} title="Observar inspección">
        <Stack>
          <Textarea label="Motivo (obligatorio; el inspector lo verá en la app)" required value={notes} onChange={(e) => setNotes(e.currentTarget.value)} />
          <Button color="orange" onClick={() => validate.mutate('Observado')} loading={validate.isPending}>Registrar observación</Button>
        </Stack>
      </Modal>
      <Modal opened={correct} onClose={() => setCorrect(false)} title="Corregir inspección (queda auditado)">
        <Stack component="form" onSubmit={(e) => { e.preventDefault(); fix.mutate(); }}>
          <SimpleGrid cols={3}>
            <NumberInput label={`D (actual ${i.damageScore ?? '—'})`} min={0} max={3} value={corr.d} onChange={(v) => setCorr({ ...corr, d: v as number })} />
            <NumberInput label={`C (actual ${i.cloggingScore ?? '—'})`} min={0} max={3} value={corr.c} onChange={(v) => setCorr({ ...corr, c: v as number })} />
            <NumberInput label={`A (actual ${i.activeProcessScore ?? '—'})`} min={0} max={3} value={corr.a} onChange={(v) => setCorr({ ...corr, a: v as number })} />
          </SimpleGrid>
          <Select label="Estado físico" clearable data={['Operativo', 'Deteriorado', 'Crítico', 'En evaluación']} value={corr.physical || null} onChange={(v) => setCorr({ ...corr, physical: v ?? '' })} />
          <TextInput label="Motivo (obligatorio)" required value={corr.reason} onChange={(e) => setCorr({ ...corr, reason: e.currentTarget.value })} />
          <Button type="submit" loading={fix.isPending}>Guardar corrección</Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
