import {
  NonRetryableLLMResponseError,
  buildInferenceOptions,
  callWithRetry,
  extractToolInput,
  getAnthropicClient,
  getInferenceTimeoutMs,
  getModelName,
  resolveMaxTokens,
} from "@/lib/ai/anthropic-client";
import {
  DRAFT_CHECK_SYSTEM_PROMPT,
  buildDraftCheckUserPrompt,
} from "@/lib/ai/prompts/deep-report-prompt";
import { submitDraftCheckTool } from "@/lib/ai/schemas/deep-report-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import { createLogger } from "@/lib/logger";
import type { DraftCheckResult } from "@/lib/deep-report";

const logger = createLogger("ai.draft_checker");

const RISK_LEVELS = new Set(["low", "medium", "high"]);

function validateDraftCheck(input: unknown): DraftCheckResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NonRetryableLLMResponseError("draft check payload must be an object");
  }

  const root = input as Record<string, unknown>;
  const riskLevel = root.riskLevel as string;
  const predictedReaction =
    typeof root.predictedReaction === "string" ? root.predictedReaction.trim() : "";
  const improvedDraft =
    typeof root.improvedDraft === "string" ? root.improvedDraft.trim() : "";

  if (!RISK_LEVELS.has(riskLevel) || !predictedReaction || !improvedDraft) {
    throw new NonRetryableLLMResponseError("draft check payload is incomplete");
  }

  return {
    predictedReaction,
    riskLevel: riskLevel as DraftCheckResult["riskLevel"],
    risks: Array.isArray(root.risks)
      ? root.risks.filter((risk): risk is string => typeof risk === "string").slice(0, 3)
      : [],
    improvedDraft,
    rationale: typeof root.rationale === "string" ? root.rationale.trim() : "",
  };
}

export async function checkDraft(params: {
  analysisId?: string;
  draftText: string;
  overallSummary: string;
  recommendedAction: string;
  situationContext: string | null;
}): Promise<DraftCheckResult> {
  const client = getAnthropicClient();
  const model = getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("draft_check");
  let retryCount = 0;

  try {
    const { response, result } = await callWithRetry(
      async (requestOptions) => {
        const response = await client.messages.create(
          {
            ...buildInferenceOptions(model, "draft_check"),
            model,
            max_tokens: resolveMaxTokens(1200, "draft_check", model),
            system: [{ type: "text", text: DRAFT_CHECK_SYSTEM_PROMPT }],
            tools: [submitDraftCheckTool],
            tool_choice: { type: "tool", name: "submit_draft_check" },
            messages: [{ role: "user", content: buildDraftCheckUserPrompt(params) }],
          },
          requestOptions,
        );

        const input = extractToolInput<unknown>(
          response,
          "submit_draft_check",
          "draft check",
        );
        return { response, result: validateDraftCheck(input) };
      },
      {
        label: "draft_checker",
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
      chainStep: "draft_checker",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs,
      retryCount,
      timeoutMs,
      success: true,
    });

    logger.info("completed", { analysisId: params.analysisId, riskLevel: result.riskLevel });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "draft_checker",
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
