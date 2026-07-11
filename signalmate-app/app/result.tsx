import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { Check, Copy } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ScreenShell } from '../components/ui/screen-shell';
import { colors, radius, touchTarget } from '../components/ui/theme';
import { groupSignalsByContext } from '../lib/analysis/signal-groups';
import type {
  AnalysisRecommendation,
  AnalysisSignal,
  ConfidenceLevel,
  SignalType,
} from '../lib/analysis/types';
import { useAnalysis } from '../providers/analysis-provider';

const SIGNAL_PRESENTATION: Record<SignalType, { color: string; label: string }> = {
  positive: { color: colors.positive, label: '긍정' },
  caution: { color: colors.caution, label: '주의' },
  ambiguous: { color: colors.ambiguous, label: '애매' },
};

const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
};

type ResetState = 'idle' | 'running' | 'failed';

export default function ResultScreen() {
  const router = useRouter();
  const { resetDraft, result } = useAnalysis();
  const mounted = useRef(true);
  const resetting = useRef(false);
  const [resetState, setResetState] = useState<ResetState>('idle');
  const [copiedRecommendationId, setCopiedRecommendationId] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const groups = useMemo(
    () => groupSignalsByContext(result?.signals ?? []),
    [result?.signals],
  );
  const recommendations = useMemo(
    () => sortRecommendations(result?.recommendations ?? []),
    [result?.recommendations],
  );
  const nextMessage = recommendations.find((item) => item.recommendationType === 'next_message');

  const startNewAnalysis = async () => {
    if (resetting.current) return;
    resetting.current = true;
    setResetState('running');
    try {
      await resetDraft();
      if (mounted.current) router.replace('/');
    } catch {
      if (mounted.current) setResetState('failed');
    } finally {
      resetting.current = false;
    }
  };

  const copyRecommendation = async (recommendation: AnalysisRecommendation) => {
    setCopyFailed(false);
    try {
      await Clipboard.setStringAsync(recommendation.content);
      if (mounted.current) setCopiedRecommendationId(recommendation.id);
    } catch {
      if (mounted.current) setCopyFailed(true);
    }
  };

  if (!result) {
    return (
      <View style={styles.screen}>
        <ScreenShell contentContainerStyle={styles.emptyContent} bottomInset={32}>
          <View style={styles.emptyState}>
            <Text style={styles.eyebrow}>분석 결과</Text>
            <Text accessibilityRole="header" style={styles.emptyTitle}>분석 결과를 찾지 못했어요</Text>
            <Text style={styles.bodyText}>저장된 결과가 없거나 앱이 다시 시작됐어요. 입력 화면으로 돌아가 새 분석을 시작해 주세요.</Text>
            {resetState === 'failed' && <ResetFailure />}
            <NewAnalysisButton
              label={resetState === 'failed' ? '새 분석 다시 시도' : '새 분석으로 돌아가기'}
              running={resetState === 'running'}
              onPress={startNewAnalysis}
            />
          </View>
        </ScreenShell>
      </View>
    );
  }

  const hasMeetingSignals = groups.meeting.length > 0 || groups.followUp.length > 0;

  return (
    <View style={styles.screen}>
      <ScreenShell testID="result-scroll" contentContainerStyle={styles.content} bottomInset={40}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>분석 완료</Text>
          <Text accessibilityRole="header" style={styles.title}>관계 신호를 근거부터 확인하세요</Text>
          <Text style={styles.bodyText}>신호는 가능성을 보여주는 참고 정보예요. 실제 반응을 보며 다음 행동을 조정하세요.</Text>
        </View>

        {hasMeetingSignals && (
          <ResultSection title="실제 만남 신호">
            {groups.meeting.length > 0 && (
              <SignalGroup label="만남에서 확인된 신호" signals={groups.meeting} />
            )}
            {groups.followUp.length > 0 && (
              <SignalGroup label="만남 뒤 연락" signals={groups.followUp} />
            )}
          </ResultSection>
        )}

        {groups.chat.length > 0 && (
          <ResultSection title="채팅 신호">
            <View>{groups.chat.map((signal) => <SignalRow key={signal.id} signal={signal} />)}</View>
          </ResultSection>
        )}

        {groups.uncertainty.length > 0 && (
          <ResultSection title="판단이 어려운 부분">
            <View>{groups.uncertainty.map((signal) => <SignalRow key={signal.id} signal={signal} />)}</View>
          </ResultSection>
        )}

        <ResultSection title="종합 판단">
          <Text style={styles.summaryText}>{result.overallSummary || '확인할 수 있는 종합 판단이 없어요.'}</Text>
          <Text style={styles.overallConfidence}>전체 신뢰도 {CONFIDENCE_LABEL[result.confidenceLevel]}</Text>
        </ResultSection>

        <ResultSection title="추천하는 다음 행동">
          {!!result.recommendedAction && <Text style={styles.actionTitle}>{result.recommendedAction}</Text>}
          <Text style={styles.bodyText}>{result.recommendedActionReason || '현재 정보만으로 구체적인 다음 행동을 추천하기 어려워요.'}</Text>
        </ResultSection>

        <ResultSection title="추천 메시지">
          {nextMessage ? (
            <View
              accessibilityLabel={`추천 메시지: ${nextMessage.content}`}
              style={styles.messagePanel}
              testID="recommendation-row"
            >
              <Text style={styles.recommendationTitle}>{nextMessage.title}</Text>
              <Text selectable style={styles.messageText}>{nextMessage.content}</Text>
              {!!nextMessage.rationale && <Text style={styles.rationale}>{nextMessage.rationale}</Text>}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copiedRecommendationId === nextMessage.id
                  ? '추천 메시지 복사 완료'
                  : '추천 메시지 복사'}
                onPress={() => { void copyRecommendation(nextMessage); }}
                style={({ pressed }) => [styles.copyButton, pressed && styles.commandPressed]}
              >
                {copiedRecommendationId === nextMessage.id
                  ? <Check color={colors.background} size={18} strokeWidth={2.5} />
                  : <Copy color={colors.background} size={18} strokeWidth={2.25} />}
                <Text style={styles.copyButtonText}>
                  {copiedRecommendationId === nextMessage.id ? '복사 완료' : '복사'}
                </Text>
              </Pressable>
              {copyFailed && <Text accessibilityRole="alert" style={styles.inlineError}>메시지를 복사하지 못했어요. 다시 시도해 주세요.</Text>}
            </View>
          ) : (
            <View style={styles.noMessage}>
              <Text style={styles.noMessageTitle}>추천 메시지를 만들지 못했어요</Text>
              <Text style={styles.bodyText}>추천하는 다음 행동을 참고해 직접 메시지를 작성해 보세요.</Text>
            </View>
          )}

          {recommendations
            .filter((item) => item.recommendationType !== 'next_message')
            .map((recommendation) => (
              <RecommendationRow key={recommendation.id} recommendation={recommendation} />
            ))}
        </ResultSection>

        {result.warnings.length > 0 && (
          <ResultSection title="서버 안내">
            <View accessibilityRole="alert" style={styles.warningList}>
              {result.warnings.map((warning, index) => (
                <Text key={`${index}-${warning}`} style={styles.warningText}>{warning}</Text>
              ))}
            </View>
          </ResultSection>
        )}

        {resetState === 'failed' && <ResetFailure />}
        <NewAnalysisButton
          label={resetState === 'failed' ? '새 분석 다시 시도' : '새 분석 시작'}
          running={resetState === 'running'}
          onPress={startNewAnalysis}
        />
      </ScreenShell>
    </View>
  );
}

