import { describe, it, expect } from "vitest";
import {
  formatStageBaseline,
  buildSignalEnhancerUserPrompt,
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
