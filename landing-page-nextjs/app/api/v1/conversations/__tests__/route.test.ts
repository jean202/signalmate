import { beforeEach, describe, expect, it, vi } from "vitest";

const createConversationMock = vi.fn();

vi.mock("@/lib/store", () => ({
  createConversation: createConversationMock,
}));

vi.mock("@/lib/auth-helpers", () => ({
  getCurrentUserId: vi.fn(async () => null),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/v1/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/conversations", () => {
  beforeEach(() => {
    createConversationMock.mockReset();
    createConversationMock.mockImplementation(async (input) => ({
      id: "conv_1",
      saveMode: input.saveMode ?? "temporary",
      relationshipStage: input.relationshipStage,
      meetingChannel: input.meetingChannel,
      userGoal: input.userGoal,
      rawText: input.rawText,
      situationContext: input.situationContext,
      messages: input.messages,
    }));
  });

  it.each([
    ["null", null],
    ["array", []],
    ["string", "invalid"],
    ["number", 42],
  ])("rejects top-level %s JSON without throwing", async (_label, invalidBody) => {
    const { POST } = await import("../route");
    const response = await POST(request(invalidBody));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(["INVALID_JSON", "VALIDATION_ERROR"]).toContain(payload.error.code);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("keeps nullable situation fields compatible", async () => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      situationContext: null,
      guidedAnswers: null,
    }));

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(expect.objectContaining({
      situationContext: null,
    }));
  });

  it.each([
    [2000, 201],
    [2001, 400],
  ])("validates top-level situationContext length %i", async (length, expectedStatus) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      messages: [],
      situationContext: "가".repeat(length),
    }));

    expect(response.status).toBe(expectedStatus);
    expect(createConversationMock).toHaveBeenCalledTimes(expectedStatus === 201 ? 1 : 0);
  });

  it.each([
    ["inputFocus", { inputFocus: "invalid" }],
    ["meetingCount", { meetingCount: "invalid" }],
    ["meetingVibe", { meetingVibe: "invalid" }],
    ["otherInitiative", { otherInitiative: "invalid" }],
    ["afterMeetingContact", { afterMeetingContact: "invalid" }],
    ["desiredHelp", { desiredHelp: "invalid" }],
    ["otherStyle", { otherStyle: ["invalid"] }],
  ])("rejects invalid guided enum %s", async (_field, guidedAnswers) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      guidedAnswers,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["rawText number", { rawText: 42 }],
    ["title number", { title: 42 }],
    ["sourceType object", { sourceType: {} }],
    ["selfName array", { selfName: [] }],
    ["messages object", { messages: {} }],
    ["saveMode object", { saveMode: {} }],
    ["saveMode invalid enum", { saveMode: "forever" }],
  ])("rejects invalid top-level field: %s", async (_label, invalidField) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      ...invalidField,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["relationshipStage", { relationshipStage: 42 }],
    ["relationshipStage empty", { relationshipStage: "" }],
    ["relationshipStage whitespace", { relationshipStage: "   " }],
    ["meetingChannel", { meetingChannel: {} }],
    ["userGoal", { userGoal: [] }],
  ])("rejects invalid required field: %s", async (_label, invalidField) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      ...invalidField,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["relationshipStage", { relationshipStage: "unknown_stage" }],
    ["meetingChannel", { meetingChannel: "unknown_channel" }],
    ["userGoal", { userGoal: "unknown_goal" }],
  ])("rejects unknown required enum: %s", async (_label, invalidField) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      ...invalidField,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["relationshipStage", [
      "before_meeting", "after_first_date", "after_second_date", "ongoing_chat", "cooling_down",
    ]],
    ["meetingChannel", [
      "blind_date", "dating_app", "marriage_agency", "mutual_friend", "other",
    ]],
    ["userGoal", [
      "continue_chat", "ask_for_date", "evaluate_interest", "decide_to_stop",
    ]],
  ] as const)("accepts every Prisma enum value for %s", async (field, values) => {
    const { POST } = await import("../route");
    for (const value of values) {
      createConversationMock.mockClear();
      const response = await POST(request({
        relationshipStage: "before_meeting",
        meetingChannel: "dating_app",
        userGoal: "continue_chat",
        rawText: "나: 안녕하세요\n상대: 반가워요",
        [field]: value,
      }));

      expect(response.status).toBe(201);
      expect(createConversationMock).toHaveBeenCalledTimes(1);
    }
  });

  it.each([
    ["null message", [null]],
    ["array message", [[]]],
    ["senderRole number", [{ senderRole: 1 }]],
    ["senderRole invalid enum", [{ senderRole: "me" }]],
    ["messageText number", [{ messageText: 42 }]],
    ["sentAt object", [{ sentAt: {} }]],
    ["sequenceNo string", [{ sequenceNo: "1" }]],
    ["sequenceNo decimal", [{ sequenceNo: 1.5 }]],
  ])("rejects invalid message input: %s", async (_label, messages) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      messages,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid date text", [{ messageText: "안녕", sentAt: "not-a-date", sequenceNo: 1 }]],
    ["empty date text", [{ messageText: "안녕", sentAt: "", sequenceNo: 1 }]],
    ["normalized calendar date", [{ messageText: "안녕", sentAt: "2026-02-30", sequenceNo: 1 }]],
    ["non-leap February 29", [{ messageText: "안녕", sentAt: "2025-02-29T12:00:00Z", sequenceNo: 1 }]],
    ["hour 25", [{ messageText: "안녕", sentAt: "2026-03-27T25:00:00Z", sequenceNo: 1 }]],
    ["minute 60", [{ messageText: "안녕", sentAt: "2026-03-27T23:60:00Z", sequenceNo: 1 }]],
    ["second 60", [{ messageText: "안녕", sentAt: "2026-03-27T23:59:60Z", sequenceNo: 1 }]],
    ["offset beyond ISO range", [{ messageText: "안녕", sentAt: "2026-03-27T23:59:59+14:01", sequenceNo: 1 }]],
    ["above Prisma Int max", [{ messageText: "안녕", sequenceNo: 2147483648 }]],
    ["below Prisma Int min", [{ messageText: "안녕", sequenceNo: -2147483649 }]],
  ])("rejects DB-unsafe message value: %s", async (_label, messages) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      messages,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it.each([
    ["explicit duplicate", [
      { messageText: "첫 번째", sequenceNo: 7 },
      { messageText: "두 번째", sequenceNo: 7 },
    ]],
    ["explicit and fallback collision", [
      { messageText: "첫 번째", sequenceNo: 2 },
      { messageText: "두 번째" },
    ]],
  ])("rejects normalized duplicate sequenceNo: %s", async (_label, messages) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      messages,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("accepts valid date strings, Prisma Int boundaries, and unique sequence numbers", async () => {
    const { POST } = await import("../route");
    const messages = [
      {
        senderRole: "self",
        messageText: "최솟값 순번",
        sentAt: "2024-02-29T23:59:59Z",
        sequenceNo: -2147483648,
      },
      {
        senderRole: "other",
        messageText: "최댓값 순번",
        sentAt: "2026-03-27T20:10:00+09:00",
        sequenceNo: 2147483647,
      },
    ];
    const response = await POST(request({
      relationshipStage: "ongoing_chat",
      meetingChannel: "marriage_agency",
      userGoal: "evaluate_interest",
      messages,
    }));

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(expect.objectContaining({ messages }));
  });

  it("keeps a real ISO calendar date without time compatible", async () => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      messages: [{ messageText: "날짜만 저장", sentAt: "2024-02-29", sequenceNo: 1 }],
    }));

    expect(response.status).toBe(201);
  });

  it.each([
    ["Korean line date", [
      "2026년 2월 30일 오후 2:30, 나 : 안녕하세요",
      "2026년 2월 30일 오후 2:31, 상대 : 반가워요",
    ].join("\n")],
    ["bracket date header", [
      "--------------- 2026년 2월 30일 월요일 ---------------",
      "[나] [오후 2:30] 안녕하세요",
      "[상대] [오후 2:31] 반가워요",
    ].join("\n")],
    ["English line date", [
      "2026. 2. 30. 2:30 PM, Me : hello",
      "2026. 2. 30. 2:31 PM, Other : hi",
    ].join("\n")],
  ])("rejects invalid %s after rawText parsing", async (_label, rawText) => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText,
    }));

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("keeps null optional fields and null message selections compatible", async () => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      title: null,
      sourceType: null,
      rawText: null,
      selfName: null,
      situationContext: null,
      guidedAnswers: null,
      saveMode: null,
      messages: [{
        senderRole: null,
        messageText: "안녕하세요",
        sentAt: null,
        sequenceNo: null,
      }],
    }));

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(expect.objectContaining({
      title: null,
      sourceType: "manual",
      rawText: "",
      saveMode: "temporary",
      messages: [{
        senderRole: "unknown",
        messageText: "안녕하세요",
        sentAt: null,
        sequenceNo: 1,
      }],
    }));
  });

  it("treats null messages as omitted when rawText is valid", async () => {
    const { POST } = await import("../route");
    const response = await POST(request({
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      rawText: "나: 안녕하세요\n상대: 반가워요",
      messages: null,
    }));

    expect(response.status).toBe(201);
  });

  it("creates a conversation from situation-only meeting text", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        saveMode: "temporary",
        rawText:
          "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아져서 더 연락해도 될지 고민입니다.",
        guidedAnswers: {
          inputFocus: "meeting_note",
          meetingCount: "once",
          meetingVibe: "normal",
          afterMeetingContact: "slower",
          desiredHelp: "wait_or_send",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText:
          "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아져서 더 연락해도 될지 고민입니다.",
        messages: [],
        situationContext: expect.stringContaining("입력은 실제 만남 후기 중심입니다"),
      }),
    );

    const payload = await response.json();
    expect(payload.data.conversation.messageCount).toBe(0);
  });

  it("creates a conversation from situationContext only without chat messages", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        situationContext:
          "소개팅에서 처음 만났는데 분위기는 괜찮았고, 만남 뒤에는 상대 답장이 조금 느려져서 먼저 다시 연락해도 될지 고민입니다.",
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: "",
        messages: [],
        situationContext:
          "소개팅에서 처음 만났는데 분위기는 괜찮았고, 만남 뒤에는 상대 답장이 조금 느려져서 먼저 다시 연락해도 될지 고민입니다.",
      }),
    );
  });

  it("accepts long top-level situationContext without marker terms", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        situationContext: "서로의 기대와 이후 방향이 조금 달라 보여서 판단이 어렵고 어떻게 움직여야 할지 고민입니다.",
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: "",
        messages: [],
        situationContext: "서로의 기대와 이후 방향이 조금 달라 보여서 판단이 어렵고 어떻게 움직여야 할지 고민입니다.",
      }),
    );
  });

  it("creates a conversation from structured guided answers only", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        guidedAnswers: {
          inputFocus: "follow_up",
          meetingVibe: "good",
          afterMeetingContact: "slower",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rawText: "",
        messages: [],
        situationContext: expect.stringContaining("만났을 때 분위기는 좋았습니다"),
      }),
    );
  });

  it("respects explicit empty messages without reparsing rawText", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        rawText: "나: 오늘 잘 들어갔어요?\n상대: 네, 잘 들어갔어요.",
        messages: [],
        guidedAnswers: {
          inputFocus: "follow_up",
          meetingVibe: "good",
          afterMeetingContact: "slower",
          freeText: "답장이 갑자기 짧아졌어요.",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [],
        situationContext: expect.stringContaining("답장이 갑자기 짧아졌어요."),
      }),
    );
  });

  it("does not duplicate free-text notes when the same note is sent in both fields", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        rawText: "어제 만나고 나서 답장이 짧아졌어요.",
        messages: [],
        situationContext: "답장이 갑자기 짧아졌어요.",
        guidedAnswers: {
          inputFocus: "follow_up",
          meetingVibe: "good",
          afterMeetingContact: "slower",
          freeText: "답장이 갑자기 짧아졌어요.",
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [],
        situationContext:
          "입력은 만남 뒤 연락 흐름 중심입니다. 만났을 때 분위기는 좋았습니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다. 답장이 갑자기 짧아졌어요.",
      }),
    );
  });

  it("keeps rejecting short non-chat input", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        rawText: "만났어",
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("rejects short top-level situationContext without chat messages", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        situationContext: "판단이 어려워요",
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("rejects overlong merged situationContext instead of truncating it", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        situationContext: "가".repeat(2100),
        guidedAnswers: {
          inputFocus: "follow_up",
          afterMeetingContact: "slower",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("rejects overlong guided freeText instead of truncating it before validation", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        guidedAnswers: {
          inputFocus: "follow_up",
          afterMeetingContact: "slower",
          freeText: "가".repeat(2100),
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 2000 guided freeText characters plus generated guidance", async () => {
    const { POST } = await import("../route");
    const freeText = "가".repeat(2000);
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        guidedAnswers: {
          inputFocus: "meeting_note",
          meetingCount: "once",
          meetingVibe: "good",
          afterMeetingContact: "ongoing",
          desiredHelp: "next_message",
          freeText,
        },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(expect.objectContaining({
      situationContext: expect.stringContaining(freeText),
    }));
    const stored = createConversationMock.mock.calls[0]?.[0].situationContext as string;
    expect(stored.length).toBeGreaterThan(2000);
  });

  it.each([
    ["non-string top-level situationContext", { situationContext: 42 }],
    ["non-object guidedAnswers", { guidedAnswers: "meeting_note" }],
    ["non-string guided freeText", { guidedAnswers: { inputFocus: "meeting_note", freeText: 42 } }],
    ["non-array guided otherStyle", { guidedAnswers: { inputFocus: "meeting_note", otherStyle: "fast_reply" } }],
  ])("rejects %s without throwing", async (_label, invalidInput) => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
        ...invalidInput,
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("keeps rejecting completely empty input", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "continue_chat",
        messages: [],
      }),
    );

    expect(response.status).toBe(400);
    expect(createConversationMock).not.toHaveBeenCalled();
  });

  it("still creates a conversation from parsed chat messages", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({
        relationshipStage: "after_first_date",
        meetingChannel: "blind_date",
        userGoal: "evaluate_interest",
        rawText: "[오후 8:10] 나: 잘 들어갔어요?\n[오후 8:13] 상대: 네 덕분에요",
        guidedAnswers: { inputFocus: "chat" },
      }),
    );

    expect(response.status).toBe(201);
    expect(createConversationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ senderRole: "self" }),
          expect.objectContaining({ senderRole: "other" }),
        ]),
      }),
    );
  });
});
