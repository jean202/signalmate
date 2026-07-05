import { describe, it, expect } from "vitest";
import {
  formatStageBaseline,
  buildSignalEnhancerUserPrompt,
  buildRecommendationUserPrompt,
} from "../prompts/index";

describe("formatStageBaseline", () => {
  it("returns baseline block for before_meeting", () => {
    const result = formatStageBaseline("before_meeting");
    expect(result).toContain("이 단계의 정상 패턴");
    expect(result).toContain("첫 만남 전");
  });

  it("returns baseline block for after_first_date", () => {
    const result = formatStageBaseline("after_first_date");
    expect(result).toContain("24시간");
  });

  it("returns baseline block for after_second_date", () => {
    const result = formatStageBaseline("after_second_date");
    expect(result).toContain("질문을 돌려주는");
  });

  it("returns baseline block for cooling_down", () => {
    const result = formatStageBaseline("cooling_down");
    expect(result).toContain("냉각");
  });

  it("falls back gracefully for unknown stage", () => {
    const result = formatStageBaseline("unknown");
    expect(result).toContain("이 단계의 정상 패턴");
  });
});

describe("buildSignalEnhancerUserPrompt includes stage baseline", () => {
  it("includes stage baseline when relationshipStage is provided", () => {
    const prompt = buildSignalEnhancerUserPrompt({
      rawText: "나: 안녕\n상대: 안녕",
      relationshipStage: "after_second_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      signals: [],
    });
    expect(prompt).toContain("이 단계의 정상 패턴");
  });
});

describe("situation-first prompt wording", () => {
  it("labels raw input as situation input for signal enhancement", () => {
    const prompt = buildSignalEnhancerUserPrompt({
      rawText: "어제 만났고 이후 답장이 짧아졌습니다.",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      situationContext: "입력은 실제 만남 후기 중심입니다.",
      signals: [
        {
          signalType: "caution",
          signalKey: "post_meeting_followup_caution",
          title: "만남 뒤 연락 온도 주의",
          description: "답장이 짧아졌습니다.",
          evidenceText: "답장이 짧아짐",
          confidenceLevel: "medium",
        },
      ],
    });

    expect(prompt).toContain("## 상황 원문");
    expect(prompt).toContain("채팅이 없거나 적어도");
    expect(prompt).toContain("입력은 실제 만남 후기 중심입니다.");
  });

  it("asks recommendation generation to use meeting and follow-up context", () => {
    const prompt = buildRecommendationUserPrompt({
      rawText: "어제 만났고 이후 답장이 짧아졌습니다.",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      situationContext: "만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다.",
      recommendedAction: "slow_down",
      recommendedActionReason: "만남 뒤 연락 온도가 약합니다.",
      overallSummary: "좋은 신호와 조심할 신호가 섞여 있습니다.",
      signals: [{ signalType: "caution", signalKey: "post_meeting_followup_caution", title: "연락 온도 주의" }],
    });

    expect(prompt).toContain("실제 만남");
    expect(prompt).toContain("만남 뒤 연락");
    expect(prompt).toContain("채팅 원문만");
  });
});
