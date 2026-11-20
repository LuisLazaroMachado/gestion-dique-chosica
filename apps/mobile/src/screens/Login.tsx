import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { api, ApiError, getServerUrl, setServerUrl, setToken } from '../api';
import { kvSet } from '../db';
import { downloadAssignments } from '../sync';
import { Btn, C, Card, Dim, Label, s } from '../ui';

export function LoginScreen({ onLogged }: { onLogged: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { getServerUrl().then(setServer); }, []);

  const login = async () => {
    setBusy(true);
    try {
      await setServerUrl(server);
      const { token } = await api('/auth/login', { body: { email: email.trim(), password }, timeoutMs: 90000 });
      await setToken(token);
      const me = await api('/me');
      if (me.user.role !== 'inspector' && !me.user.canInspect) {
        await setToken(null);
        throw new ApiError(403, 'Esta cuenta no es de inspector. La gestión se hace desde la página web.');
      }
      await kvSet('user', JSON.stringify(me.user));
      await downloadAssignments();
      onLogged();
    } catch (e) {
      Alert.alert('No se pudo ingresar', e instanceof ApiError
        ? (e.status === 0 ? 'No hay conexión con el servidor. Si es la primera vez en el día, puede tardar cerca de 1 minuto en responder: inténtalo de nuevo.' : e.full)
        : String(e));
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <View style={{ alignItems: 'center', marginBottom: 24 }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: C.primary }}>Priori Dique</Text>
          <Text style={{ fontSize: 16, color: C.dim }}>App del inspector · Lurigancho-Chosica</Text>
        </View>
        <Card>
          <Label>Correo</Label>
          <TextInput placeholderTextColor="#868e96" style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Label>Contraseña</Label>
          <TextInput placeholderTextColor="#868e96" style={s.input} value={password} onChangeText={setPassword} secureTextEntry />
          {showServer && (
            <>
              <Label>Servidor (API)</Label>
              <TextInput placeholderTextColor="#868e96" style={s.input} value={server} onChangeText={setServer} autoCapitalize="none" keyboardType="url" />
              <Dim>Para pruebas locales use la IP de la computadora, p. ej. http://192.168.1.48:3000</Dim>
            </>
          )}
          <Btn title="Ingresar" onPress={login} busy={busy} style={{ marginTop: 16 }} disabled={!email || !password} />
          <Btn title={showServer ? 'Ocultar servidor' : 'Configurar servidor'} kind="outline" onPress={() => setShowServer(!showServer)} style={{ marginTop: 8 }} />
        </Card>
        <Dim>Al ingresar, tus estructuras por inspeccionar se guardan en el teléfono para que puedas trabajar sin internet.</Dim>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
