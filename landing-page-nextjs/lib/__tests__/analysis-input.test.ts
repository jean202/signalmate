import { describe, expect, it } from "vitest";
import {
  buildAnalysisRequestInput,
  buildCreateConversationRequestBody,
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
  function buildMixedRequest(rawText: string) {
    return buildCreateConversationRequestBody({
      title: "직접 붙여넣은 대화",
      sourceType: "manual",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      saveMode: "temporary",
      rawText,
      inputFocus: "mixed",
      guidedAnswers: {
        inputFocus: "mixed",
      },
      selfName: "진하",
    });
  }

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

  it("builds the exact request body for mixed input without top-level situationContext", () => {
    const result = buildCreateConversationRequestBody({
      title: "직접 붙여넣은 대화",
      sourceType: "manual",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      saveMode: "temporary",
      rawText:
        "[오후 8:10] 나: 오늘 즐거웠어요.\n[오후 8:12] 상대: 저도요.\n카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.",
      inputFocus: "mixed",
      guidedAnswers: {
        inputFocus: "mixed",
        freeText: "이미 적어둔 메모",
      },
      selfName: "나",
    });

    expect(result).toEqual({
      title: "직접 붙여넣은 대화",
      sourceType: "manual",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      saveMode: "temporary",
      rawText:
        "[오후 8:10] 나: 오늘 즐거웠어요.\n[오후 8:12] 상대: 저도요.\n카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.",
      selfName: "나",
      messages: [
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
      ],
      guidedAnswers: {
        inputFocus: "mixed",
        freeText: "이미 적어둔 메모\n\n카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.",
      },
    });
    expect("situationContext" in result).toBe(false);
  });

  it("keeps simple name chat lines in mixed request bodies and routes unmarked notes to freeText", () => {
    const rawText = "진하: 오늘 즐거웠어요.\n수연: 저도요.\n카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.";

    const result = buildMixedRequest(rawText);

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
      "카페에서는 분위기가 좋았는데 집에 가서는 답장이 느려졌어요.",
    );
    expect(result.messages[1]?.messageText).toBe("저도요.");
    expect("situationContext" in result).toBe(false);
  });

  it("keeps generic [time] name chat lines in mixed request bodies and preserves notes separately", () => {
    const rawText = "[14:30] 진하: 오늘 즐거웠어요.\n[14:31] 수연: 저도요.\n상대가 애프터 이야기는 안 꺼냈어요.";

    const result = buildMixedRequest(rawText);

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
    expect(result.guidedAnswers.freeText).toBe("상대가 애프터 이야기는 안 꺼냈어요.");
    expect(result.messages[1]?.messageText).toBe("저도요.");
    expect("situationContext" in result).toBe(false);
  });

  it("keeps Kakao Korean export chat lines in mixed request bodies without leaking date headers into freeText", () => {
    const rawText = [
      "--------------- 2026년 3월 15일 토요일 ---------------",
      "2026년 3월 15일 오후 2:30, 진하 : 안녕하세요",
      "2026년 3월 15일 오후 2:31, 수연 : 안녕!",
      "만나고 나서 답장이 조금 느려졌어요.",
    ].join("\n");

    const result = buildMixedRequest(rawText);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.messageText).toBe("안녕하세요");
    expect(result.messages[1]?.messageText).toBe("안녕!");
    expect(result.guidedAnswers.freeText).toBe("만나고 나서 답장이 조금 느려졌어요.");
    expect(result.guidedAnswers.freeText).not.toContain("2026년 3월 15일");
    expect("situationContext" in result).toBe(false);
  });

  it("keeps Kakao bracket export chat lines in mixed request bodies without leaking date headers into freeText", () => {
    const rawText = [
      "--------------- 2026년 3월 15일 토요일 ---------------",
      "[진하] [오후 2:30] 안녕하세요",
      "[수연] [오후 2:31] 안녕!",
      "만남 뒤에는 제가 먼저 연락했어요.",
    ].join("\n");

    const result = buildMixedRequest(rawText);

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]?.messageText).toBe("안녕하세요");
    expect(result.messages[1]?.messageText).toBe("안녕!");
    expect(result.guidedAnswers.freeText).toBe("만남 뒤에는 제가 먼저 연락했어요.");
    expect(result.guidedAnswers.freeText).not.toContain("2026년 3월 15일");
    expect("situationContext" in result).toBe(false);
  });

  it("keeps colon-style situation notes as freeText when they do not form recognizable chat", () => {
    const rawText = "상황: 소개팅 분위기는 좋았는데 애프터 이야기는 없었어요.";

    const result = buildMixedRequest(rawText);

    expect(result.messages).toEqual([]);
    expect(result.guidedAnswers.freeText).toBe("상황: 소개팅 분위기는 좋았는데 애프터 이야기는 없었어요.");
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

  it("builds situation-only request body with empty messages", () => {
    const result = buildCreateConversationRequestBody({
      title: "직접 붙여넣은 대화",
      sourceType: "manual",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      saveMode: "temporary",
      rawText: "소개팅 분위기는 좋았는데 헤어진 뒤로 연락이 조금 뜸해졌어요.",
      inputFocus: "meeting_note",
      guidedAnswers: {
        inputFocus: "meeting_note",
      },
      selfName: "나",
    });

    expect(result.messages).toEqual([]);
    expect(result.guidedAnswers.freeText).toBe(
      "소개팅 분위기는 좋았는데 헤어진 뒤로 연락이 조금 뜸해졌어요.",
    );
    expect("situationContext" in result).toBe(false);
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

  it("builds chat-focused request body with continuation parsing preserved", () => {
    const result = buildCreateConversationRequestBody({
      title: "직접 붙여넣은 대화",
      sourceType: "manual",
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      saveMode: "temporary",
      rawText: "나: 오늘 어땠어요?\n사진도 잘 봤어요.\n상대: 저도 재밌었어요.",
      inputFocus: "chat",
      guidedAnswers: {
        inputFocus: "chat",
      },
      selfName: "나",
    });

    expect(result.messages).toEqual(
      parseConversationMessages("나: 오늘 어땠어요?\n사진도 잘 봤어요.\n상대: 저도 재밌었어요."),
    );
    expect(result.guidedAnswers.freeText).toBeUndefined();
    expect("situationContext" in result).toBe(false);
  });
});
