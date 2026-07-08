import { describe, expect, it } from "vitest";
import { buildFallbackDeepReport, DRAFT_CHECK_LIMIT } from "../deep-report";
import type { ReferenceCaseHit } from "../ai/embeddings/reference-search";

const hits: ReferenceCaseHit[] = [
  {
    id: "ref-1",
    summaryText: "소개팅 후 상대 답장이 느려졌지만 일주일 뒤 자연스럽게 재개된 사례",
    situationType: "after_first_date",
    outcomeLabel: "progressed",
    lesson: "답장 속도보다 내용의 온도를 보는 편이 정확했다",
    similarity: 0.83,
  },
];

describe("buildFallbackDeepReport", () => {
  it("builds a partial report from reference hits and recommended action", () => {
    const report = buildFallbackDeepReport({
      recommendedAction: "slow_down",
      recommendedActionReason: "만남 뒤 연락 온도가 약해 보입니다.",
      referenceCases: hits,
    });

    expect(report.similarCases?.cases).toHaveLength(1);
    expect(report.similarCases?.cases[0].outcome).toBe("progressed");
    expect(report.scenarios).toHaveLength(1);
    expect(report.scenarios[0].confidence).toBe("low");
    expect(report.scenarios[0].expectedFlow).toContain("만남 뒤 연락 온도가 약해 보입니다.");
  });

  it("returns null similarCases when there are no reference hits", () => {
    const report = buildFallbackDeepReport({
      recommendedAction: "keep_light",
      recommendedActionReason: "흐름이 나쁘지 않습니다.",
      referenceCases: [],
    });

    expect(report.similarCases).toBeNull();
    expect(report.scenarios).toHaveLength(1);
  });

  it("exports the draft check limit", () => {
    expect(DRAFT_CHECK_LIMIT).toBe(5);
  });
});
