import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export function LoginPage() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await login(email, password); } catch (err) { setError(err instanceof ApiError ? err.full : (err as Error).message); }
    setBusy(false);
  };

  return (
    <Center mih="100vh" bg="gray.1" p="md">
      <Paper withBorder shadow="md" p="xl" w={420} component="form" onSubmit={submit}>
        <Stack>
          <Center><img src="/favicon.svg" width={56} alt="" /></Center>
          <Title order={2} ta="center">Priori Dique Chosica</Title>
          <Text c="dimmed" size="sm" ta="center">
            Gestión de inspecciones, priorización e intervenciones de estructuras de protección en Lurigancho-Chosica.
          </Text>
          {error && <Alert color="red">{error}</Alert>}
          <TextInput label="Correo" type="email" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} autoComplete="username" />
          <PasswordInput label="Contraseña" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} autoComplete="current-password" />
          <Button type="submit" loading={busy}>Ingresar</Button>
          <Text size="xs" c="dimmed" ta="center">
            Herramienta de apoyo a la decisión humana. No certifica seguridad estructural ni emite alertas oficiales.
          </Text>
        </Stack>
      </Paper>
    </Center>
  );
}
