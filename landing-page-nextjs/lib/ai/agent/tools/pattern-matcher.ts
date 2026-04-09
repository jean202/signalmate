import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import type { StoredConversation } from "@/lib/analysis-store";

/**
 * 규칙 엔진 시그널 매칭 도구.
 *
 * 기존 buildRuleBasedAnalysis를 래핑하여 에이전트가 호출할 수 있게 합니다.
 */
export type PatternMatchResult = {
  signals: {
    signalType: string;
    signalKey: string;
    title: string;
    description: string;
    confidenceLevel: string;
  }[];
  recommendedAction: string;
  recommendedActionReason: string;
  confidenceLevel: string;
  summary: string;
};

export function matchPatterns(conversation: StoredConversation): PatternMatchResult {
  const result = buildRuleBasedAnalysis(conversation);

  return {
    signals: result.signals.map((s) => ({
      signalType: s.signalType,
      signalKey: s.signalKey,
      title: s.title,
      description: s.description,
      confidenceLevel: s.confidenceLevel,
    })),
    recommendedAction: result.recommendedAction,
    recommendedActionReason: result.recommendedActionReason,
    confidenceLevel: result.confidenceLevel,
    summary: `${result.signals.length}개 시그널 감지 (긍정: ${result.positiveSignalCount}, 모호: ${result.ambiguousSignalCount}, 주의: ${result.cautionSignalCount}). 추천 액션: ${result.recommendedAction}`,
  };
}
