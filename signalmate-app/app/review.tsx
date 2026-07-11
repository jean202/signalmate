import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { InputSummary, type AnalysisEditRoute } from '../components/analysis/input-summary';
import { BottomAction } from '../components/ui/bottom-action';
import { ScreenShell } from '../components/ui/screen-shell';
import { colors, radius, touchTarget } from '../components/ui/theme';
import { buildConversationRequest, validateDraft } from '../lib/analysis/input-builder';
import { analysisInputFingerprint } from '../lib/analysis/fingerprint';
import { createConversation, streamAnalysis, type AnalysisStreamEvent } from '../lib/api/client';
import { useAnalysis } from '../providers/analysis-provider';

type SubmissionState = 'idle' | 'running' | 'failed';
type ProgressCopy = '대화를 정리하는 중' | '관계 신호를 읽는 중' | '다음 행동을 만드는 중';

function progressForEvent(event: AnalysisStreamEvent): ProgressCopy | null {
  if (event.type === 'rule_complete' || event.type === 'signals_enhanced') {
    return '관계 신호를 읽는 중';
  }
  if (event.type === 'recommendations_ready' || event.type === 'complete') {
    return '다음 행동을 만드는 중';
  }
  return null;
}

export default function ReviewScreen() {
  const router = useRouter();
  const {
    beginAnalysisRun,
    cancelAnalysisRun,
    draft,
    hydrated,
    isAnalysisRunActive,
    isDraftFingerprintCurrent,
    setResult,
    updateDraft,
  } = useAnalysis();
  const [submissionState, setSubmissionState] = useState<SubmissionState>('idle');
  const [progressCopy, setProgressCopy] = useState<ProgressCopy>('대화를 정리하는 중');
  const focused = useRef(false);
  const submitting = useRef(false);
  const runIdRef = useRef<number | null>(null);
  const validation = validateDraft(draft);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    setSubmissionState((current) => current === 'running' ? 'idle' : current);
    return () => {
      focused.current = false;
      submitting.current = false;
      if (runIdRef.current !== null) cancelAnalysisRun(runIdRef.current);
      runIdRef.current = null;
    };
  }, [cancelAnalysisRun]));

  const navigate = (route: AnalysisEditRoute | '/capture') => router.push(route);

  const submit = async () => {
    if (submitting.current || !validation.valid) return;
    submitting.current = true;
    const runId = beginAnalysisRun();
    runIdRef.current = runId;
    const inputFingerprint = analysisInputFingerprint(draft);
    const canContinue = () => (
      focused.current
      && isAnalysisRunActive(runId)
      && isDraftFingerprintCurrent(inputFingerprint)
    );
    setSubmissionState('running');
    setProgressCopy('대화를 정리하는 중');

    try {
      let conversation = draft.createdConversationFingerprint === inputFingerprint
        ? draft.createdConversation
        : null;
      if (!conversation) {
        const request = buildConversationRequest(draft);
        const createdConversation = await createConversation(request);
        if (!canContinue()) return;
        conversation = createdConversation;
        updateDraft((current) => ({
          ...current,
          createdConversation,
          createdConversationFingerprint: inputFingerprint,
        }));
      }

      const analysisResult = await streamAnalysis(conversation, (event) => {
        if (!canContinue()) return;
        const nextCopy = progressForEvent(event);
        if (nextCopy) setProgressCopy(nextCopy);
      });
      if (!canContinue()) return;
      setResult(analysisResult);
      router.replace('/result');
    } catch {
      if (canContinue()) setSubmissionState('failed');
    } finally {
      if (runIdRef.current === runId) submitting.current = false;
    }
  };

  if (!hydrated) return <View style={styles.loading} />;

  return (
    <View style={styles.screen}>
      <ScreenShell bottomInset={28} contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>최종 확인</Text>
          <Text style={styles.title}>분석할 정보를 확인하세요</Text>
          <Text style={styles.description}>빠진 항목은 입력을 유지한 채 해당 화면에서 수정할 수 있어요.</Text>
        </View>

        <InputSummary draft={draft} onNavigate={navigate} />

        <View style={styles.addSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>정보 더하기</Text>
          <View style={styles.addCommands}>
            {([
              ['캡처 추가', '/capture'],
              ['텍스트 추가', '/'],
              ['만남 정보 수정', '/situation'],
            ] as const).map(([label, route]) => (
              <Pressable
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                onPress={() => navigate(route)}
                style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
              >
                <Text style={styles.addButtonText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {submissionState === 'running' && (
          <View accessibilityRole="progressbar" accessibilityLabel={progressCopy} style={styles.progress}>
            <Text style={styles.progressText}>{progressCopy}</Text>
          </View>
        )}
        {submissionState === 'failed' && (
          <View accessibilityRole="alert" style={styles.failure}>
            <Text style={styles.failureTitle}>분석을 완료하지 못했어요</Text>
            <Text style={styles.failureText}>입력은 그대로 보관했습니다. 연결 상태를 확인하고 다시 시도해 주세요.</Text>
          </View>
        )}
      </ScreenShell>
      <BottomAction primary={{
        label: submissionState === 'failed' ? '분석 다시 시도' : '분석하기',
        disabled: !validation.valid || submissionState === 'running',
        onPress: () => { void submit(); },
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background },
  content: { gap: 24 },
  heading: { gap: 6 },
  eyebrow: { color: colors.positive, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', lineHeight: 31 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  addSection: { gap: 10, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  addCommands: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addButton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.background,
  },
  addButtonPressed: { backgroundColor: colors.surface },
  addButtonText: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  progress: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.positive,
    backgroundColor: colors.positiveSurface,
  },
  progressText: { color: colors.positive, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  failure: {
    gap: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.caution,
    borderRadius: radius.panel,
    backgroundColor: colors.cautionSurface,
  },
  failureTitle: { color: colors.caution, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  failureText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
