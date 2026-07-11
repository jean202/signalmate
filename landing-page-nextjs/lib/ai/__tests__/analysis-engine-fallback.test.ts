import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAnalysis } from "@/lib/ai/analysis-engine";
import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import { makeConversationFixture } from "@/test/helpers/make-conversation";

const mocks = vi.hoisted(() => ({
  enhanceSignals: vi.fn(),
  generateRecommendations: vi.fn(),
  isAnthropicAvailable: vi.fn(),
  isOpenAIAvailable: vi.fn(),
  runAgentAnalysis: vi.fn(),
  trackUsage: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic-client", () => ({
  isAnthropicAvailable: mocks.isAnthropicAvailable,
}));

vi.mock("@/lib/ai/chains/signal-enhancer", () => ({
  enhanceSignals: mocks.enhanceSignals,
}));

vi.mock("@/lib/ai/chains/recommendation-generator", () => ({
  generateRecommendations: mocks.generateRecommendations,
}));

vi.mock("@/lib/ai/embeddings/openai-client", () => ({
  isOpenAIAvailable: mocks.isOpenAIAvailable,
}));

vi.mock("@/lib/ai/agent/analysis-agent", () => ({
  runAgentAnalysis: mocks.runAgentAnalysis,
}));

vi.mock("@/lib/ai/token-tracker", () => ({
  trackUsage: mocks.trackUsage,
}));

