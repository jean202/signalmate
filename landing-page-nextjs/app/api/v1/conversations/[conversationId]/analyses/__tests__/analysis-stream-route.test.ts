import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../stream/route";

const streamMocks = vi.hoisted(() => ({
  runHybridAnalysis: vi.fn(),
  trackUsage: vi.fn(),
  embedConversation: vi.fn(),
  createAnalysis: vi.fn(),
  getConversation: vi.fn(),
}));

vi.mock("@/lib/ai/hybrid-analysis-runner", () => ({
  runHybridAnalysis: streamMocks.runHybridAnalysis,
}));

vi.mock("@/lib/ai/token-tracker", () => ({
  trackUsage: streamMocks.trackUsage,
}));

vi.mock("@/lib/ai/embeddings/embed-conversation", () => ({
  embedConversation: streamMocks.embedConversation,
}));

vi.mock("@/lib/store", () => ({
  createAnalysis: streamMocks.createAnalysis,
  getConversation: streamMocks.getConversation,
}));

type StreamContext = Parameters<typeof POST>[1];

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/v1/conversations/conv_1/analyses/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function context(conversationId: string): StreamContext {
  return {
    params: Promise.resolve({ conversationId }),
  };
}

function inlineConversationBody() {
  return {
    analysisVersion: "v1",
    conversationInline: {
      rawText: "나: 안녕\n상대: 안녕하세요",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      situationContext: null,
      messages: [
        {
          senderRole: "self",
          messageText: "안녕",
          sentAt: null,
          sequenceNo: 1,
        },
        {
          senderRole: "other",
          messageText: "안녕하세요",
          sentAt: null,
          sequenceNo: 2,
        },
      ],
    },
  };
}

function analysisDraft() {
  return {
    conversationId: "conv_inline",
    analysisVersion: "v1",
    modelName: "rule-based-dev",
    overallSummary: "상대가 대화를 받아주고 있어 가볍게 이어가기 좋은 흐름입니다.",
    positiveSignalCount: 1,
    ambiguousSignalCount: 0,
    cautionSignalCount: 0,
    confidenceLevel: "medium",
    recommendedAction: "keep_light",
    recommendedActionReason: "아직은 부담 없이 대화를 이어가는 편이 좋습니다.",
    analysisStatus: "completed",
    signals: [
      {
        id: "signal_1",
        signalType: "positive",
        signalKey: "reply_continuity",
        title: "답장이 이어지고 있어요",
        description: "상대가 대화를 끊지 않고 받아주고 있습니다.",
        evidenceText: "상대: 안녕하세요",
        confidenceLevel: "medium",
        displayOrder: 1,
      },
    ],
    recommendations: [
      {
        id: "rec_1",
        recommendationType: "next_message",
        title: "가볍게 이어가기",
        content: "오늘 하루 어땠어요?",
        rationale: "부담이 적은 질문입니다.",
        toneLabel: "가벼운 톤",
        displayOrder: 1,
      },
    ],
  };
}

describe("POST /api/v1/conversations/:conversationId/analyses/stream", () => {
  beforeEach(() => {
    streamMocks.runHybridAnalysis.mockReset();
    streamMocks.trackUsage.mockReset();
    streamMocks.embedConversation.mockReset();
    streamMocks.createAnalysis.mockReset();
    streamMocks.getConversation.mockReset();

    streamMocks.trackUsage.mockResolvedValue(undefined);
  });

  it("streams rule_complete and complete events for an inline conversation", async () => {
    const draft = analysisDraft();
    streamMocks.runHybridAnalysis.mockImplementationOnce(async (_conversation, options) => {
      await options.callbacks.onRuleComplete(draft);
      return {
        analysis: draft,
        ruleResult: draft,
        signalEnhanced: false,
        recommendationEnhanced: false,
        hasRag: false,
      };
    });

    const response = await POST(
      jsonRequest(inlineConversationBody()),
      context("conv_inline"),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(body).toContain("event: progress");
    expect(body).toContain('"type":"rule_complete"');
    expect(body).toContain('"signals":[{"id":"signal_1"');
    expect(body).toContain('"type":"complete"');
    expect(body).toContain('"modelName":"rule-based-dev"');
    expect(streamMocks.runHybridAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "conv_inline",
        rawText: "나: 안녕\n상대: 안녕하세요",
      }),
      expect.objectContaining({
        analysisVersion: "v1",
        noApiKeyModelName: "rule-based-dev",
      }),
    );
    expect(streamMocks.getConversation).not.toHaveBeenCalled();
    expect(streamMocks.createAnalysis).not.toHaveBeenCalled();
    expect(streamMocks.embedConversation).not.toHaveBeenCalled();
  });

  it("returns 400 when conversationId is missing", async () => {
    const response = await POST(jsonRequest({}), context(""));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "conversationId required" });
    expect(streamMocks.getConversation).not.toHaveBeenCalled();
    expect(streamMocks.runHybridAnalysis).not.toHaveBeenCalled();
  });

  it("returns 404 when the conversation cannot be found", async () => {
    streamMocks.getConversation.mockResolvedValueOnce(null);

    const response = await POST(jsonRequest({}), context("conv_missing"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Conversation not found" });
    expect(streamMocks.getConversation).toHaveBeenCalledWith("conv_missing");
    expect(streamMocks.runHybridAnalysis).not.toHaveBeenCalled();
  });

  it("emits an SSE error event when the analysis pipeline fails", async () => {
    streamMocks.runHybridAnalysis.mockRejectedValueOnce(new Error("pipeline failed"));

    const response = await POST(
      jsonRequest(inlineConversationBody()),
      context("conv_inline"),
    );

    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(body).toContain("event: error");
    expect(body).toContain("분석 중 문제가 발생했습니다.");
    expect(streamMocks.trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "fallback",
        fallbackStage: "stream_pipeline",
        success: false,
      }),
    );
    expect(streamMocks.createAnalysis).not.toHaveBeenCalled();
    expect(streamMocks.embedConversation).not.toHaveBeenCalled();
  });
});
