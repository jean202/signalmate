import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnalysisProvider } from '../providers/analysis-provider';
import { colors } from '../components/ui/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AnalysisProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700' },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: '새 분석', headerShown: false }} />
          <Stack.Screen name="capture" options={{ title: '캡처 입력', headerBackTitle: '뒤로' }} />
          <Stack.Screen name="analyze" options={{ title: '채팅 분석', headerBackTitle: '뒤로' }} />
          <Stack.Screen name="result" options={{ title: '분석 결과', headerBackTitle: '뒤로' }} />
        </Stack>
      </AnalysisProvider>
    </SafeAreaProvider>
  );
}
