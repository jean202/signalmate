import { describe, expect, it } from "vitest";
import { formatTrace, type TraceResult } from "./format-trace";

const trace: TraceResult = {
  captureId: "example-0000",
  parsed: { messageCount: 4, selfCount: 2, otherCount: 2 },
  ruleSignals: {
    signals: [
      {
        signalType: "positive",
        signalKey: "warm_tone",
        title: "따뜻한 톤",
        description: "이모지와 호응이 이어집니다.",
        confidenceLevel: "medium",
      },
    ],
    baselineScores: {
      otherInitiative: 60,
      responseCadence: 70,
      questionReciprocity: 55,
      schedulingCommitment: 80,
      overall: 66,
    },
    recommendedAction: "suggest_date",
    recommendedActionReason: "약속 흐름이 살아있습니다.",
    confidenceLevel: "medium",
    summary: "1개 시그널 감지",
  },
};

describe("formatTrace", () => {
  it("renders capture id, parse stats, and each signal", () => {
    const md = formatTrace(trace);
    expect(md).toContain("# Trace: example-0000");
    expect(md).toContain("메시지 4개 (나: 2, 상대: 2)");
    expect(md).toContain("warm_tone");
    expect(md).toContain("따뜻한 톤");
    expect(md).toContain("overall: 66");
    expect(md).toContain("suggest_date");
  });

  it("leaves a blank '내 코멘트' line per stage for the learner to fill", () => {
    const md = formatTrace(trace);
    expect(md).toContain("내 코멘트:");
  });
});
