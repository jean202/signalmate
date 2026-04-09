import { describe, it, expect } from "vitest";
import { parseChatText } from "../chat-parser";

describe("parseChatText", () => {
  describe("KakaoTalk Korean format", () => {
    it("parses standard KakaoTalk export", () => {
      const raw = `
--------------- 2026년 3월 15일 토요일 ---------------
2026년 3월 15일 오후 2:30, 진하 : 안녕하세요
2026년 3월 15일 오후 2:31, 수연 : 안녕! 오랜만이다
2026년 3월 15일 오후 2:32, 진하 : 요즘 어떻게 지내?
      `.trim();

      const result = parseChatText(raw, "진하");

      expect(result.detectedFormat).toBe("kakaotalk-kr");
      expect(result.messages).toHaveLength(3);
      expect(result.selfName).toBe("진하");

      expect(result.messages[0].senderRole).toBe("self");
      expect(result.messages[0].senderName).toBe("진하");
      expect(result.messages[0].messageText).toBe("안녕하세요");

      expect(result.messages[1].senderRole).toBe("other");
      expect(result.messages[1].senderName).toBe("수연");

      expect(result.messages[0].sentAt).toMatch(/2026-03-15T14:30/);
    });

    it("handles AM times correctly", () => {
      const raw = "2026년 3월 15일 오전 9:05, 진하 : 좋은 아침";

      const result = parseChatText(raw);

      expect(result.messages[0].sentAt).toMatch(/T09:05/);
    });

    it("skips system messages", () => {
      const raw = `
진하님이 들어왔습니다.
2026년 3월 15일 오후 2:30, 진하 : 안녕
수연님을 초대했습니다.
      `.trim();

      const result = parseChatText(raw);

      expect(result.messages).toHaveLength(1);
    });
  });

  describe("KakaoTalk bracket format", () => {
    it("parses bracket format messages", () => {
      const raw = `
--------------- 2026년 3월 15일 토요일 ---------------
[진하] [오후 2:30] 안녕하세요
[수연] [오후 2:31] 안녕! 오랜만이다
      `.trim();

      const result = parseChatText(raw, "진하");

      expect(result.detectedFormat).toBe("kakaotalk-bracket");
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].senderName).toBe("진하");
      expect(result.messages[0].senderRole).toBe("self");
      expect(result.messages[0].sentAt).toMatch(/2026-03-15T14:30/);
    });
  });

  describe("KakaoTalk English format", () => {
    it("parses English KakaoTalk export", () => {
      const raw = `
2026. 3. 15. 2:30 PM, Jinha : hello
2026. 3. 15. 2:31 PM, Suyeon : hi there
      `.trim();

      const result = parseChatText(raw, "Jinha");

      expect(result.detectedFormat).toBe("kakaotalk-en");
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].senderRole).toBe("self");
      expect(result.messages[0].sentAt).toMatch(/2026-03-15T14:30/);
    });
  });

  describe("Simple name:message format", () => {
    it("parses basic name: message lines", () => {
      const raw = `
진하: 안녕
수연: 안녕! 뭐해?
진하: 일하고 있어
      `.trim();

      const result = parseChatText(raw, "진하");

      expect(result.detectedFormat).toBe("simple");
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].senderRole).toBe("self");
      expect(result.messages[1].senderRole).toBe("other");
    });
  });

  describe("Generic time format", () => {
    it("parses [time] name: message format", () => {
      const raw = `
[14:30] 진하: 안녕
[14:31] 수연: 안녕!
      `.trim();

      const result = parseChatText(raw, "진하");

      expect(result.detectedFormat).toBe("generic-time");
      expect(result.messages).toHaveLength(2);
    });
  });

  describe("sender role assignment", () => {
    it("assigns self to the more frequent sender when no hint given", () => {
      const raw = `
진하: 안녕
수연: 응
진하: 뭐해?
진하: 밥 먹었어?
      `.trim();

      const result = parseChatText(raw);

      expect(result.selfName).toBe("진하");
      expect(result.messages[0].senderRole).toBe("self");
      expect(result.messages[1].senderRole).toBe("other");
    });

    it("uses selfNameHint when provided", () => {
      const raw = `
진하: 안녕
수연: 응
      `.trim();

      const result = parseChatText(raw, "수연");

      expect(result.selfName).toBe("수연");
      expect(result.messages[0].senderRole).toBe("other");
      expect(result.messages[1].senderRole).toBe("self");
    });
  });

  describe("multiline messages", () => {
    it("appends continuation lines to previous message", () => {
      const raw = `
진하: 안녕
오랜만이야
잘 지냈어?
수연: 응 잘 지냈어
      `.trim();

      const result = parseChatText(raw);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].messageText).toBe("안녕\n오랜만이야\n잘 지냈어?");
      expect(result.messages[1].messageText).toBe("응 잘 지냈어");
    });
  });

  describe("edge cases", () => {
    it("returns empty result for blank input", () => {
      const result = parseChatText("");

      expect(result.messages).toHaveLength(0);
      expect(result.detectedFormat).toBe("unrecognized");
    });

    it("returns empty result for unrecognizable input", () => {
      const result = parseChatText("just some random text\nwithout any structure");

      expect(result.messages).toHaveLength(0);
    });

    it("handles mixed empty lines", () => {
      const raw = `
진하: 안녕

수연: 응

      `.trim();

      const result = parseChatText(raw);

      expect(result.messages).toHaveLength(2);
    });
  });
});
