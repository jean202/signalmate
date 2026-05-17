import {
  RetryableLLMResponseError,
  buildInferenceOptions,
  callWithRetry,
  extractToolInput,
  getAnthropicClient,
  getInferenceTimeoutMs,
  getModelName,
  resolveMaxTokens,
  withEphemeralCacheOnLastMessage,
} from "@/lib/ai/anthropic-client";
import {
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationUserPrompt,
} from "@/lib/ai/prompts/system-prompt";
import { RECOMMENDATION_FEW_SHOT } from "@/lib/ai/prompts/few-shot-examples";
import { submitRecommendationsTool } from "@/lib/ai/schemas/analysis-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import { createLogger } from "@/lib/logger";
import type { RecommendationType, StoredSignal } from "@/lib/analysis-store";

type RecommendationResult = {
  recommendedActionReason: string;
  recommendations: {
    recommendationType: string;
    title: string;
    content: string;
    rationale: string;
    toneLabel: string;
  }[];
};

const logger = createLogger("ai.recommendation_generator");

export async function generateRecommendations(params: {
  analysisId?: string;
  rawText: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext?: string | null;
  recommendedAction: string;
  recommendedActionReason: string;
  overallSummary: string;
  signals: StoredSignal[];
}): Promise<RecommendationResult> {
  const client = getAnthropicClient();
  const model = getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("recommendation_generator");
  let retryCount = 0;

  const userPrompt = buildRecommendationUserPrompt({
    rawText: params.rawText,
    relationshipStage: params.relationshipStage,
    meetingChannel: params.meetingChannel,
    userGoal: params.userGoal,
    situationContext: params.situationContext,
    recommendedAction: params.recommendedAction,
    recommendedActionReason: params.recommendedActionReason,
    overallSummary: params.overallSummary,
    signals: params.signals.map((s) => ({
      signalType: s.signalType,
      signalKey: s.signalKey,
      title: s.title,
    })),
  });

  const fewShotMessages = withEphemeralCacheOnLastMessage(RECOMMENDATION_FEW_SHOT);

  try {
    const { response, result } = await callWithRetry(
      async (requestOptions) => {
        const response = await client.messages.create(
          {
            ...buildInferenceOptions(model, "recommendation_generator"),
            model,
            max_tokens: resolveMaxTokens(3000, "recommendation_generator", model),
            system: [
              {
                type: "text",
                text: RECOMMENDATION_SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: [
              {
                ...submitRecommendationsTool,
                cache_control: { type: "ephemeral" },
              },
            ],
            tool_choice: { type: "tool", name: "submit_recommendations" },
            messages: [
              ...fewShotMessages,
              { role: "user", content: userPrompt },
            ],
          },
          requestOptions,
        );

        const input = extractToolInput<unknown>(
          response,
          "submit_recommendations",
          "recommendation generation",
        );
        return {
          response,
          result: validateRecommendationResult(input),
        };
      },
      {
        label: "recommendation_generator",
        extraRetries: 1,
        timeoutMs,
        onRetry: (info) => {
          retryCount = info.retryCount;
        },
      },
    );

    const durationMs = Date.now() - startTime;

    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "recommendation_generator",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs,
      retryCount,
      timeoutMs,
      success: true,
    });

    const cacheRead = response.usage.cache_read_input_tokens ?? 0;
    const cacheCreate = response.usage.cache_creation_input_tokens ?? 0;
    if (cacheRead > 0 || cacheCreate > 0) {
      logger.debug("prompt_cache_usage", {
        analysisId: params.analysisId,
        cacheReadInputTokens: cacheRead,
        cacheCreationInputTokens: cacheCreate,
        freshInputTokens: response.usage.input_tokens,
      });
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "recommendation_generator",
      inputTokens: 0,
      outputTokens: 0,
      durationMs,
      retryCount,
      timeoutMs,
      success: false,
      errorMessage,
    }).catch(() => {});

    throw error;
  }
}

const REQUIRED_RECOMMENDATION_TYPES: RecommendationType[] = [
  "next_message",
  "tone_guide",
  "avoid_phrase",
];

function validateRecommendationResult(input: unknown): RecommendationResult {
  const root = requireRecord(input, "recommendation result");
  const recommendedActionReason = requireString(
    root,
    "recommendedActionReason",
    "recommendation result",
  );
  const recommendations = root.recommendations;

  if (!Array.isArray(recommendations)) {
    throw new RetryableLLMResponseError(
      `Recommendation generator returned malformed response: recommendations=${typeof recommendations}`,
    );
  }

  if (recommendations.length !== REQUIRED_RECOMMENDATION_TYPES.length) {
    throw new RetryableLLMResponseError(
      `Recommendation generator returned ${recommendations.length} recommendations, expected ${REQUIRED_RECOMMENDATION_TYPES.length}`,
    );
  }

  const byType = new Map<RecommendationType, RecommendationResult["recommendations"][number]>();

  recommendations.forEach((recommendation, index) => {
    const record = requireRecord(recommendation, `recommendations[${index}]`);
    const recommendationType = requireRecommendationType(
      requireString(record, "recommendationType", `recommendations[${index}]`),
      index,
    );

    if (byType.has(recommendationType)) {
      throw new RetryableLLMResponseError(
        `Recommendation generator returned duplicate type: ${recommendationType}`,
      );
    }

    byType.set(recommendationType, {
      recommendationType,
      title: requireString(record, "title", `recommendations[${index}]`),
      content: requireString(record, "content", `recommendations[${index}]`),
      rationale: requireString(record, "rationale", `recommendations[${index}]`),
      toneLabel: requireString(record, "toneLabel", `recommendations[${index}]`),
    });
  });

  const orderedRecommendations = REQUIRED_RECOMMENDATION_TYPES.map((type) => {
    const recommendation = byType.get(type);
    if (!recommendation) {
      throw new RetryableLLMResponseError(
        `Recommendation generator omitted recommendation type: ${type}`,
      );
    }
    return recommendation;
  });

  return {
    recommendedActionReason,
    recommendations: orderedRecommendations,
  };
}

function requireRecommendationType(value: string, index: number): RecommendationType {
  if (REQUIRED_RECOMMENDATION_TYPES.includes(value as RecommendationType)) {
    return value as RecommendationType;
  }

  throw new RetryableLLMResponseError(
    `recommendations[${index}].recommendationType is invalid: ${value}`,
  );
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RetryableLLMResponseError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RetryableLLMResponseError(`${label}.${key} must be a non-empty string`);
  }
  return value.trim();
}
