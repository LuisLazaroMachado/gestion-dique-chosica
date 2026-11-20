import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MantineProvider, createTheme, Center, Loader } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { MapPage } from './pages/MapPage';
import { InventoryPage } from './pages/Inventory';
import { StructureDetailPage } from './pages/StructureDetail';
import { AssignmentsPage } from './pages/Assignments';
import { InspectionsPage, InspectionDetailPage } from './pages/Inspections';
import { PrioritiesPage } from './pages/Priorities';
import { InterventionsPage } from './pages/Interventions';
import { RoutesPage } from './pages/RoutesPage';
import { ScenariosPage } from './pages/Scenarios';
import { AuditPage } from './pages/Audit';
import { UsersPage } from './pages/Users';
import { SettingsPage } from './pages/Settings';

const theme = createTheme({ primaryColor: 'blue', defaultRadius: 'md', fontFamily: 'Inter, system-ui, Segoe UI, Roboto, sans-serif' });
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Center h="100vh"><Loader /></Center>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<Protected />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/mapa" element={<MapPage />} />
                <Route path="/inventario" element={<InventoryPage />} />
                <Route path="/inventario/:id" element={<StructureDetailPage />} />
                <Route path="/asignaciones" element={<AssignmentsPage />} />
                <Route path="/inspecciones" element={<InspectionsPage />} />
                <Route path="/inspecciones/:id" element={<InspectionDetailPage />} />
                <Route path="/priorizacion" element={<PrioritiesPage />} />
                <Route path="/intervenciones" element={<InterventionsPage />} />
                <Route path="/rutas" element={<RoutesPage />} />
                <Route path="/escenarios" element={<ScenariosPage />} />
                <Route path="/auditoria" element={<AuditPage />} />
                <Route path="/usuarios" element={<UsersPage />} />
                <Route path="/configuracion" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </MantineProvider>
  </StrictMode>,
);
