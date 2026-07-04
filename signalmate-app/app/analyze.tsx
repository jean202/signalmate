import { useState } from 'react';
import { useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { createConversation, runAnalysis, type ContextType, type Signal, type Recommendation } from '../lib/api';

const CONTEXT_OPTIONS: { value: ContextType; label: string; desc: string }[] = [
  { value: 'first_date_followup', label: '소개팅 후속', desc: '만난 뒤 이어지는 대화' },
  { value: 'some_stage', label: '썸 단계', desc: '어느 정도 친해진 상태' },
  { value: 'dating_app', label: '데이팅 앱', desc: '앱에서 처음 만난 사람' },
  { value: 'acquaintance', label: '지인', desc: '알던 사람과 연애 가능성' },
];

export default function AnalyzeScreen() {
  const router = useRouter();
  const [chatText, setChatText] = useState('');
  const [context, setContext] = useState<ContextType>('first_date_followup');
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  async function handleAnalyze() {
    if (chatText.trim().length < 20) {
      Alert.alert('채팅 내용을 더 입력해주세요', '최소 20자 이상 붙여넣어야 분석이 가능해요.');
      return;
    }

    setLoading(true);
    setLoadingMsg('대화를 읽는 중...');

    try {
      const convId = await createConversation(chatText.trim());
      setLoadingMsg('신호를 분석 중...');

      let signals: Signal[] = [];
      let recommendations: Recommendation[] = [];

      await runAnalysis(
        convId,
        context,
        (s) => { signals = s; setLoadingMsg('AI가 강화 중...'); },
        (r) => { recommendations = r; },
      );

      router.push({
        pathname: '/result',
        params: {
          signals: JSON.stringify(signals),
          recommendations: JSON.stringify(recommendations),
        },
      });
    } catch (e) {
      Alert.alert('분석 실패', '잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>채팅 내용 붙여넣기</Text>
          <Text style={styles.hint}>카카오톡 내보내기 텍스트를 그대로 붙여넣으세요</Text>
          <TextInput
            style={styles.textArea}
            value={chatText}
            onChangeText={setChatText}
            placeholder={'예시:\n[오후 2:30] 김민준: 어제 재밌었어요!\n[오후 2:31] 나: 저도요 ㅎㅎ'}
            placeholderTextColor="#bbb"
            multiline
            numberOfLines={8}
            textAlignVertical="top"
          />

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>현재 상황</Text>
          <View style={styles.contextGrid}>
            {CONTEXT_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[styles.contextCard, context === opt.value && styles.contextCardActive]}
                onPress={() => setContext(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.contextLabel, context === opt.value && styles.contextLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={[styles.contextDesc, context === opt.value && styles.contextDescActive]}>
                  {opt.desc}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleAnalyze}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.btnText}>{loadingMsg}</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>분석하기</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: { padding: 24, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 6 },
  hint: { fontSize: 13, color: '#888', marginBottom: 10 },
  textArea: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#111',
    minHeight: 160,
    backgroundColor: '#fafafa',
  },
  contextGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },
  contextCard: {
    width: '47%',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e8e8e8',
    backgroundColor: '#fafafa',
  },
  contextCardActive: {
    borderColor: '#111',
    backgroundColor: '#111',
  },
  contextLabel: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 2 },
  contextLabelActive: { color: '#fff' },
  contextDesc: { fontSize: 12, color: '#999' },
  contextDescActive: { color: '#ccc' },
  btn: {
    backgroundColor: '#111',
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnDisabled: { backgroundColor: '#888' },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
