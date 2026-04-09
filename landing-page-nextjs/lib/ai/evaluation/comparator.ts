import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import { runAnalysis } from "@/lib/ai/analysis-engine";
import {
  calculateMetrics,
  formatMetricsLog,
  type EvaluationMetrics,
} from "@/lib/ai/evaluation/metrics";
import type { StoredConversation, StoredAnalysis } from "@/lib/analysis-store";

/**
 * 평가 비교 결과 타입.
 *
 * analysisMeta.evaluation에 저장됩니다.
 */
export type EvaluationResult = {
  /** 비교 실행 시각 */
  evaluatedAt: string;

  /** 규칙 기반 분석 요약 */
  ruleBasedSummary: {
    modelName: string;
    recommendedAction: string;
    confidenceLevel: string;
    signalCount: number;
    signalKeys: string[];
    overallSummary: string;
  };

  /** 하이브리드 분석 요약 */
  hybridSummary: {
    modelName: string;
    recommendedAction: string;
    confidenceLevel: string;
    signalCount: number;
    signalKeys: string[];
    overallSummary: string;
  };

  /** 정량적 비교 메트릭 */
  metrics: EvaluationMetrics;
};

/**
 * 동일 대화에 대해 규칙 기반 + 하이브리드를 모두 실행하고 비교합니다.
 *
 * 반환값은 하이브리드 분석 결과 + analysisMeta에 평가 데이터가 포함됩니다.
 */
export async function runEvaluation(
  conversation: StoredConversation,
  options?: { analysisVersion?: string },
): Promise<{
  analysis: Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">;
  evaluation: EvaluationResult;
}> {
  const startTime = Date.now();

  // 1) 규칙 기반 분석 실행
  const ruleResult = buildRuleBasedAnalysis(conversation, {
    ...options,
    modelName: "rule-based-dev",
  });

  // 2) 하이브리드 분석 실행 (내부에서 규칙 + Claude 체이닝)
  const hybridResult = await runAnalysis(conversation, {
    ...options,
    modelName: "hybrid-v1",
  });

  // 3) 메트릭 계산
  const metrics = calculateMetrics({
    ruleSignals: ruleResult.signals,
    hybridSignals: hybridResult.signals,
    ruleAction: ruleResult.recommendedAction,
    hybridAction: hybridResult.recommendedAction,
    ruleConfidence: ruleResult.confidenceLevel,
    hybridConfidence: hybridResult.confidenceLevel,
    ruleRecommendations: ruleResult.recommendations,
    hybridRecommendations: hybridResult.recommendations,
  });

  const evaluation: EvaluationResult = {
    evaluatedAt: new Date().toISOString(),
    ruleBasedSummary: {
      modelName: ruleResult.modelName,
      recommendedAction: ruleResult.recommendedAction,
      confidenceLevel: ruleResult.confidenceLevel,
      signalCount: ruleResult.signals.length,
      signalKeys: ruleResult.signals.map((s) => s.signalKey),
      overallSummary: ruleResult.overallSummary,
    },
    hybridSummary: {
      modelName: hybridResult.modelName,
      recommendedAction: hybridResult.recommendedAction,
      confidenceLevel: hybridResult.confidenceLevel,
      signalCount: hybridResult.signals.length,
      signalKeys: hybridResult.signals.map((s) => s.signalKey),
      overallSummary: hybridResult.overallSummary,
    },
    metrics,
  };

  // 4) 콘솔 로그 출력
  const durationMs = Date.now() - startTime;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[evaluation] Completed in ${durationMs}ms`);
  console.log(formatMetricsLog(metrics));
  console.log(`${"=".repeat(60)}\n`);

  // 5) 하이브리드 결과에 평가 메타데이터 추가
  const analysisWithEval: Omit<StoredAnalysis, "id" | "createdAt" | "completedAt"> = {
    ...hybridResult,
    modelName: `${hybridResult.modelName} (eval)`,
  };

  return { analysis: analysisWithEval, evaluation };
}
