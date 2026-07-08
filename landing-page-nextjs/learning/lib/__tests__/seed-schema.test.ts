import { describe, expect, it } from "vitest";
import { validateSeedCase } from "../seed-schema";

const valid = {
  summaryText: "소개팅 후 상대 답장이 느려졌지만 일주일 뒤 자연스럽게 재개된 사례",
  situationType: "after_first_date",
  outcomeLabel: "progressed",
  lesson: "답장 속도보다 내용의 온도를 보는 편이 정확했다",
};

describe("validateSeedCase", () => {
  it("accepts a valid seed case", () => {
    expect(validateSeedCase(valid)).toEqual({ ok: true, value: valid });
  });

  it("rejects unknown outcome labels", () => {
    const result = validateSeedCase({ ...valid, outcomeLabel: "unknown" });
    expect(result.ok).toBe(false);
  });

  it("rejects short summaries", () => {
    const result = validateSeedCase({ ...valid, summaryText: "짧음" });
    expect(result.ok).toBe(false);
  });
});
