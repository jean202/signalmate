import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("analysis experience deep analysis preview", () => {
  it("renders the paid deep analysis preview contract in the result view", () => {
    const source = readFileSync(join(process.cwd(), "components/analysis-experience.tsx"), "utf8");

    expect(source).toContain("styles.deepPreviewCard");
    expect(source).toContain("유사 사례 비교");
    expect(source).toContain("행동 시나리오 시뮬레이션");
    expect(source).toContain("초안 메시지 검증 5회");
    expect(source).toContain('purchaseType="single_analysis"');
  });

  it("defines styles for the deep analysis preview card", () => {
    const css = readFileSync(
      join(process.cwd(), "components/analysis-experience.module.css"),
      "utf8",
    );

    expect(css).toContain(".deepPreviewCard");
    expect(css).toContain(".deepPreviewList");
    expect(css).toContain(".deepPreviewNote");
  });
});
