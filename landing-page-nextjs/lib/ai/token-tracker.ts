import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

type UsageEntry = {
  analysisId?: string;
  modelName: string;
  chainStep: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  durationMs: number;
  retryCount?: number;
  timeoutMs?: number;
  success: boolean;
  errorMessage?: string;
  fallbackStage?: string;
  qualityWarnings?: string[];
};

/** Haiku / Sonnet 토큰당 비용 (USD) */
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-sonnet-4-20250514": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
};

const logger = createLogger("ai.token_tracker");

function estimateCostUsd(modelName: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_TABLE[modelName] ?? COST_TABLE["claude-haiku-4-5-20251001"];
  return inputTokens * rates.input + outputTokens * rates.output;
}

export async function trackUsage(entry: UsageEntry): Promise<void> {
  if (process.env.SIGNALMATE_DISABLE_AI_USAGE_LOG === "1") {
    return;
  }

  const cacheReadInputTokens = entry.cacheReadInputTokens ?? 0;
  const cacheCreationInputTokens = entry.cacheCreationInputTokens ?? 0;
  const totalTokens =
    entry.inputTokens + entry.outputTokens + cacheReadInputTokens + cacheCreationInputTokens;
  const costUsd = estimateCostUsd(entry.modelName, entry.inputTokens, entry.outputTokens);

  try {
    await prisma.aiUsageLog.create({
      data: {
        analysisId: entry.analysisId,
        modelName: entry.modelName,
        chainStep: entry.chainStep,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        cacheReadInputTokens,
        cacheCreationInputTokens,
        totalTokens,
        costUsd,
        durationMs: entry.durationMs,
        retryCount: entry.retryCount ?? 0,
        timeoutMs: entry.timeoutMs,
        success: entry.success,
        errorMessage: entry.errorMessage,
        fallbackStage: entry.fallbackStage,
        qualityWarnings: entry.qualityWarnings,
      },
    });
  } catch (error) {
    logger.error("failed_to_log_usage", {
      analysisId: entry.analysisId,
      modelName: entry.modelName,
      chainStep: entry.chainStep,
      error,
    });
  }
}
