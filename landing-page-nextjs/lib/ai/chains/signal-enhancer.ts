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
  SIGNAL_ENHANCER_SYSTEM_PROMPT,
  buildSignalEnhancerUserPrompt,
} from "@/lib/ai/prompts/system-prompt";
import { SIGNAL_ENHANCER_FEW_SHOT } from "@/lib/ai/prompts/few-shot-examples";
import { submitEnhancedSignalsTool } from "@/lib/ai/schemas/analysis-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import type { StoredSignal } from "@/lib/analysis-store";

type EnhancedSignalResult = {
  overallSummary: string;
  signals: {
    signalType: string;
    signalKey: string;
    title: string;
    description: string;
    evidenceText: string;
    confidenceLevel: string;
  }[];
};

export async function enhanceSignals(params: {
  analysisId?: string;
  rawText: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext?: string | null;
  signals: StoredSignal[];
  /** RAG 컨텍스트: 유사 대화 패턴 인사이트 (Phase 3) */
  similarPatternContext?: string;
}): Promise<EnhancedSignalResult> {
  const client = getAnthropicClient();
  const model = getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("signal_enhancer");
  let retryCount = 0;

  let userPrompt = buildSignalEnhancerUserPrompt({
    rawText: params.rawText,
    relationshipStage: params.relationshipStage,
    meetingChannel: params.meetingChannel,
    userGoal: params.userGoal,
    situationContext: params.situationContext,
    signals: params.signals.map((s) => ({
      signalType: s.signalType,
      signalKey: s.signalKey,
      title: s.title,
      description: s.description,
      evidenceText: s.evidenceText,
      confidenceLevel: s.confidenceLevel,
    })),
  });

  // RAG 컨텍스트 주입 (사용자 turn 이전이라 캐시 영향 없음)
  if (params.similarPatternContext) {
    userPrompt = `${params.similarPatternContext}\n\n${userPrompt}`;
  }

  const fewShotMessages = withEphemeralCacheOnLastMessage(SIGNAL_ENHANCER_FEW_SHOT);

  try {
    const { response, result } = await callWithRetry(
      async (requestOptions) => {
        const response = await client.messages.create(
          {
            ...buildInferenceOptions(model, "signal_enhancer"),
            model,
            max_tokens: resolveMaxTokens(3000, "signal_enhancer", model),
            system: [
              {
                type: "text",
                text: SIGNAL_ENHANCER_SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            tools: [
              {
                ...submitEnhancedSignalsTool,
                cache_control: { type: "ephemeral" },
              },
            ],
            tool_choice: { type: "tool", name: "submit_enhanced_signals" },
            messages: [
              ...fewShotMessages,
              { role: "user", content: userPrompt },
            ],
          },
          requestOptions,
        );

        const input = extractToolInput<unknown>(
          response,
          "submit_enhanced_signals",
          "signal enhancement",
        );
        return {
          response,
          result: validateEnhancedSignalResult(input, params.signals),
        };
      },
      {
        label: "signal_enhancer",
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
      chainStep: "signal_enhancer",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs,
      retryCount,
      timeoutMs,
      success: true,
    });

    // 캐시 히트율 모니터링 (개발 중 디버깅용)
    if (process.env.NODE_ENV !== "production") {
      const cacheRead = response.usage.cache_read_input_tokens ?? 0;
      const cacheCreate = response.usage.cache_creation_input_tokens ?? 0;
      if (cacheRead > 0 || cacheCreate > 0) {
        console.log(
          `[signal_enhancer] cache: read=${cacheRead}, write=${cacheCreate}, fresh=${response.usage.input_tokens}`,
        );
      }
    }

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "signal_enhancer",
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

function validateEnhancedSignalResult(
  input: unknown,
  expectedSignals: StoredSignal[],
): EnhancedSignalResult {
  const root = requireRecord(input, "signal enhancement result");
  const overallSummary = requireString(root, "overallSummary", "signal enhancement result");
  const signals = root.signals;

  if (!Array.isArray(signals)) {
    throw new RetryableLLMResponseError(
      `Signal enhancer returned malformed response: signals=${typeof signals}`,
    );
  }

  if (signals.length !== expectedSignals.length) {
    throw new RetryableLLMResponseError(
      `Signal enhancer returned ${signals.length} signals, expected ${expectedSignals.length}`,
    );
  }

  return {
    overallSummary,
    signals: signals.map((signal, index) => {
      const record = requireRecord(signal, `signals[${index}]`);
      const expected = expectedSignals[index];

      const signalType = requireString(record, "signalType", `signals[${index}]`);
      const signalKey = requireString(record, "signalKey", `signals[${index}]`);
      const confidenceLevel = requireString(record, "confidenceLevel", `signals[${index}]`);

      if (signalType !== expected.signalType) {
        throw new RetryableLLMResponseError(
          `Signal enhancer changed signalType for ${expected.signalKey}: ${signalType}`,
        );
      }

      if (signalKey !== expected.signalKey) {
        throw new RetryableLLMResponseError(
          `Signal enhancer changed signal order/key at index ${index}: ${signalKey} !== ${expected.signalKey}`,
        );
      }

      if (confidenceLevel !== expected.confidenceLevel) {
        throw new RetryableLLMResponseError(
          `Signal enhancer changed confidenceLevel for ${expected.signalKey}: ${confidenceLevel}`,
        );
      }

      return {
        signalType,
        signalKey,
        title: requireString(record, "title", `signals[${index}]`),
        description: requireString(record, "description", `signals[${index}]`),
        evidenceText: requireString(record, "evidenceText", `signals[${index}]`),
        confidenceLevel,
      };
    }),
  };
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
