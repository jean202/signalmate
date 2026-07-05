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
