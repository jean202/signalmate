import { describe, expect, it } from "vitest";
import {
  resolveMessagesForAnalysisInput,
  shouldSendParsedMessages,
  type AnalysisInputMessage,
} from "../analysis-input";

function message(senderRole: AnalysisInputMessage["senderRole"]): AnalysisInputMessage {
  return {
    senderRole,
    messageText: "테스트 메시지",
    sentAt: null,
    sequenceNo: 1,
  };
}

describe("analysis input message contract", () => {
  it("does not send all-unknown parsed messages for meeting notes", () => {
    const messages = [message("unknown"), { ...message("unknown"), sequenceNo: 2 }];

    expect(shouldSendParsedMessages(messages, "meeting_note")).toBe(false);
    expect(resolveMessagesForAnalysisInput(messages, "meeting_note")).toEqual([]);
  });

  it("does not send all-unknown parsed messages for follow-up input", () => {
    const messages = [message("unknown"), { ...message("unknown"), sequenceNo: 2 }];

    expect(shouldSendParsedMessages(messages, "follow_up")).toBe(false);
    expect(resolveMessagesForAnalysisInput(messages, "follow_up")).toEqual([]);
  });

  it("keeps parsed messages for mixed input when a speaker is recognized", () => {
    const messages = [message("self"), { ...message("unknown"), sequenceNo: 2 }];

    expect(shouldSendParsedMessages(messages, "mixed")).toBe(true);
    expect(resolveMessagesForAnalysisInput(messages, "mixed")).toEqual(messages);
  });

  it("keeps parsed messages for chat-focused input", () => {
    const messages = [message("unknown"), { ...message("unknown"), sequenceNo: 2 }];

    expect(shouldSendParsedMessages(messages, "chat")).toBe(true);
    expect(resolveMessagesForAnalysisInput(messages, "chat")).toEqual(messages);
  });
});