describe("runAnalysis LLM fallback", () => {
  beforeEach(() => {
    mocks.enhanceSignals.mockReset();
    mocks.generateRecommendations.mockReset();
    mocks.isAnthropicAvailable.mockReset().mockReturnValue(true);
    mocks.isOpenAIAvailable.mockReset().mockReturnValue(false);
    mocks.runAgentAnalysis.mockReset();
    mocks.trackUsage.mockReset().mockResolvedValue(undefined);
  });

  it("keeps LLM recommendations when signal enhancement fails", async () => {
    mocks.enhanceSignals.mockRejectedValue(new Error("signal stage down"));
    mocks.generateRecommendations.mockResolvedValue({
      recommendedActionReason: "상대가 답장을 이어가고 있어 가볍게 이어가는 편이 좋습니다.",
      recommendations: [
        makeRecommendation("next_message", "가벼운 답장"),
        makeRecommendation("tone_guide", "여유 있는 톤"),
        makeRecommendation("avoid_phrase", "압박 표현 피하기"),
      ],
    });

    const result = await runAnalysis(makeConversation(), { modelName: "hybrid-v1" });

    expect(result.modelName).toBe("hybrid-v1 (partial: recommendations)");
    expect(result.recommendations.map((rec) => rec.recommendationType)).toEqual([
      "next_message",
      "tone_guide",
      "avoid_phrase",
    ]);
    expect(result.recommendations[0].content).toContain("부담을 낮춰");
    expect(result.signals.length).toBeGreaterThan(0);
    expect(mocks.trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "fallback",
        fallbackStage: "signal_enhancer",
        success: true,
      }),
    );
  });

  it("falls back to rule-based output when all LLM stages fail", async () => {
    mocks.enhanceSignals.mockRejectedValue(new Error("signal stage down"));
    mocks.generateRecommendations.mockRejectedValue(new Error("recommendation stage down"));

    const result = await runAnalysis(makeConversation(), { modelName: "hybrid-v1" });

    expect(result.modelName).toContain("rule-based-dev (fallback:");
    expect(result.analysisStatus).toBe("completed");
    expect(result.recommendations).toHaveLength(3);
    expect(mocks.trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "fallback",
        fallbackStage: "all_llm_stages",
        success: false,
      }),
    );
  });

  it("rejects enhanced signals when evidence quotes are not in the raw text", async () => {
    const conversation = makeConversation();
    const ruleResult = buildRuleBasedAnalysis(conversation);

    mocks.enhanceSignals.mockResolvedValue({
      overallSummary: "보강 요약입니다.",
      signals: ruleResult.signals.map((signal) => ({
        ...signal,
        evidenceText: "\"원문에 없는 말\"",
      })),
    });
    mocks.generateRecommendations.mockResolvedValue({
      recommendedActionReason: "상대가 답장을 이어가고 있어 가볍게 이어가는 편이 좋습니다.",
      recommendations: [
        makeRecommendation("next_message", "가벼운 답장"),
        makeRecommendation("tone_guide", "여유 있는 톤"),
        makeRecommendation("avoid_phrase", "압박 표현 피하기"),
      ],
    });

    const result = await runAnalysis(conversation, { modelName: "hybrid-v1" });

    expect(result.modelName).toBe("hybrid-v1 (partial: recommendations)");
    expect(result.signals.some((signal) => signal.evidenceText.includes("원문에 없는 말"))).toBe(false);
    expect(mocks.trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "quality_gate",
        fallbackStage: "signal_quality_gate",
        success: false,
      }),
    );
  });

  it("keeps deterministic closure recommendations when the other person ends contact", async () => {
    const conversation = makeConversationFixture({
      relationshipStage: "cooling_down",
      meetingChannel: "dating_app",
      userGoal: "evaluate_interest",
      messages: [
        { senderRole: "other", messageText: "안녕하세요! 먼저 연락드려요." },
        { senderRole: "self", messageText: "다음에 커피 한잔해요." },
        { senderRole: "other", messageText: "좋아요. 다음 주에 봐요!" },
        { senderRole: "other", messageText: "네 저는 여기까지 연락해야했네요" },
        { senderRole: "other", messageText: "하시는 일 잘 되시길 바랍습니다 🙏" },
      ],
    });
    const ruleResult = buildRuleBasedAnalysis(conversation);

    mocks.enhanceSignals.mockResolvedValue({
      overallSummary: ruleResult.overallSummary,
      signals: ruleResult.signals,
    });
    mocks.generateRecommendations.mockResolvedValue({
      recommendedActionReason: "다음 만남을 제안해 보세요.",
      recommendations: [
        makeRecommendation("next_message", "다음 만남 제안"),
        makeRecommendation("tone_guide", "적극적인 톤"),
        makeRecommendation("avoid_phrase", "소극적인 표현 피하기"),
      ],
    });

    const result = await runAnalysis(conversation, { modelName: "hybrid-v1" });

    expect(result.recommendedAction).toBe("consider_stopping");
    expect(result.recommendations[0].content).toContain("알겠습니다");
    expect(mocks.generateRecommendations).not.toHaveBeenCalled();
  });

  it("does not let agent analysis override an explicit relationship end", async () => {
    const conversation = makeConversationFixture({
      relationshipStage: "cooling_down",
      meetingChannel: "dating_app",
      userGoal: "evaluate_interest",
      messages: [
        { senderRole: "other", messageText: "다음에 또 봬요!" },
        { senderRole: "other", messageText: "네 저는 여기까지 연락해야겠네요" },
        { senderRole: "other", messageText: "하시는 일 잘 되시길 바랍니다." },
      ],
    });
    mocks.runAgentAnalysis.mockResolvedValue({
      ...buildRuleBasedAnalysis(conversation),
      recommendedAction: "suggest_date",
    });

    const result = await runAnalysis(conversation, { modelName: "agent-v1" });

    expect(result.recommendedAction).toBe("consider_stopping");
    expect(mocks.runAgentAnalysis).not.toHaveBeenCalled();
  });
});

function makeConversation() {
  return makeConversationFixture({
    relationshipStage: "after_first_date",
    meetingChannel: "blind_date",
    userGoal: "evaluate_interest",
    messages: [
      { senderRole: "self", messageText: "오늘 잘 들어갔어요?" },
      { senderRole: "other", messageText: "네 덕분에요. 오늘 즐거웠어요 ㅎㅎ" },
      { senderRole: "self", messageText: "저도 즐거웠어요. 다음에 또 봐요" },
      { senderRole: "other", messageText: "좋아요 다음에 또 봬요!" },
    ],
  });
}

function makeRecommendation(recommendationType: string, title: string) {
  return {
    recommendationType,
    title,
    content: `${title}은 부담을 낮춰서 대화를 이어가게 돕습니다.`,
    rationale: `${title}를 추천하는 이유입니다.`,
    toneLabel: "gentle",
  };
}
