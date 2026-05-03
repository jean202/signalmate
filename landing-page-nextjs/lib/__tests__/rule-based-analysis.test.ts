import { describe, it, expect } from "vitest";
import { buildRuleBasedAnalysis } from "../rule-based-analysis";
import type { StoredConversation } from "../analysis-store";

function makeConversation(
  messages: { role: "self" | "other"; text: string }[],
  overrides?: Partial<StoredConversation>,
): StoredConversation {
  return {
    id: "test-conv-1",
    title: "테스트 대화",
    sourceType: "manual",
    relationshipStage: "after_first_date",
    meetingChannel: "blind_date",
    userGoal: "evaluate_interest",
    saveMode: "temporary",
    rawText: messages.map((m) => `${m.role === "self" ? "나" : "상대"}: ${m.text}`).join("\n"),
    situationContext: null,
    messages: messages.map((m, i) => ({
      senderRole: m.role,
      messageText: m.text,
      sentAt: null,
      sequenceNo: i + 1,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildRuleBasedAnalysis", () => {
  it("returns completed analysis with signals and recommendations", () => {
    const conversation = makeConversation([
      { role: "self", text: "오늘 잘 들어갔어요?" },
      { role: "other", text: "네 덕분에요 :) 오늘 얘기했던 전시 생각나네요." },
      { role: "self", text: "저도요. 생각보다 더 좋았어요." },
      { role: "other", text: "다음에 비슷한 곳 또 가도 재밌을 것 같아요." },
      { role: "self", text: "이번 주말은 어떠세요?" },
      { role: "other", text: "이번 주말은 조금 애매한데, 다음 주는 괜찮을 것 같아요." },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.analysisStatus).toBe("completed");
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.overallSummary).toBeTruthy();
    expect(result.conversationId).toBe("test-conv-1");
  });

  it("detects positive signals from responsive conversation", () => {
    const conversation = makeConversation([
      { role: "self", text: "안녕하세요!" },
      { role: "other", text: "안녕하세요! 반갑습니다 😊" },
      { role: "self", text: "프로필 사진 멋지더라요" },
      { role: "other", text: "감사해요! 저도 사진 보고 호감이었어요 ㅎㅎ" },
      { role: "self", text: "커피 좋아하세요?" },
      { role: "other", text: "네! 다음에 같이 가도 좋겠어요" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.positiveSignalCount).toBeGreaterThan(0);
    const positiveSignals = result.signals.filter((s) => s.signalType === "positive");
    expect(positiveSignals.length).toBeGreaterThan(0);
  });

  it("detects caution signals from hedging conversation", () => {
    const conversation = makeConversation([
      { role: "self", text: "주말에 만날까요?" },
      { role: "other", text: "음 주말은 좀 바빠서... 나중에 봐야 할 것 같아요" },
      { role: "self", text: "다음 주는요?" },
      { role: "other", text: "다음 주도 좀 애매한데 일정 확인해볼게요" },
      { role: "self", text: "알겠어요! 편할 때 연락주세요" },
      { role: "other", text: "네 감사해요" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    const cautionSignals = result.signals.filter((s) => s.signalType === "caution");
    expect(cautionSignals.length).toBeGreaterThan(0);
  });

  it("handles minimal conversation", () => {
    const conversation = makeConversation([
      { role: "self", text: "안녕" },
      { role: "other", text: "응" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.analysisStatus).toBe("completed");
    expect(result.confidenceLevel).toBe("low");
  });

  it("assigns correct signal counts", () => {
    const conversation = makeConversation([
      { role: "self", text: "오늘 잘 들어갔어요?" },
      { role: "other", text: "네! 덕분에 즐거웠어요 😊" },
      { role: "self", text: "다음에 또 만나요" },
      { role: "other", text: "좋아요! 다음 주 토요일 어때요?" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    const positive = result.signals.filter((s) => s.signalType === "positive").length;
    const ambiguous = result.signals.filter((s) => s.signalType === "ambiguous").length;
    const caution = result.signals.filter((s) => s.signalType === "caution").length;

    expect(result.positiveSignalCount).toBe(positive);
    expect(result.ambiguousSignalCount).toBe(ambiguous);
    expect(result.cautionSignalCount).toBe(caution);
  });

  it("generates recommendations based on user goal", () => {
    const conversation = makeConversation(
      [
        { role: "self", text: "오늘 재밌었어요" },
        { role: "other", text: "저도요! 다음에 또 봐요" },
      ],
      { userGoal: "ask_for_date" },
    );

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    result.recommendations.forEach((rec) => {
      expect(rec.title).toBeTruthy();
      expect(rec.content).toBeTruthy();
      expect(rec.rationale).toBeTruthy();
    });
  });
});
