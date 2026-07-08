import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("deep report page contract", () => {
  it("loads or generates a deep report and offers draft checks", () => {
    const source = readFileSync(join(process.cwd(), "app/report/[analysisId]/page.tsx"), "utf8");

    expect(source).toContain('"use client"');
    expect(source).toContain("심화 분석 리포트");
    expect(source).toContain("method: \"POST\"");
    expect(source).toContain("/deep-report/draft-check");
    expect(source).toContain("DRAFT_CHECK_LIMIT");
    expect(source).toContain("scenario.bestMessage ?");
    expect(source).toContain("/login?next=");
  });

  it("defines report page styles", () => {
    const css = readFileSync(
      join(process.cwd(), "app/report/[analysisId]/report.module.css"),
      "utf8",
    );

    expect(css).toContain(".page");
    expect(css).toContain(".fallbackNote");
    expect(css).toContain(".scenarioCard");
    expect(css).toContain(".draftInput");
  });
});
