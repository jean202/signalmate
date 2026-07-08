import { beforeEach, describe, expect, it, vi } from "vitest";

const { messagesCreateMock, trackUsageMock } = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  trackUsageMock: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic-client")>();
  return {
    ...actual,
    getAnthropicClient: () => ({ messages: { create: messagesCreateMock } }),
    getModelName: () => "claude-test",
    getInferenceTimeoutMs: () => 5_000,
  };
});

vi.mock("@/lib/ai/token-tracker", () => ({
  trackUsage: trackUsageMock,
}));

import { generateDeepReport } from "../deep-report-generator";

function toolResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "submit_deep_report", input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

const baseParams = {
  relationshipStage: "after_first_date",
  meetingChannel: "blind_date",
  userGoal: "continue_chat",
  situationContext: "만남 뒤 답장이 짧아졌습니다.",
  overallSummary: "신호가 엇갈리는 상태입니다.",
  recommendedAction: "slow_down",
  recommendedActionReason: "연락 온도가 약합니다.",
  signalLines: ["caution/post_meeting_followup_caution: 연락 온도 주의 - 답장이 짧아짐"],
  referenceCases: [],
};

describe("generateDeepReport", () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    trackUsageMock.mockReset();
    trackUsageMock.mockResolvedValue(undefined);
  });

  it("returns validated report content from the tool response", async () => {
    messagesCreateMock.mockResolvedValue(
      toolResponse({
        patternSummary: "",
        cases: [],
        scenarios: [
          {
            actionLabel: "한 템포 쉬기",
            expectedFlow: "무리하지 않으면 부담이 줄어듭니다.",
            risk: "흐름이 자연 소멸할 수 있습니다.",
            bestMessage: "요즘 바쁘죠? 편할 때 얘기해요.",
            timing: "2~3일 뒤",
            confidence: "medium",
          },
          {
            actionLabel: "가볍게 안부 보내기",
            expectedFlow: "짧은 안부는 반응 온도를 확인하게 해줍니다.",
            risk: "짧은 답장만 돌아올 수 있습니다.",
            bestMessage: "오늘 날씨 좋던데 잘 지내요?",
            timing: "지금 바로",
            confidence: "medium",
          },
        ],
      }),
    );

    const report = await generateDeepReport(baseParams);

    expect(report.similarCases).toBeNull();
    expect(report.scenarios).toHaveLength(2);
    expect(report.scenarios[0].actionLabel).toBe("한 템포 쉬기");
    expect(trackUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "deep_report_generator",
        inputTokens: 10,
        outputTokens: 10,
        timeoutMs: 5_000,
        success: true,
      }),
    );
  });

  it("throws when scenarios are missing so the caller can fall back", async () => {
    messagesCreateMock.mockResolvedValue(
      toolResponse({ patternSummary: "", cases: [], scenarios: [] }),
    );

    await expect(generateDeepReport(baseParams)).rejects.toThrow();
    expect(trackUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "deep_report_generator",
        success: false,
      }),
    );
  });
});
