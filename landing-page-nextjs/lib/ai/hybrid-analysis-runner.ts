import { randomUUID } from "node:crypto";
import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import { isAnthropicAvailable } from "@/lib/ai/anthropic-client";
import { runAgentAnalysis } from "@/lib/ai/agent/analysis-agent";
import { checkQuality } from "@/lib/ai/agent/tools/quality-checker";
import { generateRecommendations } from "@/lib/ai/chains/recommendation-generator";
import { enhanceSignals } from "@/lib/ai/chains/signal-enhancer";
import {
  buildQueryText,
  findSimilarConversations,
} from "@/lib/ai/embeddings/similarity-search";
import { buildInsight, formatInsightForPrompt } from "@/lib/ai/embeddings/insight-builder";
import { isOpenAIAvailable } from "@/lib/ai/embeddings/openai-client";
import { trackUsage } from "@/lib/ai/token-tracker";
import { createLogger } from "@/lib/logger";
import type {
  StoredAnalysis,
  StoredConversation,
  StoredRecommendation,
  StoredSignal,
} from "@/lib/analysis-store";

export type HybridFallbackStage =
  | "no_anthropic_api_key"
  | "agent"
  | "signal_enhancer"
  | "signal_quality_gate"
  | "recommendation_generator"
  | "quality_gate"
  | "all_llm_stages"
  | "hybrid_pipeline";

const logger = createLogger("ai.hybrid_runner");

type AnalysisBuildOptions = {
  analysisVersion?: string;
  modelName?: string;
};

type StageWarning = {
  stage: HybridFallbackStage;
  errorMessage: string;
};

type HybridRunnerCallbacks = {
  onRuleComplete?: (
    analysis: Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">,
  ) => void | Promise<void>;
  onSignalsReady?: (payload: {
    signals: StoredSignal[];
    overallSummary: string;
  }) => void | Promise<void>;
  onRecommendationsReady?: (payload: {
    recommendations: StoredRecommendation[];
    recommendedActionReason: string;
  }) => void | Promise<void>;
  onStageWarning?: (warning: StageWarning) => void | Promise<void>;
};

type HybridRunnerOptions = AnalysisBuildOptions & {
  noApiKeyModelName?: string;
  callbacks?: HybridRunnerCallbacks;
};

export type HybridAnalysisResult = {
  analysis: Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">;
  ruleResult: Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">;
  signalEnhanced: boolean;
  recommendationEnhanced: boolean;
  hasRag: boolean;
};

export async function runAgentOrHybridAnalysis(
  conversation: StoredConversation,
  options?: AnalysisBuildOptions,
): Promise<Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">> {
  const modelName = options?.modelName?.trim() || "hybrid-v1";

  if (modelName === "agent-v1") {
    try {
      return await runAgentAnalysis(conversation);
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      logger.error("agent_failed_fallback_to_hybrid", {
        conversationId: conversation.id,
        modelName,
        errorMessage,
      });
      await trackFallback("agent", errorMessage, true, "agent-v1");
    }
  }

  const result = await runHybridAnalysis(conversation, {
    ...options,
    noApiKeyModelName: "rule-based-dev (fallback: no api key)",
  });
  return result.analysis;
}

