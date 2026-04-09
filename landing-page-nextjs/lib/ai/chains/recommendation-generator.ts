import { getAnthropicClient, getModelName } from "@/lib/ai/anthropic-client";
import {
  RECOMMENDATION_SYSTEM_PROMPT,
  buildRecommendationUserPrompt,
} from "@/lib/ai/prompts/system-prompt";
import { RECOMMENDATION_FEW_SHOT } from "@/lib/ai/prompts/few-shot-examples";
import { submitRecommendationsTool } from "@/lib/ai/schemas/analysis-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import type { StoredSignal } from "@/lib/analysis-store";

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

  const response = await client.messages.create({
    model,
    max_tokens: 2000,
    system: RECOMMENDATION_SYSTEM_PROMPT,
    tools: [submitRecommendationsTool],
    tool_choice: { type: "tool", name: "submit_recommendations" },
    messages: [
      ...RECOMMENDATION_FEW_SHOT,
      { role: "user", content: userPrompt },
    ],
  });

  const durationMs = Date.now() - startTime;

  await trackUsage({
    analysisId: params.analysisId,
    modelName: model,
    chainStep: "recommendation_generator",
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs,
    success: true,
  });

  const toolUseBlock = response.content.find((block) => block.type === "tool_use");

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Claude did not return a tool_use response for recommendations");
  }

  return toolUseBlock.input as RecommendationResult;
}
