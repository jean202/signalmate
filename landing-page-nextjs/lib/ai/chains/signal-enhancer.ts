import { getAnthropicClient, getModelName } from "@/lib/ai/anthropic-client";
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

  // RAG 컨텍스트 주입
  if (params.similarPatternContext) {
    userPrompt = `${params.similarPatternContext}\n\n${userPrompt}`;
  }

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: SIGNAL_ENHANCER_SYSTEM_PROMPT,
    tools: [submitEnhancedSignalsTool],
    tool_choice: { type: "tool", name: "submit_enhanced_signals" },
    messages: [
      ...SIGNAL_ENHANCER_FEW_SHOT,
      { role: "user", content: userPrompt },
    ],
  });

  const durationMs = Date.now() - startTime;

  await trackUsage({
    analysisId: params.analysisId,
    modelName: model,
    chainStep: "signal_enhancer",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
    success: true,
  });

  const toolUseBlock = response.content.find((block) => block.type === "tool_use");

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use response for signal enhancement");
  }

  return toolUseBlock.input as EnhancedSignalResult;
}
