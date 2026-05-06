import { runAgentOrHybridAnalysis } from "@/lib/ai/hybrid-analysis-runner";
import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import type { StoredAnalysis, StoredConversation } from "@/lib/analysis-store";

type AnalysisOptions = {
  analysisVersion?: string;
  modelName?: string;
};

/**
 * 분석 엔진 라우터.
 *
 * modelName에 따라 분기:
 * - "rule-based-dev" -> 규칙 기반만
 * - "hybrid-v1" (또는 기본값) -> 규칙 기반 + Claude 강화 + RAG
 * - "agent-v1" -> 멀티스텝 에이전트, 실패 시 hybrid fallback
 */
export async function runAnalysis(
  conversation: StoredConversation,
  options?: AnalysisOptions,
): Promise<Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">> {
  const modelName = options?.modelName?.trim() || "hybrid-v1";

  if (modelName === "rule-based-dev") {
    return buildRuleBasedAnalysis(conversation, options);
  }

  return runAgentOrHybridAnalysis(conversation, options);
}
