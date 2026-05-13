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

describe("POST /api/v1/conversations/:conversationId/analyses/stream", () => {
  beforeEach(() => {
    streamMocks.runHybridAnalysis.mockReset();
    streamMocks.trackUsage.mockReset();
    streamMocks.embedConversation.mockReset();
    streamMocks.createAnalysis.mockReset();
    streamMocks.getConversation.mockReset();

    streamMocks.trackUsage.mockResolvedValue(undefined);
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
      jsonRequest({
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
      }),
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
