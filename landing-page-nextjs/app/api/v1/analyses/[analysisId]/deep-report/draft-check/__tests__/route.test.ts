import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  getReportMock,
  incrementMock,
  checkDraftMock,
  getAnalysisMock,
  getConversationMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getReportMock: vi.fn(),
  incrementMock: vi.fn(),
  checkDraftMock: vi.fn(),
  getAnalysisMock: vi.fn(),
  getConversationMock: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/store", () => ({
  isDbEnabled: () => true,
  getAnalysis: getAnalysisMock,
  getConversation: getConversationMock,
}));
vi.mock("@/lib/deep-report-store", () => ({
  getDeepReportByAnalysisId: getReportMock,
  incrementDraftCheckCount: incrementMock,
}));
vi.mock("@/lib/ai/chains/draft-checker", () => ({ checkDraft: checkDraftMock }));

function makeContext() {
  return { params: Promise.resolve({ analysisId: "an-1" }) };
}

function request(body: unknown) {
  return new Request("http://t", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const completedReport = {
  analysisId: "an-1",
  userId: "user-1",
  status: "completed",
  content: { similarCases: null, scenarios: [] },
  draftCheckCount: 0,
};

const checkResult = {
  predictedReaction: "짧은 답장 가능성",
  riskLevel: "medium",
  risks: [],
  improvedDraft: "개선안",
  rationale: "근거",
};

describe("draft-check route", () => {
  beforeEach(() => {
    [
      requireAuthMock,
      getReportMock,
      incrementMock,
      checkDraftMock,
      getAnalysisMock,
      getConversationMock,
    ].forEach((fn) => fn.mockReset());

    requireAuthMock.mockResolvedValue({ userId: "user-1" });
    getReportMock.mockResolvedValue(completedReport);
    getAnalysisMock.mockResolvedValue({
      id: "an-1",
      conversationId: "conv-1",
      overallSummary: "요약",
      recommendedAction: "slow_down",
    });
    getConversationMock.mockResolvedValue({ id: "conv-1", situationContext: null });
    checkDraftMock.mockResolvedValue(checkResult);
    incrementMock.mockResolvedValue(1);
  });

  it("returns the check result and remaining count", async () => {
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "왜 답장 안 해요?" }), makeContext());
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.data.result.riskLevel).toBe("medium");
    expect(payload.data.remaining).toBe(4);
    expect(incrementMock).toHaveBeenCalledTimes(1);
  });

  it("rejects empty drafts", async () => {
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "  " }), makeContext());
    expect(response.status).toBe(400);
    expect(checkDraftMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the limit is exhausted without calling the LLM", async () => {
    getReportMock.mockResolvedValue({ ...completedReport, draftCheckCount: 5 });
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "초안" }), makeContext());
    expect(response.status).toBe(429);
    expect(checkDraftMock).not.toHaveBeenCalled();
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it("does not consume a count when the LLM fails", async () => {
    checkDraftMock.mockRejectedValue(new Error("llm down"));
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "초안" }), makeContext());
    expect(response.status).toBe(502);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it("returns 403 for another user's report", async () => {
    getReportMock.mockResolvedValue({ ...completedReport, userId: "someone-else" });
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "초안" }), makeContext());
    expect(response.status).toBe(403);
  });
});
