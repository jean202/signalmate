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
  DEEP_REPORT_SYSTEM_PROMPT,
  buildDeepReportUserPrompt,
} from "@/lib/ai/prompts/deep-report-prompt";
import { submitDeepReportTool } from "@/lib/ai/schemas/deep-report-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import { createLogger } from "@/lib/logger";
import type { ReferenceCaseHit } from "@/lib/ai/embeddings/reference-search";
import type {
  DeepReportContent,
  DeepReportScenario,
  DeepReportSimilarCase,
} from "@/lib/deep-report";

const logger = createLogger("ai.deep_report_generator");

const OUTCOMES = new Set(["progressed", "stalled", "ended"]);
const CONFIDENCES = new Set(["low", "medium", "high"]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateReport(input: unknown): DeepReportContent {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new NonRetryableLLMResponseError("deep report payload must be an object");
  }

  const root = input as Record<string, unknown>;
  const rawScenarios = Array.isArray(root.scenarios) ? root.scenarios : [];
  const scenarios: DeepReportScenario[] = rawScenarios
    .map((raw) => {
      const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return {
        actionLabel: asString(item.actionLabel),
        expectedFlow: asString(item.expectedFlow),
        risk: asString(item.risk),
        bestMessage: asString(item.bestMessage),
        timing: asString(item.timing),
        confidence: CONFIDENCES.has(item.confidence as string)
          ? (item.confidence as DeepReportScenario["confidence"])
          : "low",
      };
    })
    .filter((scenario) => scenario.actionLabel && scenario.expectedFlow)
    .slice(0, 3);

  if (scenarios.length < 1) {
    throw new NonRetryableLLMResponseError("deep report has no usable scenarios");
  }

  const rawCases = Array.isArray(root.cases) ? root.cases : [];
  const cases: DeepReportSimilarCase[] = rawCases
    .map((raw) => {
      const item = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return {
        situationType: asString(item.situationType),
        flowSummary: asString(item.flowSummary),
        outcome: OUTCOMES.has(item.outcome as string)
          ? (item.outcome as DeepReportSimilarCase["outcome"])
          : "stalled",
        lesson: asString(item.lesson),
      };
    })
    .filter((item) => item.flowSummary)
    .slice(0, 3);

  const patternSummary = asString(root.patternSummary);

  return {
    similarCases: cases.length > 0 && patternSummary ? { patternSummary, cases } : null,
    scenarios,
  };
}

export async function generateDeepReport(params: {
  analysisId?: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext: string | null;
  overallSummary: string;
  recommendedAction: string;
  recommendedActionReason: string;
  signalLines: string[];
  referenceCases: ReferenceCaseHit[];
}): Promise<DeepReportContent> {
  const client = getAnthropicClient();
  const model = getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("deep_report");
  let retryCount = 0;

  const userPrompt = buildDeepReportUserPrompt(params);

  try {
    const { response, result } = await callWithRetry(
      async (requestOptions) => {
        const response = await client.messages.create(
          {
            ...buildInferenceOptions(model, "deep_report", {
              forcedToolUse: true,
            }),
            model,
            max_tokens: resolveMaxTokens(3000, "deep_report", model),
            system: [{ type: "text", text: DEEP_REPORT_SYSTEM_PROMPT }],
            tools: [submitDeepReportTool],
            tool_choice: { type: "tool", name: "submit_deep_report" },
            messages: [{ role: "user", content: userPrompt }],
          },
          requestOptions,
        );

        const input = extractToolInput<unknown>(
          response,
          "submit_deep_report",
          "deep report generation",
        );
        return { response, result: validateReport(input) };
      },
      {
        label: "deep_report_generator",
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
      chainStep: "deep_report_generator",
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      durationMs,
      retryCount,
      timeoutMs,
      success: true,
    });

    logger.info("completed", {
      analysisId: params.analysisId,
      scenarioCount: result.scenarios.length,
      hasSimilarCases: result.similarCases !== null,
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    await trackUsage({
      analysisId: params.analysisId,
      modelName: model,
      chainStep: "deep_report_generator",
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