export async function runHybridAnalysis(
  conversation: StoredConversation,
  options?: HybridRunnerOptions,
): Promise<HybridAnalysisResult> {
  const ruleResult = buildRuleBasedAnalysis(conversation, options);
  await options?.callbacks?.onRuleComplete?.(ruleResult);

  if (!isAnthropicAvailable()) {
    logger.warn("anthropic_unavailable_fallback_to_rule_based", {
      conversationId: conversation.id,
      fallbackStage: "no_anthropic_api_key",
    });
    await trackUsage({
      modelName: "rule-based-dev",
      chainStep: "fallback",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      success: true,
      fallbackStage: "no_anthropic_api_key",
    }).catch(() => {});

    return {
      analysis: {
        ...ruleResult,
        modelName: options?.noApiKeyModelName ?? "rule-based-dev (fallback: no api key)",
      },
      ruleResult,
      signalEnhanced: false,
      recommendationEnhanced: false,
      hasRag: false,
    };
  }

  try {
    const similarPatternContext = await buildSimilarPatternContext(conversation, ruleResult);
    const llmStageErrors: string[] = [];
    let signalEnhanced = false;
    let recommendationEnhanced = false;
    let enhancedSummary = ruleResult.overallSummary;
    let mergedSignals: StoredSignal[] = ruleResult.signals;
    let finalRecommendations: StoredRecommendation[] = ruleResult.recommendations;
    let finalActionReason = ruleResult.recommendedActionReason;
    let calibratedConfidence: StoredAnalysis["confidenceLevel"] = ruleResult.confidenceLevel;

    try {
      const enhancedSignals = await enhanceSignals({
        rawText: conversation.rawText,
        relationshipStage: conversation.relationshipStage,
        meetingChannel: conversation.meetingChannel,
        userGoal: conversation.userGoal,
        situationContext: conversation.situationContext,
        signals: ruleResult.signals,
        similarPatternContext,
      });

      const candidateSignals = ruleResult.signals.map((original, index) => {
        const enhanced = enhancedSignals.signals[index];
        if (!enhanced || enhanced.signalKey !== original.signalKey) {
          return original;
        }
        return {
          ...original,
          title: enhanced.title || original.title,
          description: enhanced.description || original.description,
          evidenceText: enhanced.evidenceText || original.evidenceText,
        };
      });
      const candidateSummary = enhancedSignals.overallSummary || ruleResult.overallSummary;

      const signalQuality = checkQuality({
        signals: candidateSignals,
        recommendations: ruleResult.recommendations,
        overallSummary: candidateSummary,
        recommendedAction: ruleResult.recommendedAction,
        rawText: conversation.rawText,
        situationContext: conversation.situationContext,
        relationshipStage: conversation.relationshipStage,
      });

      if (!signalQuality.passed) {
        await trackUsage({
          modelName: "hybrid-v1",
          chainStep: "quality_gate",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          success: false,
          errorMessage: signalQuality.summary,
          fallbackStage: "signal_quality_gate",
          qualityWarnings: signalQuality.warnings,
        }).catch(() => {});
        throw new Error(`signal quality check failed: ${signalQuality.summary}`);
      }

      if (signalQuality.warnings.length > 0) {
        await trackUsage({
          modelName: "hybrid-v1",
          chainStep: "quality_gate",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          success: true,
          qualityWarnings: signalQuality.warnings,
        }).catch(() => {});
      }

      calibratedConfidence = applyConfidenceCalibration(
        calibratedConfidence,
        signalQuality.recommendedConfidence,
        "signal_quality_gate",
      );

      mergedSignals = candidateSignals;
      enhancedSummary = candidateSummary;
      signalEnhanced = true;
    } catch (signalError) {
      const errorMessage = getErrorMessage(signalError);
      llmStageErrors.push(`signal_enhancer: ${errorMessage}`);
      logger.warn("signal_enhancer_failed", {
        conversationId: conversation.id,
        fallbackStage: "signal_enhancer",
        errorMessage,
      });
      await trackFallback("signal_enhancer", errorMessage, true);
      await options?.callbacks?.onStageWarning?.({
        stage: "signal_enhancer",
        errorMessage,
      });
    }

    await options?.callbacks?.onSignalsReady?.({
      signals: mergedSignals,
      overallSummary: enhancedSummary,
    });

    try {
      const llmRecommendations = await generateRecommendations({
        rawText: conversation.rawText,
        relationshipStage: conversation.relationshipStage,
        meetingChannel: conversation.meetingChannel,
        userGoal: conversation.userGoal,
        situationContext: conversation.situationContext,
        recommendedAction: ruleResult.recommendedAction,
        recommendedActionReason: ruleResult.recommendedActionReason,
        overallSummary: enhancedSummary,
        signals: mergedSignals,
      });

      const candidateRecommendations: StoredRecommendation[] =
        llmRecommendations.recommendations.map((rec, index) => ({
          id: randomUUID(),
          recommendationType: rec.recommendationType as StoredRecommendation["recommendationType"],
          title: rec.title,
          content: rec.content,
          rationale: rec.rationale,
          toneLabel: rec.toneLabel || null,
          displayOrder: index + 1,
        }));

      const quality = checkQuality({
        signals: mergedSignals,
        recommendations: candidateRecommendations,
        overallSummary: enhancedSummary,
        recommendedAction: ruleResult.recommendedAction,
        rawText: conversation.rawText,
        situationContext: conversation.situationContext,
        relationshipStage: conversation.relationshipStage,
      });

      if (!quality.passed) {
        await trackUsage({
          modelName: "hybrid-v1",
          chainStep: "quality_gate",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          success: false,
          errorMessage: quality.summary,
          fallbackStage: "quality_gate",
          qualityWarnings: quality.warnings,
        }).catch(() => {});
        throw new Error(`quality check failed: ${quality.summary}`);
      }

      if (quality.warnings.length > 0) {
        logger.warn("recommendation_quality_warnings", {
          conversationId: conversation.id,
          warnings: quality.warnings,
        });
        await trackUsage({
          modelName: "hybrid-v1",
          chainStep: "quality_gate",
          inputTokens: 0,
          outputTokens: 0,
          durationMs: 0,
          success: true,
          qualityWarnings: quality.warnings,
        }).catch(() => {});
      }

      calibratedConfidence = applyConfidenceCalibration(
        calibratedConfidence,
        quality.recommendedConfidence,
        "quality_gate",
      );

      finalRecommendations = candidateRecommendations;
      finalActionReason =
        llmRecommendations.recommendedActionReason || ruleResult.recommendedActionReason;
      recommendationEnhanced = true;
    } catch (recommendationError) {
      const errorMessage = getErrorMessage(recommendationError);
      llmStageErrors.push(`recommendation_generator: ${errorMessage}`);
      logger.warn("recommendation_generator_failed", {
        conversationId: conversation.id,
        fallbackStage: "recommendation_generator",
        errorMessage,
      });
      await trackFallback("recommendation_generator", errorMessage, true);
      await options?.callbacks?.onStageWarning?.({
        stage: "recommendation_generator",
        errorMessage,
      });
    }

    await options?.callbacks?.onRecommendationsReady?.({
      recommendations: finalRecommendations,
      recommendedActionReason: finalActionReason,
    });

    if (!signalEnhanced && !recommendationEnhanced) {
      const errorMessage = llmStageErrors.join(" | ") || "no llm stage completed";
      await trackFallback("all_llm_stages", errorMessage, false);

      return {
        analysis: {
          ...ruleResult,
          modelName: "rule-based-dev (fallback: llm)",
        },
        ruleResult,
        signalEnhanced,
        recommendationEnhanced,
        hasRag: !!similarPatternContext,
      };
    }

    return {
      analysis: {
        ...ruleResult,
        modelName: buildHybridModelName({
          hasRag: !!similarPatternContext,
          signalEnhanced,
          recommendationEnhanced,
        }),
        overallSummary: enhancedSummary,
        signals: mergedSignals,
        confidenceLevel: calibratedConfidence,
        recommendedActionReason: finalActionReason,
        recommendations: finalRecommendations,
      },
      ruleResult,
      signalEnhanced,
      recommendationEnhanced,
      hasRag: !!similarPatternContext,
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logger.error("hybrid_pipeline_failed", {
      conversationId: conversation.id,
      fallbackStage: "hybrid_pipeline",
      errorMessage,
    });
    await trackFallback("hybrid_pipeline", errorMessage, false);

    return {
      analysis: {
        ...ruleResult,
        modelName: "rule-based-dev (fallback: llm)",
      },
      ruleResult,
      signalEnhanced: false,
      recommendationEnhanced: false,
      hasRag: false,
    };
  }
}

async function buildSimilarPatternContext(
  conversation: StoredConversation,
  ruleResult: Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">,
): Promise<string | undefined> {
  if (!isOpenAIAvailable()) return undefined;

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

    const similarConversations = await findSimilarConversations(queryText, 5, conversation.id);
    const insight = buildInsight(similarConversations);
    if (!insight) return undefined;

    logger.info("rag_context_found", {
      conversationId: conversation.id,
      similarConversationCount: insight.totalFound,
      outcomeStats: insight.outcomeStats,
    });
    return formatInsightForPrompt(insight);
  } catch (error) {
    logger.warn("rag_search_failed", {
      conversationId: conversation.id,
      error,
    });
    return undefined;
  }
}

