import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getToken, setToken } from './src/api';
import { getDb } from './src/db';
import { LoginScreen } from './src/screens/Login';
import { HomeScreen } from './src/screens/Home';
import { InspectionScreen, StructureScreen } from './src/screens/Inspection';
import { RecordsScreen } from './src/screens/Records';
import { C } from './src/ui';

type Route =
  | { name: 'loading' } | { name: 'login' } | { name: 'home' } | { name: 'records' }
  | { name: 'structure'; structureId: string; assignmentId: string | null }
  | { name: 'inspection'; structureId: string; assignmentId: string | null };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'loading' });
  const [homeKey, setHomeKey] = useState(0);

  useEffect(() => {
    (async () => {
      await getDb();
      // Con sesión guardada se entra directo (trabajo offline sin volver a iniciar sesión).
      setRoute((await getToken()) ? { name: 'home' } : { name: 'login' });
    })();
  }, []);

  const goHome = () => { setHomeKey((k) => k + 1); setRoute({ name: 'home' }); };

  let screen: React.ReactNode = null;
  switch (route.name) {
    case 'loading':
      screen = <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={C.primary} /></View>;
      break;
    case 'login':
      screen = <LoginScreen onLogged={goHome} />;
      break;
    case 'home':
      screen = <HomeScreen key={homeKey} onOpen={(structureId, assignmentId) => setRoute({ name: 'structure', structureId, assignmentId })}
        onRecords={() => setRoute({ name: 'records' })} onLogout={async () => { await setToken(null); setRoute({ name: 'login' }); }} />;
      break;
    case 'records':
      screen = <RecordsScreen onBack={goHome} />;
      break;
    case 'structure':
      screen = <StructureScreen structureId={route.structureId} onBack={goHome}
        onInspect={() => setRoute({ name: 'inspection', structureId: route.structureId, assignmentId: route.assignmentId })} />;
      break;
    case 'inspection':
      screen = <InspectionScreen structureId={route.structureId} assignmentId={route.assignmentId} onDone={goHome}
        onCancel={() => setRoute({ name: 'structure', structureId: route.structureId, assignmentId: route.assignmentId })} />;
      break;
  }
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: C.primary }} edges={['top']}>
        <StatusBar style="light" />
        <View style={{ flex: 1, backgroundColor: C.bg }}>{screen}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
