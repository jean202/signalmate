import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#fff' },
          headerTintColor: '#111',
          headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false,
        }}
      >
        <Stack.Screen name="index" options={{ title: 'SignalMate', headerShown: false }} />
        <Stack.Screen name="analyze" options={{ title: '채팅 분석', headerBackTitle: '뒤로' }} />
        <Stack.Screen name="result" options={{ title: '분석 결과', headerBackTitle: '뒤로' }} />
      </Stack>
    </>
  );
}
