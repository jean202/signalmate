import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AnalysisProvider } from '../providers/analysis-provider';
import { colors } from '../components/ui/theme';

export default function RootLayout() {
  return (
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
        <Stack.Screen name="capture" options={{ title: '캡처 선택' }} />
        <Stack.Screen name="ocr-review" options={{ title: '추출 내용 검수' }} />
        <Stack.Screen name="situation" options={{ title: '상황 입력' }} />
        <Stack.Screen name="review" options={{ title: '입력 확인' }} />
        <Stack.Screen name="result" options={{ title: '분석 결과', gestureEnabled: false }} />
      </Stack>
    </AnalysisProvider>
  );
}
