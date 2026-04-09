import { prisma } from "@/lib/prisma";

type UsageEntry = {
  analysisId?: string;
  modelName: string;
  chainStep: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
};

/** Haiku / Sonnet 토큰당 비용 (USD) */
const COST_TABLE: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4.0 / 1_000_000 },
  "claude-sonnet-4-6": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
  "claude-sonnet-4-20250514": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
};

function estimateCostUsd(modelName: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_TABLE[modelName] ?? COST_TABLE["claude-haiku-4-5-20251001"];
  return inputTokens * rates.input + outputTokens * rates.output;
}

export async function trackUsage(entry: UsageEntry): Promise<void> {
  const totalTokens = entry.inputTokens + entry.outputTokens;
  const costUsd = estimateCostUsd(entry.modelName, entry.inputTokens, entry.outputTokens);

  try {
    await prisma.aiUsageLog.create({
      data: {
        analysisId: entry.analysisId,
        modelName: entry.modelName,
        chainStep: entry.chainStep,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens,
        costUsd,
        durationMs: entry.durationMs,
        success: entry.success,
        errorMessage: entry.errorMessage,
      },
    });
  } catch (error) {
    console.error("[token-tracker] Failed to log usage:", error);
  }
}