async function trackFallback(
  fallbackStage: HybridFallbackStage,
  errorMessage: string,
  success: boolean,
  modelName = "hybrid-v1",
): Promise<void> {
  await trackUsage({
    modelName,
    chainStep: "fallback",
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    success,
    errorMessage,
    fallbackStage,
  }).catch(() => {});
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Quality checker가 신뢰도 다운그레이드를 권고하면 적용합니다.
 * 절대 confidence를 올리지 않으며, 가장 보수적인 값(low가 우선)으로 갑니다.
 */
function applyConfidenceCalibration(
  current: StoredAnalysis["confidenceLevel"],
  recommended: "low" | null,
  source: string,
): StoredAnalysis["confidenceLevel"] {
  if (recommended !== "low") return current;
  if (current === "low") return current;

  logger.warn("confidence_calibrated_down", {
    from: current,
    to: "low",
    source,
  });
  return "low";
}

function buildHybridModelName(params: {
  hasRag: boolean;
  signalEnhanced: boolean;
  recommendationEnhanced: boolean;
}): string {
  const base = params.hasRag ? "hybrid-v1+rag" : "hybrid-v1";

  if (params.signalEnhanced && params.recommendationEnhanced) {
    return base;
  }

  const completedStages = [
    params.signalEnhanced ? "signals" : null,
    params.recommendationEnhanced ? "recommendations" : null,
  ].filter(Boolean);

  return `${base} (partial: ${completedStages.join("+")})`;
}
