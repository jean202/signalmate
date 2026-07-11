import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StoredSignal } from "@/lib/analysis-store";
import { enhanceSignals } from "@/lib/ai/chains/signal-enhancer";
import { generateRecommendations } from "@/lib/ai/chains/recommendation-generator";
import { submitRecommendationsTool } from "@/lib/ai/schemas/analysis-schema";
import { trackUsage } from "@/lib/ai/token-tracker";

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

const baseSignals: StoredSignal[] = [
  {
    id: "signal-1",
    signalType: "positive",
    signalKey: "reply_continuity",
    title: "대화가 이어져요",
    description: "상대가 답장을 이어가고 있습니다.",
    evidenceText: "상대가 두 번 답장함",
    confidenceLevel: "high",
    displayOrder: 1,
  },
  {
    id: "signal-2",
    signalType: "ambiguous",
    signalKey: "question_balance",
    title: "질문은 적어요",
    description: "상대가 질문을 많이 하지는 않습니다.",
    evidenceText: "상대 질문 0개",
    confidenceLevel: "medium",
    displayOrder: 2,
  },
];

describe("LLM chains", () => {
  beforeEach(() => {
    anthropicMocks.create.mockReset();
    vi.mocked(trackUsage).mockClear();
    vi.stubEnv("ANTHROPIC_RETRY_BASE_DELAY_MS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("retries signal enhancement when Claude omits the required tool_use", async () => {
    anthropicMocks.create
      .mockResolvedValueOnce(makeMessage([{ type: "text", text: "일반 텍스트 응답" }], "end_turn"))
      .mockResolvedValueOnce(
        makeMessage([
          {
            type: "tool_use",
            id: "tool-1",
            name: "submit_enhanced_signals",
            input: {
              overallSummary: "대화는 이어지지만 질문 균형은 아직 약해요.",
              signals: baseSignals.map((signal) => ({
                signalType: signal.signalType,
                signalKey: signal.signalKey,
                title: `${signal.title} 보강`,
                description: `${signal.description} 대화 흐름 기준으로 보면 과한 단정은 어려워요.`,
                evidenceText: signal.evidenceText,
                confidenceLevel: signal.confidenceLevel,
              })),
            },
          },
        ]),
      );

    const result = await enhanceSignals({
      rawText: "나: 안녕하세요\n상대: 반가워요",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      signals: baseSignals,
    });

    expect(result.signals).toHaveLength(2);
    expect(anthropicMocks.create).toHaveBeenCalledTimes(2);
    expect(anthropicMocks.create.mock.calls[0][1]).toMatchObject({
      maxRetries: 0,
      timeout: expect.any(Number),
      signal: expect.any(AbortSignal),
    });
    expect(trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "signal_enhancer",
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        retryCount: 1,
        timeoutMs: 1_000,
        success: true,
      }),
    );
  });

  it("rejects signal enhancement when the model changes signal order or keys", async () => {
    anthropicMocks.create.mockResolvedValue(
      makeMessage([
        {
          type: "tool_use",
          id: "tool-1",
          name: "submit_enhanced_signals",
          input: {
            overallSummary: "요약입니다.",
            signals: [
              {
                signalType: "positive",
                signalKey: "wrong_key",
                title: "잘못된 키",
                description: "원본과 다른 키를 반환했습니다.",
                evidenceText: "근거",
                confidenceLevel: "high",
              },
              {
                signalType: "ambiguous",
                signalKey: "question_balance",
                title: "질문은 적어요",
                description: "설명",
                evidenceText: "근거",
                confidenceLevel: "medium",
              },
            ],
          },
        },
      ]),
    );

    await expect(
      enhanceSignals({
        rawText: "나: 안녕하세요\n상대: 반가워요",
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "evaluate_interest",
        signals: baseSignals,
      }),
    ).rejects.toThrow("changed signal order/key");
    expect(anthropicMocks.create).toHaveBeenCalledTimes(2);
  });

  it("orders recommendation results by required recommendation type", async () => {
    anthropicMocks.create.mockResolvedValue(
      makeMessage([
        {
          type: "tool_use",
          id: "tool-1",
          name: "submit_recommendations",
          input: {
            recommendedActionReason: "상대가 답장을 이어가고 있어 가볍게 대화를 유지하는 편이 좋아요.",
            recommendations: [
              makeRecommendation("avoid_phrase", "압박 표현 피하기"),
              makeRecommendation("next_message", "가벼운 다음 메시지"),
              makeRecommendation("tone_guide", "여유 있는 톤"),
            ],
          },
        },
      ]),
    );

    const result = await generateRecommendations({
      rawText: "나: 안녕하세요\n상대: 반가워요",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      recommendedAction: "keep_light",
      recommendedActionReason: "흐름을 가볍게 유지합니다.",
      overallSummary: "대화가 이어지고 있지만 아직 강한 확신은 이릅니다.",
      signals: baseSignals,
    });

    expect(result.recommendations.map((rec) => rec.recommendationType)).toEqual([
      "next_message",
      "tone_guide",
      "avoid_phrase",
    ]);
  });

  it("uses an Anthropic-compatible array schema for recommendation tools", () => {
    expect(JSON.stringify(submitRecommendationsTool.input_schema)).not.toContain(
      '"minItems":3',
    );
    expect(JSON.stringify(submitRecommendationsTool.input_schema)).not.toContain(
      '"maxItems":3',
    );
  });

  it("rejects recommendation results with duplicate recommendation types", async () => {
    anthropicMocks.create.mockResolvedValue(
      makeMessage([
        {
          type: "tool_use",
          id: "tool-1",
          name: "submit_recommendations",
          input: {
            recommendedActionReason: "중복 타입 응답입니다.",
            recommendations: [
              makeRecommendation("next_message", "첫 번째 메시지"),
              makeRecommendation("next_message", "두 번째 메시지"),
              makeRecommendation("avoid_phrase", "압박 표현 피하기"),
            ],
          },
        },
      ]),
    );

    await expect(
      generateRecommendations({
        rawText: "나: 안녕하세요\n상대: 반가워요",
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "evaluate_interest",
        recommendedAction: "keep_light",
        recommendedActionReason: "흐름을 가볍게 유지합니다.",
        overallSummary: "대화가 이어지고 있지만 아직 강한 확신은 이릅니다.",
        signals: baseSignals,
      }),
    ).rejects.toThrow("duplicate type");
    expect(anthropicMocks.create).toHaveBeenCalledTimes(2);
  });
});

function makeMessage(content: unknown[], stopReason = "tool_use") {
  return {
    content,
    stop_reason: stopReason,
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
    content: `${title} 내용입니다. 부담을 낮추는 방향으로 작성합니다.`,
    rationale: `${title}를 추천하는 이유입니다.`,
    toneLabel: "gentle",
  };
}
