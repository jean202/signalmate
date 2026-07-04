import { describe, expect, it } from "vitest";
import {
  buildMaskedCapture,
  maskText,
  parseChatText,
  parseManualReplacementRules,
} from "./mask-capture";

describe("maskText", () => {
  it("replaces obvious identifiers with broad tokens", () => {
    const result = maskText(
      "010-1234-5678 test@example.com https://example.com/profile @signal_123",
      [],
    );

    expect(result).toBe("[전화번호] [이메일] [URL] [SNS]");
  });

  it("applies manual literal replacements after automatic masking", () => {
    const result = maskText("나 삼성전자 근처 강남 카페 자주 가", [
      { from: "삼성전자", to: "[직장]" },
      { from: "강남", to: "[지명]" },
    ]);

    expect(result).toBe("나 [직장] 근처 [지명] 카페 자주 가");
  });
});

describe("parseManualReplacementRules", () => {
  it("parses from=to lines and reports malformed lines", () => {
    const result = parseManualReplacementRules([
      "삼성전자=[직장]",
      " 강남 = [지명] ",
      "잘못된 줄",
      "=[빈값]",
    ]);

    expect(result.rules).toEqual([
      { from: "삼성전자", to: "[직장]" },
      { from: "강남", to: "[지명]" },
    ]);
    expect(result.invalidLines).toEqual(["잘못된 줄", "=[빈값]"]);
  });
});

describe("parseChatText", () => {
  it("parses timestamped me/them chat lines and skips non-message lines", () => {
    const result = parseChatText(`
2026년 7월 4일 토요일
[오후 8:10] 나: 오늘 잘 들어갔어요?
[오후 8:12] 상대: 네 덕분에요 :)
미확인: 이 줄은 버림
`);

    expect(result.messages).toEqual([
      { sender: "me", text: "오늘 잘 들어갔어요?" },
      { sender: "them", text: "네 덕분에요 :)" },
    ]);
    expect(result.skippedLines).toEqual(["2026년 7월 4일 토요일", "미확인: 이 줄은 버림"]);
  });
});

describe("buildMaskedCapture", () => {
  it("returns a Capture draft with masked messages and defaults", () => {
    const result = buildMaskedCapture({
      id: "0004",
      source: "카카오톡 추출 텍스트",
      rawText: `
나: 삼성전자 근처 도착했어요 010-1234-5678
상대: 오 좋아요 강남에서 봐요
`,
      manualRules: [
        { from: "삼성전자", to: "[직장]" },
        { from: "강남", to: "[지명]" },
      ],
      context: {
        job: "대기업 / 사무직",
        location: "수도권 번화가",
      },
    });

    expect(result.capture).toEqual({
      id: "0004",
      source: "카카오톡 추출 텍스트",
      context: {
        job: "대기업 / 사무직",
        location: "수도권 번화가",
      },
      relationshipStage: "unknown",
      meetingChannel: "dating_app",
      userGoal: "build_rapport",
      messages: [
        { sender: "me", text: "[직장] 근처 도착했어요 [전화번호]" },
        { sender: "them", text: "오 좋아요 [지명]에서 봐요" },
      ],
    });
    expect(result.skippedLines).toEqual([]);
  });
});
