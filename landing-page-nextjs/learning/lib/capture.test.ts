import { describe, expect, it } from "vitest";
import { captureToConversation, type Capture } from "./capture";

const baseCapture: Capture = {
  id: "0001",
  source: "데이팅앱 A",
  context: { job: "대기업 / 사무직", residence: "수도권 번화가" },
  relationshipStage: "after_first_date",
  messages: [
    { sender: "them", text: "나 [직장] 근처 카페 자주 가ㅋㅋ" },
    { sender: "me", text: "오 거기 좋은 데 있어?" },
  ],
};

describe("captureToConversation", () => {
  it("maps sender me/them to self/other and preserves order", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.messages.map((m) => m.senderRole)).toEqual(["other", "self"]);
    expect(convo.messages.map((m) => m.messageText)).toEqual([
      "나 [직장] 근처 카페 자주 가ㅋㅋ",
      "오 거기 좋은 데 있어?",
    ]);
    expect(convo.messages.map((m) => m.sequenceNo)).toEqual([1, 2]);
  });

  it("folds context block into situationContext", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.situationContext).toContain("job: 대기업 / 사무직");
    expect(convo.situationContext).toContain("residence: 수도권 번화가");
  });

  it("uses relationshipStage from capture and defaults the rest", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.relationshipStage).toBe("after_first_date");
    expect(convo.meetingChannel).toBe("dating_app");
    expect(convo.userGoal).toBe("build_rapport");
  });

  it("leaves situationContext null when no context provided", () => {
    const convo = captureToConversation({ id: "x", relationshipStage: "unknown", messages: [] });
    expect(convo.situationContext).toBeNull();
  });

  it("keeps the capture's own id and uses source as title", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.id).toBe("0001");
    expect(convo.title).toBe("데이팅앱 A");
  });
});
