import type { ReactNode } from 'react';
import { ActionIcon, Group, List, Paper, Stack, Text, Title, Tooltip } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';

/** Encabezado de página con una explicación breve (y pasos opcionales) para quien la ve por primera vez. */
export function PageHeader({ title, description, steps, actions }: {
  title: string; description?: ReactNode; steps?: ReactNode[]; actions?: ReactNode;
}) {
  return (
    <Stack gap={6}>
      <Group justify="space-between" align="flex-start">
        <Title order={2}>{title}</Title>
        {actions}
      </Group>
      {description && <Text c="dimmed" size="sm" maw={900}>{description}</Text>}
      {steps && (
        <Paper withBorder p="sm" bg="blue.0" maw={900}>
          <Text size="sm" fw={600} mb={4}>Cómo funciona</Text>
          <List type="ordered" size="sm" spacing={2}>
            {steps.map((s, i) => <List.Item key={i}>{s}</List.Item>)}
          </List>
        </Paper>
      )}
    </Stack>
  );
}

/** Ícono de ayuda con explicación al pasar el mouse. */
export function HelpTip({ label, size = 16 }: { label: ReactNode; size?: number }) {
  return (
    <Tooltip label={label} withArrow multiline w={280} events={{ hover: true, focus: true, touch: true }}>
      <ActionIcon variant="transparent" color="gray" size="xs" aria-label="Ayuda">
        <IconInfoCircle size={size} />
      </ActionIcon>
    </Tooltip>
  );
}
