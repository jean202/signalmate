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

import { checkDraft } from "../draft-checker";

describe("checkDraft", () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
    trackUsageMock.mockReset();
    trackUsageMock.mockResolvedValue(undefined);
  });

  it("returns validated draft check result", async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_draft_check",
          input: {
            predictedReaction: "짧은 답장이 돌아올 가능성이 있어요.",
            riskLevel: "medium",
            risks: ["확인 요구형 문장이 부담을 줄 수 있어요."],
            improvedDraft: "요즘 바쁘죠? 편할 때 얘기해요.",
            rationale: "부담을 줄이면서 대화 여지를 남깁니다.",
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await checkDraft({
      draftText: "왜 요즘 답장이 늦어요?",
      overallSummary: "신호가 엇갈리는 상태입니다.",
      recommendedAction: "slow_down",
      situationContext: null,
    });

    expect(result.riskLevel).toBe("medium");
    expect(result.improvedDraft).toContain("편할 때");
    expect(trackUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "draft_checker",
        inputTokens: 5,
        outputTokens: 5,
        timeoutMs: 5_000,
        success: true,
      }),
    );
  });

  it("rejects invalid risk level payloads", async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_draft_check",
          input: {
            predictedReaction: "",
            riskLevel: "extreme",
            risks: [],
            improvedDraft: "",
            rationale: "",
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await expect(
      checkDraft({
        draftText: "안녕",
        overallSummary: "요약",
        recommendedAction: "keep_light",
        situationContext: null,
      }),
    ).rejects.toThrow();
    expect(trackUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "draft_checker",
        success: false,
      }),
    );
  });
});
