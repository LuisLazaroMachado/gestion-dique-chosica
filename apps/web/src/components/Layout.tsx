import { AppShell, Burger, Group, NavLink, Text, Button, Badge, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { NavLink as RouterLink, Outlet, useLocation } from 'react-router-dom';
import {
  IconLayoutDashboard, IconMap2, IconBuildingBridge, IconClipboardList, IconClipboardCheck, IconChartBar,
  IconTool, IconRoute, IconWaveSine, IconHistory, IconUsers, IconSettings, IconLogout,
} from '@tabler/icons-react';
import { ROLE_LABELS } from '@dique/shared';
import { useAuth } from '../auth';

const NAV = [
  { to: '/', label: 'Tablero', icon: IconLayoutDashboard },
  { to: '/mapa', label: 'Mapa', icon: IconMap2 },
  { to: '/inventario', label: 'Inventario', icon: IconBuildingBridge },
  { to: '/asignaciones', label: 'Encargar inspecciones', icon: IconClipboardList },
  { to: '/inspecciones', label: 'Revisar inspecciones', icon: IconClipboardCheck },
  { to: '/priorizacion', label: 'Prioridades', icon: IconChartBar },
  { to: '/intervenciones', label: 'Trabajos (intervenciones)', icon: IconTool },
  { to: '/rutas', label: 'Rutas de maquinaria', icon: IconRoute },
  { to: '/escenarios', label: 'Simulador de huaico', icon: IconWaveSine },
  { to: '/auditoria', label: 'Historial de cambios', icon: IconHistory },
  { to: '/usuarios', label: 'Usuarios', icon: IconUsers },
  { to: '/configuracion', label: 'Configuración', icon: IconSettings },
];

export function Layout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { user, logout } = useAuth();
  const loc = useLocation();
  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 230, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <img src="/favicon.svg" width={28} height={28} alt="" />
            <Text fw={700}>Priori Dique Chosica</Text>
            <Badge variant="light" color="gray" visibleFrom="md">Herramienta de apoyo a la decisión</Badge>
          </Group>
          <Group gap="xs">
            <Text size="sm" visibleFrom="sm">{user?.displayName}{user && user.displayName !== ROLE_LABELS[user.role] ? ` · ${ROLE_LABELS[user.role]}` : ''}{user?.staffCode ? ` · ${user.staffCode}` : ''}</Text>
            <Button size="xs" variant="subtle" leftSection={<IconLogout size={16} />} onClick={logout}>Salir</Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        <ScrollArea>
          {NAV.map((n) => (
            <NavLink key={n.to} component={RouterLink} to={n.to} label={n.label} leftSection={<n.icon size={18} />}
              active={n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to)} onClick={close} />
          ))}
        </ScrollArea>
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