function sortRecommendations(recommendations: readonly AnalysisRecommendation[]) {
  return recommendations
    .map((recommendation, inputOrder) => ({ recommendation, inputOrder }))
    .sort((left, right) => {
      const leftPriority = left.recommendation.recommendationType === 'next_message' ? 0 : 1;
      const rightPriority = right.recommendation.recommendationType === 'next_message' ? 0 : 1;
      return leftPriority - rightPriority
        || left.recommendation.displayOrder - right.recommendation.displayOrder
        || left.inputOrder - right.inputOrder;
    })
    .map(({ recommendation }) => recommendation);
}

function ResultSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SignalGroup({ label, signals }: { label: string; signals: AnalysisSignal[] }) {
  return (
    <View style={styles.signalGroup}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View>{signals.map((signal) => <SignalRow key={signal.id} signal={signal} />)}</View>
    </View>
  );
}

function SignalRow({ signal }: { signal: AnalysisSignal }) {
  const presentation = SIGNAL_PRESENTATION[signal.signalType];
  return (
    <View
      accessibilityLabel={`${presentation.label} 신호. ${signal.title}. 신뢰도 ${CONFIDENCE_LABEL[signal.confidenceLevel]}`}
      style={[styles.signalRow, { borderLeftColor: presentation.color }]}
      testID={`signal-row-${signal.id}`}
    >
      <View style={styles.signalMeta}>
        <Text style={[styles.signalType, { color: presentation.color }]}>{presentation.label}</Text>
        <Text style={styles.confidence}>신뢰도 {CONFIDENCE_LABEL[signal.confidenceLevel]}</Text>
      </View>
      <Text style={styles.signalTitle}>{signal.title}</Text>
      <Text style={styles.signalDescription}>{signal.description}</Text>
      <View style={styles.evidence}>
        <Text style={styles.evidenceLabel}>근거</Text>
        <Text selectable style={styles.evidenceText}>{signal.evidenceText || '표시할 근거가 없어요.'}</Text>
      </View>
    </View>
  );
}

