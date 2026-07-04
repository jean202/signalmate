import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgentAnalysis } from "@/lib/ai/agent/analysis-agent";
import { trackUsage } from "@/lib/ai/token-tracker";
import { makeConversationFixture } from "@/test/helpers/make-conversation";

const anthropicMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic-client")>();

  return {
    ...actual,
    getAnthropicClient: () => ({
      messages: {
        create: anthropicMocks.create,
      },
    }),
    getInferenceTimeoutMs: () => 1_000,
    getModelName: () => "claude-haiku-4-5-20251001",
  };
});

vi.mock("@/lib/ai/token-tracker", () => ({
  trackUsage: vi.fn().mockResolvedValue(undefined),
}));

describe("runAgentAnalysis", () => {
  beforeEach(() => {
    anthropicMocks.create.mockReset();
    vi.mocked(trackUsage).mockClear();
    vi.stubEnv("ANTHROPIC_RETRY_BASE_DELAY_MS", "1");
  });

  it("falls back when the final agent result fails server-side evidence quality", async () => {
    anthropicMocks.create.mockResolvedValue(
      makeMessage([
        {
          type: "tool_use",
          id: "tool-1",
          name: "submit_result",
          input: {
            overallSummary: "대화는 이어지지만 아직 강하게 단정하기는 어렵습니다.",
            confidenceLevel: "medium",
            recommendedAction: "keep_light",
            recommendedActionReason: "가볍게 이어가며 반응을 더 보는 편이 좋습니다.",
            signals: [
              {
                signalType: "positive",
                signalKey: "reply_continuity",
                title: "대화가 이어지고 있어요",
                description: "상대가 답장을 이어가고 있어 완전히 닫힌 흐름은 아닙니다.",
                evidenceText: "\"원문에 없는 말\"",
                confidenceLevel: "medium",
              },
            ],
            recommendations: [
              makeRecommendation("next_message", "가벼운 안부"),
              makeRecommendation("tone_guide", "여유 있는 톤"),
              makeRecommendation("avoid_phrase", "압박 표현 피하기"),
            ],
          },
        },
      ]),
    );

    const result = await runAgentAnalysis(
      makeConversationFixture({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "evaluate_interest",
        messages: [
          { senderRole: "self", messageText: "오늘 잘 들어갔어요?" },
          { senderRole: "other", messageText: "네 잘 들어갔어요." },
        ],
      }),
    );

    expect(result.modelName).toBe("rule-based-dev (fallback: agent-quality-gate)");
    expect(result.signals.some((signal) => signal.evidenceText.includes("원문에 없는 말"))).toBe(false);
    expect(trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "quality_gate",
        fallbackStage: "agent_quality_gate",
        success: false,
      }),
    );
  });
});

function makeMessage(content: unknown[]) {
  return {
    content,
    stop_reason: "tool_use",
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  };
}

function makeRecommendation(recommendationType: string, title: string) {
  return {
    recommendationType,
    title,
    content: `${title}는 부담을 낮춰서 대화를 이어가게 돕습니다.`,
    rationale: `${title}를 추천하는 이유입니다.`,
    toneLabel: "gentle",
  };
}
