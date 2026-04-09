import type { StoredSignal, StoredRecommendation } from "@/lib/analysis-store";

/**
 * 평가 메트릭 타입 정의.
 *
 * 규칙 기반 vs LLM 하이브리드 결과를 정량적으로 비교.
 */
export type EvaluationMetrics = {
  /** 시그널 키 일치율 (0~1). 양쪽에 동일한 signalKey가 몇 개 겹치는지 */
  signalOverlapRate: number;

  /** 시그널 타입 일치율 (0~1). 같은 키의 시그널이 같은 signalType인지 */
  signalTypeAgreement: number;

  /** 추천 액션 일치 여부 */
  actionMatch: boolean;

  /** 신뢰도 일치 여부 */
  confidenceMatch: boolean;

  /** 규칙 기반 시그널 수 */
  ruleSignalCount: number;

  /** 하이브리드 시그널 수 */
  hybridSignalCount: number;

  /** 하이브리드에서 추가된 시그널 키 목록 */
  addedSignalKeys: string[];

  /** 하이브리드에서 누락된 시그널 키 목록 */
  droppedSignalKeys: string[];

  /** 하이브리드 description 평균 길이 (규칙 대비 개선 지표) */
  avgDescriptionLengthRule: number;
  avgDescriptionLengthHybrid: number;

  /** 추천 메시지 개수 비교 */
  ruleRecommendationCount: number;
  hybridRecommendationCount: number;

  /** 전체 품질 점수 (0~100). 가중 합산 */
  qualityScore: number;
};

type ComparisonInput = {
  ruleSignals: StoredSignal[];
  hybridSignals: StoredSignal[];
  ruleAction: string;
  hybridAction: string;
  ruleConfidence: string;
  hybridConfidence: string;
  ruleRecommendations: StoredRecommendation[];
  hybridRecommendations: StoredRecommendation[];
};

/**
 * 규칙 기반 vs 하이브리드 분석 결과의 메트릭을 계산합니다.
 */
export function calculateMetrics(input: ComparisonInput): EvaluationMetrics {
  const ruleKeys = new Set(input.ruleSignals.map((s) => s.signalKey));
  const hybridKeys = new Set(input.hybridSignals.map((s) => s.signalKey));

  // 시그널 키 교집합
  const intersection = [...ruleKeys].filter((k) => hybridKeys.has(k));
  const union = new Set([...ruleKeys, ...hybridKeys]);

  const signalOverlapRate = union.size > 0 ? intersection.length / union.size : 1;

  // 같은 키의 시그널 타입 일치율
  let typeMatchCount = 0;
  for (const key of intersection) {
    const ruleSignal = input.ruleSignals.find((s) => s.signalKey === key);
    const hybridSignal = input.hybridSignals.find((s) => s.signalKey === key);
    if (ruleSignal && hybridSignal && ruleSignal.signalType === hybridSignal.signalType) {
      typeMatchCount++;
    }
  }
  const signalTypeAgreement = intersection.length > 0 ? typeMatchCount / intersection.length : 1;

  const actionMatch = input.ruleAction === input.hybridAction;
  const confidenceMatch = input.ruleConfidence === input.hybridConfidence;

  const addedSignalKeys = [...hybridKeys].filter((k) => !ruleKeys.has(k));
  const droppedSignalKeys = [...ruleKeys].filter((k) => !hybridKeys.has(k));

  // description 평균 길이
  const avgLen = (signals: StoredSignal[]) =>
    signals.length > 0
      ? signals.reduce((sum, s) => sum + s.description.length, 0) / signals.length
      : 0;

  const avgDescriptionLengthRule = Math.round(avgLen(input.ruleSignals));
  const avgDescriptionLengthHybrid = Math.round(avgLen(input.hybridSignals));

  // 품질 점수 계산 (가중 합산)
  // - 시그널 일치 (30점): 규칙 엔진과 LLM이 같은 시그널을 보는지
  // - 타입 일치 (20점): 같은 시그널을 같은 타입으로 분류하는지
  // - 액션 일치 (20점): 추천 액션이 같은지
  // - 설명 개선 (15점): 하이브리드 description이 규칙보다 풍부한지
  // - 추천 품질 (15점): 추천 3개가 모두 생성되었는지
  const descriptionImprovement =
    avgDescriptionLengthRule > 0
      ? Math.min(avgDescriptionLengthHybrid / avgDescriptionLengthRule, 3) / 3
      : avgDescriptionLengthHybrid > 0
        ? 1
        : 0;

  const recommendationCompleteness =
    input.hybridRecommendations.length >= 3 ? 1 : input.hybridRecommendations.length / 3;

  const qualityScore = Math.round(
    signalOverlapRate * 30 +
      signalTypeAgreement * 20 +
      (actionMatch ? 20 : 0) +
      descriptionImprovement * 15 +
      recommendationCompleteness * 15,
  );

  return {
    signalOverlapRate: Math.round(signalOverlapRate * 1000) / 1000,
    signalTypeAgreement: Math.round(signalTypeAgreement * 1000) / 1000,
    actionMatch,
    confidenceMatch,
    ruleSignalCount: input.ruleSignals.length,
    hybridSignalCount: input.hybridSignals.length,
    addedSignalKeys,
    droppedSignalKeys,
    avgDescriptionLengthRule,
    avgDescriptionLengthHybrid,
    ruleRecommendationCount: input.ruleRecommendations.length,
    hybridRecommendationCount: input.hybridRecommendations.length,
    qualityScore,
  };
}

/**
 * 평가 결과를 콘솔에 읽기 좋게 출력합니다.
 */
export function formatMetricsLog(metrics: EvaluationMetrics): string {
  return [
    `[evaluation] Quality Score: ${metrics.qualityScore}/100`,
    `  Signal overlap: ${(metrics.signalOverlapRate * 100).toFixed(1)}% (rule: ${metrics.ruleSignalCount}, hybrid: ${metrics.hybridSignalCount})`,
    `  Signal type agreement: ${(metrics.signalTypeAgreement * 100).toFixed(1)}%`,
    `  Action match: ${metrics.actionMatch ? "YES" : "NO"}`,
    `  Confidence match: ${metrics.confidenceMatch ? "YES" : "NO"}`,
    `  Avg description length: rule=${metrics.avgDescriptionLengthRule}, hybrid=${metrics.avgDescriptionLengthHybrid}`,
    `  Added signals: ${metrics.addedSignalKeys.length > 0 ? metrics.addedSignalKeys.join(", ") : "none"}`,
    `  Dropped signals: ${metrics.droppedSignalKeys.length > 0 ? metrics.droppedSignalKeys.join(", ") : "none"}`,
    `  Recommendations: rule=${metrics.ruleRecommendationCount}, hybrid=${metrics.hybridRecommendationCount}`,
  ].join("\n");
}
