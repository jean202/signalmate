import { describe, expect, it } from "vitest";
import {
  buildAnalysisRequestInput,
  parseConversationMessages,
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

  it("extracts unmarked situation notes into guidedAnswers.freeText for mixed input", () => {
    const result = buildAnalysisRequestInput({
      rawText:
        "[오후 8:10] 나: 오늘 즐거웠어요.\n[오후 8:12] 상대: 저도요.\n카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.",
      inputFocus: "mixed",
      guidedAnswers: {
        inputFocus: "mixed",
        freeText: "이미 적어둔 메모",
      },
    });

    expect(result.messages).toEqual([
      {
        senderRole: "self",
        messageText: "오늘 즐거웠어요.",
        sentAt: null,
        sequenceNo: 1,
      },
      {
        senderRole: "other",
        messageText: "저도요.",
        sentAt: null,
        sequenceNo: 2,
      },
    ]);
    expect(result.guidedAnswers.freeText).toBe(
      "이미 적어둔 메모\n\n카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.",
    );
    expect("situationContext" in result).toBe(false);
  });

  it("keeps situation-only meeting notes as free-text evidence without messages", () => {
    const result = buildAnalysisRequestInput({
      rawText: "소개팅 분위기는 좋았는데 헤어진 뒤로 연락이 조금 뜸해졌어요.",
      inputFocus: "meeting_note",
      guidedAnswers: {
        inputFocus: "meeting_note",
      },
    });

    expect(result.messages).toEqual([]);
    expect(result.guidedAnswers.freeText).toBe(
      "소개팅 분위기는 좋았는데 헤어진 뒤로 연락이 조금 뜸해졌어요.",
    );
  });

  it("keeps situation-only follow-up text as free-text evidence without messages", () => {
    const result = buildAnalysisRequestInput({
      rawText: "만난 뒤에는 답장이 짧아져서 내가 더 보내야 할지 고민돼요.",
      inputFocus: "follow_up",
      guidedAnswers: {
        inputFocus: "follow_up",
        freeText: "보조 메모",
      },
    });

    expect(result.messages).toEqual([]);
    expect(result.guidedAnswers.freeText).toBe(
      "보조 메모\n\n만난 뒤에는 답장이 짧아져서 내가 더 보내야 할지 고민돼요.",
    );
  });

  it("preserves chat-focused continuation parsing", () => {
    const messages = parseConversationMessages("나: 오늘 어땠어요?\n사진도 잘 봤어요.\n상대: 저도 재밌었어요.");
    const result = buildAnalysisRequestInput({
      rawText: "나: 오늘 어땠어요?\n사진도 잘 봤어요.\n상대: 저도 재밌었어요.",
      inputFocus: "chat",
      guidedAnswers: {
        inputFocus: "chat",
      },
    });

    expect(messages[0]?.messageText).toBe("오늘 어땠어요?\n사진도 잘 봤어요.");
    expect(result.messages).toEqual(messages);
    expect(result.guidedAnswers.freeText).toBeUndefined();
  });
});
