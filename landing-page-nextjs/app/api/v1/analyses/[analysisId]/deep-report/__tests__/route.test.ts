import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAuthMock,
  getAnalysisMock,
  getConversationMock,
  hasDeepAccessMock,
  getReportMock,
  upsertGeneratingMock,
  completeMock,
  failMock,
  generateMock,
  findReferenceMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  getAnalysisMock: vi.fn(),
  getConversationMock: vi.fn(),
  hasDeepAccessMock: vi.fn(),
  getReportMock: vi.fn(),
  upsertGeneratingMock: vi.fn(),
  completeMock: vi.fn(),
  failMock: vi.fn(),
  generateMock: vi.fn(),
  findReferenceMock: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/store", () => ({
  isDbEnabled: () => true,
  getAnalysis: getAnalysisMock,
  getConversation: getConversationMock,
}));
vi.mock("@/lib/deep-report-store", () => ({
  hasDeepAccess: hasDeepAccessMock,
  getDeepReportByAnalysisId: getReportMock,
  upsertGeneratingDeepReport: upsertGeneratingMock,
  completeDeepReport: completeMock,
  failDeepReport: failMock,
}));
vi.mock("@/lib/ai/chains/deep-report-generator", () => ({
  generateDeepReport: generateMock,
}));
vi.mock("@/lib/ai/embeddings/reference-search", () => ({
  findSimilarReferenceCases: findReferenceMock,
}));

const sampleAnalysis = {
  id: "an-1",
  conversationId: "conv-1",
  overallSummary: "요약",
  recommendedAction: "slow_down",
  recommendedActionReason: "이유",
  signals: [
    {
      signalType: "caution",
      signalKey: "post_meeting_followup_caution",
      title: "연락 온도 주의",
      evidenceText: "답장이 짧아짐",
    },
  ],
};

const sampleConversation = {
  id: "conv-1",
  relationshipStage: "after_first_date",
  meetingChannel: "blind_date",
  userGoal: "continue_chat",
  situationContext: "만남 뒤 답장이 짧아졌습니다.",
  rawText: "",
  messages: [],
};

const sampleContent = {
  similarCases: null,
  scenarios: [
    {
      actionLabel: "한 템포 쉬기",
      expectedFlow: "전개",
      risk: "리스크",
      bestMessage: "메시지",
      timing: "지금",
      confidence: "medium",
    },
  ],
};

function makeContext(analysisId = "an-1") {
  return { params: Promise.resolve({ analysisId }) };
}

async function readSse(response: Response): Promise<string> {
  return await response.text();
}

describe("deep-report route", () => {
  beforeEach(() => {
    [
      requireAuthMock,
      getAnalysisMock,
      getConversationMock,
      hasDeepAccessMock,
      getReportMock,
      upsertGeneratingMock,
      completeMock,
      failMock,
      generateMock,
      findReferenceMock,
    ].forEach((fn) => fn.mockReset());

    requireAuthMock.mockResolvedValue({ userId: "user-1" });
    getAnalysisMock.mockResolvedValue(sampleAnalysis);
    getConversationMock.mockResolvedValue(sampleConversation);
    hasDeepAccessMock.mockResolvedValue(true);
    getReportMock.mockResolvedValue(null);
    upsertGeneratingMock.mockResolvedValue({
      analysisId: "an-1",
      status: "generating",
      draftCheckCount: 0,
    });
    findReferenceMock.mockResolvedValue([]);
    generateMock.mockResolvedValue(sampleContent);
  });

  it("returns 401 when not authenticated", async () => {
    requireAuthMock.mockResolvedValue({
      error: Response.json({ success: false }, { status: 401 }),
    });
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    expect(response.status).toBe(401);
  });

  it("returns 402 without payment or subscription", async () => {
    hasDeepAccessMock.mockResolvedValue(false);
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    expect(response.status).toBe(402);
  });

  it("streams a complete event and stores the report", async () => {
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    expect(response.status).toBe(200);

    const body = await readSse(response);
    expect(body).toContain('"type":"complete"');
    expect(completeMock).toHaveBeenCalledWith("an-1", sampleContent);
  });

  it("returns the stored report without regenerating when completed", async () => {
    getReportMock.mockResolvedValue({
      analysisId: "an-1",
      userId: "user-1",
      status: "completed",
      content: sampleContent,
      draftCheckCount: 1,
    });
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    const body = await readSse(response);

    expect(body).toContain('"type":"complete"');
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("falls back and still completes when the LLM chain throws", async () => {
    generateMock.mockRejectedValue(new Error("llm down"));
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    const body = await readSse(response);

    expect(body).toContain('"type":"complete"');
    expect(body).toContain('"fallback":true');
    expect(completeMock).toHaveBeenCalled();
  });

  it("GET returns 404 when the report does not exist", async () => {
    getReportMock.mockResolvedValue(null);
    const { GET } = await import("../route");

    const response = await GET(new Request("http://t"), makeContext());
    expect(response.status).toBe(404);
  });

  it("GET returns 403 for another user's report", async () => {
    getReportMock.mockResolvedValue({
      analysisId: "an-1",
      userId: "someone-else",
      status: "completed",
      content: sampleContent,
      draftCheckCount: 0,
    });
    const { GET } = await import("../route");

    const response = await GET(new Request("http://t"), makeContext());
    expect(response.status).toBe(403);
  });
});