function RecommendationRow({ recommendation }: { recommendation: AnalysisRecommendation }) {
  return (
    <View style={styles.recommendationRow} testID="recommendation-row">
      <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
      <Text style={styles.signalDescription}>{recommendation.content}</Text>
      {!!recommendation.rationale && <Text style={styles.rationale}>{recommendation.rationale}</Text>}
    </View>
  );
}

function NewAnalysisButton({ label, onPress, running }: {
  label: string;
  onPress: () => Promise<void>;
  running: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: running, disabled: running }}
      disabled={running}
      onPress={() => { void onPress(); }}
      style={({ pressed }) => [
        styles.newAnalysisButton,
        pressed && styles.commandPressed,
        running && styles.commandDisabled,
      ]}
    >
      <Text style={styles.newAnalysisButtonText}>{running ? '새 분석 준비 중' : label}</Text>
    </Pressable>
  );
}

function ResetFailure() {
  return (
    <View accessibilityRole="alert" style={styles.resetFailure}>
      <Text style={styles.resetFailureTitle}>새 분석을 준비하지 못했어요</Text>
      <Text style={styles.bodyText}>잠시 후 다시 시도해 주세요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { gap: 28, width: '100%', maxWidth: 680, alignSelf: 'center' },
  intro: { gap: 7, paddingBottom: 4 },
  eyebrow: { color: colors.positive, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', lineHeight: 32 },
  bodyText: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  section: { gap: 12, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', lineHeight: 26 },
  signalGroup: { gap: 8 },
  groupLabel: { color: colors.muted, fontSize: 13, fontWeight: '800', lineHeight: 19 },
  signalRow: {
    gap: 7,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 2,
    borderLeftWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  signalMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  signalType: { fontSize: 12, fontWeight: '900', lineHeight: 17 },
  confidence: { color: colors.muted, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  signalTitle: { color: colors.text, fontSize: 16, fontWeight: '800', lineHeight: 23 },
  signalDescription: { color: colors.text, fontSize: 14, lineHeight: 21 },
  evidence: { gap: 3, marginTop: 2 },
  evidenceLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  evidenceText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  summaryText: { color: colors.text, fontSize: 16, lineHeight: 25 },
  overallConfidence: { color: colors.muted, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  actionTitle: { color: colors.text, fontSize: 17, fontWeight: '800', lineHeight: 24 },
  messagePanel: {
    gap: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.action,
    borderRadius: radius.panel,
    backgroundColor: colors.actionSurface,
  },
  recommendationTitle: { color: colors.text, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  messageText: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 26 },
  rationale: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  copyButton: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: colors.action,
  },
  copyButtonText: { color: colors.background, fontSize: 14, fontWeight: '800', lineHeight: 20 },
  inlineError: { color: colors.danger, fontSize: 13, fontWeight: '700', lineHeight: 20 },
  noMessage: { gap: 4, paddingVertical: 6 },
  noMessageTitle: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  recommendationRow: { gap: 5, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  warningList: { gap: 8, padding: 12, borderRadius: radius.panel, backgroundColor: colors.surface },
  warningText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  newAnalysisButton: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.text,
    borderRadius: radius.control,
    backgroundColor: colors.background,
  },
  newAnalysisButtonText: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  commandPressed: { opacity: 0.72 },
  commandDisabled: { opacity: 0.48 },
  resetFailure: { gap: 3, padding: 12, borderRadius: radius.panel, backgroundColor: colors.cautionSurface },
  resetFailureTitle: { color: colors.caution, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  emptyContent: { justifyContent: 'center', width: '100%', maxWidth: 560, alignSelf: 'center' },
  emptyState: { gap: 14 },
  emptyTitle: { color: colors.text, fontSize: 23, fontWeight: '800', lineHeight: 31 },
});
