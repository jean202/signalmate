import { randomUUID } from "node:crypto";
import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import { isAnthropicAvailable } from "@/lib/ai/anthropic-client";
import { enhanceSignals } from "@/lib/ai/chains/signal-enhancer";
import { generateRecommendations } from "@/lib/ai/chains/recommendation-generator";
import { trackUsage } from "@/lib/ai/token-tracker";
import { runAgentAnalysis } from "@/lib/ai/agent/analysis-agent";
import {
  findSimilarConversations,
  buildQueryText,
} from "@/lib/ai/embeddings/similarity-search";
import { buildInsight, formatInsightForPrompt } from "@/lib/ai/embeddings/insight-builder";
import { isOpenAIAvailable } from "@/lib/ai/embeddings/openai-client";
import type {
  StoredAnalysis,
  StoredConversation,
  StoredSignal,
  StoredRecommendation,
} from "@/lib/analysis-store";

type AnalysisOptions = {
  analysisVersion?: string;
  modelName?: string;
};

/**
 * 분석 엔진 라우터.
 *
 * modelName에 따라 분기:
 * - "rule-based-dev" → 규칙 기반만
 * - "hybrid-v1" (또는 기본값) → 규칙 기반 + Claude 강화 + RAG (Phase 3)
 * - "agent-v1" → 멀티스텝 에이전트 (Phase 4)
 *
 * Claude API 키가 없거나 호출 실패 시 → 규칙 기반 결과로 fallback
 */
export async function runAnalysis(
  conversation: StoredConversation,
  options?: AnalysisOptions,
): Promise<Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">> {
  const modelName = options?.modelName?.trim() || "hybrid-v1";

  // 명시적으로 규칙 기반만 요청한 경우
  if (modelName === "rule-based-dev") {
    return buildRuleBasedAnalysis(conversation, options);
  }

  // API 키가 없으면 규칙 기반으로 fallback
  if (!isAnthropicAvailable()) {
    const keyVal = process.env.ANTHROPIC_API_KEY;
    console.warn(`[analysis-engine] ANTHROPIC_API_KEY not set — falling back to rule-based (type=${typeof keyVal}, len=${keyVal?.length ?? 0})`);
    return buildRuleBasedAnalysis(conversation, {
      ...options,
      modelName: "rule-based-dev (fallback: no api key)",
    });
  }

  // 에이전트 모드 (Phase 4)
  if (modelName === "agent-v1") {
    try {
      return await runAgentAnalysis(conversation);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[analysis-engine] Agent failed, falling back to hybrid:", errorMessage);
      // 에이전트 실패 시 hybrid로 fallback (아래 로직 계속 실행)
    }
  }

  // 1단계: 규칙 기반 분석 실행
  const ruleResult = buildRuleBasedAnalysis(conversation, options);

  try {
    // 1.5단계 (Phase 3): RAG — 유사 대화 패턴 검색
    let similarPatternContext: string | undefined;

    if (isOpenAIAvailable()) {
      try {
        const selfCount = conversation.messages.filter((m) => m.senderRole === "self").length;
        const otherCount = conversation.messages.filter((m) => m.senderRole === "other").length;

        const queryText = buildQueryText({
          relationshipStage: conversation.relationshipStage,
          meetingChannel: conversation.meetingChannel,
          userGoal: conversation.userGoal,
          messageCount: conversation.messages.length,
          selfCount,
          otherCount,
          positiveSignalCount: ruleResult.positiveSignalCount,
          ambiguousSignalCount: ruleResult.ambiguousSignalCount,
          cautionSignalCount: ruleResult.cautionSignalCount,
          signalTitles: ruleResult.signals.map((s) => s.title),
          overallSummary: ruleResult.overallSummary,
        });

        const similarConversations = await findSimilarConversations(
          queryText,
          5,
          conversation.id,
        );

        const insight = buildInsight(similarConversations);
        if (insight) {
          similarPatternContext = formatInsightForPrompt(insight);
          console.log(
            `[analysis-engine] RAG: found ${insight.totalFound} similar conversations (positive: ${insight.outcomeStats.positive_progress}, neutral: ${insight.outcomeStats.neutral}, negative: ${insight.outcomeStats.negative})`,
          );
        }
      } catch (ragError) {
        console.warn("[analysis-engine] RAG search failed, continuing without:", ragError);
      }
    }

    // 2단계: Claude로 시그널 설명 강화
    const enhancedSignals = await enhanceSignals({
      rawText: conversation.rawText,
      relationshipStage: conversation.relationshipStage,
      meetingChannel: conversation.meetingChannel,
      userGoal: conversation.userGoal,
      situationContext: conversation.situationContext,
      signals: ruleResult.signals,
      similarPatternContext,
    });

    // 강화된 시그널을 규칙 결과와 병합
    const mergedSignals: StoredSignal[] = ruleResult.signals.map((original, index) => {
      const enhanced = enhancedSignals.signals[index];
      if (!enhanced || enhanced.signalKey !== original.signalKey) {
        return original; // 매칭 실패 시 원본 유지
      }
      return {
        ...original,
        title: enhanced.title || original.title,
        description: enhanced.description || original.description,
        evidenceText: enhanced.evidenceText || original.evidenceText,
        // signalType, signalKey, confidenceLevel은 원본 유지
      };
    });

    // 3단계: Claude로 추천 메시지 생성
    const llmRecommendations = await generateRecommendations({
      rawText: conversation.rawText,
      relationshipStage: conversation.relationshipStage,
      meetingChannel: conversation.meetingChannel,
      userGoal: conversation.userGoal,
      situationContext: conversation.situationContext,
      recommendedAction: ruleResult.recommendedAction,
      recommendedActionReason: ruleResult.recommendedActionReason,
      overallSummary: enhancedSignals.overallSummary || ruleResult.overallSummary,
      signals: mergedSignals,
    });

    // 추천 결과를 StoredRecommendation 형태로 변환
    const mergedRecommendations: StoredRecommendation[] =
      llmRecommendations.recommendations.map((rec, index) => ({
        id: randomUUID(),
        recommendationType: rec.recommendationType as StoredRecommendation["recommendationType"],
        title: rec.title,
        content: rec.content,
        rationale: rec.rationale,
        toneLabel: rec.toneLabel || null,
        displayOrder: index + 1,
      }));

    return {
      ...ruleResult,
      modelName: similarPatternContext ? "hybrid-v1+rag" : "hybrid-v1",
      overallSummary: enhancedSignals.overallSummary || ruleResult.overallSummary,
      signals: mergedSignals,
      recommendedActionReason:
        llmRecommendations.recommendedActionReason || ruleResult.recommendedActionReason,
      recommendations:
        mergedRecommendations.length >= 3 ? mergedRecommendations : ruleResult.recommendations,
    };
  } catch (error) {
    // LLM 실패 시 규칙 기반 결과로 fallback
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[analysis-engine] LLM chain failed, falling back to rule-based:", errorMessage);

    await trackUsage({
      modelName: "hybrid-v1",
      chainStep: "fallback",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      success: false,
      errorMessage,
    }).catch(() => {});

    return {
      ...ruleResult,
      modelName: `rule-based-dev (fallback: ${errorMessage.slice(0, 100)})`,
    };
  }
}
