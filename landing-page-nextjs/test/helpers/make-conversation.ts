import type { StoredConversation, StoredConversationMessage } from "../../lib/analysis-store";

type FixtureMessageInput = {
  senderRole: StoredConversationMessage["senderRole"];
  messageText: string;
  sentAt?: string | null;
};

type ConversationFixtureInput = {
  title?: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  rawText?: string;
  situationContext?: string | null;
  messages: FixtureMessageInput[];
};

export function makeConversationFixture(input: ConversationFixtureInput): StoredConversation {
  const messages: StoredConversationMessage[] = input.messages.map((message, index) => ({
    senderRole: message.senderRole,
    messageText: message.messageText,
    sentAt: message.sentAt ?? null,
    sequenceNo: index + 1,
  }));

  const rawText =
    input.rawText ??
    messages
      .map((message) => {
        const speakerLabel =
          message.senderRole === "self"
            ? "나"
            : message.senderRole === "other"
              ? "상대"
              : "미확인";

        return `${speakerLabel}: ${message.messageText}`;
      })
      .join("\n");

  return {
    id: "fixture-conversation",
    title: input.title ?? "Fixture conversation",
    sourceType: "manual",
    relationshipStage: input.relationshipStage,
    meetingChannel: input.meetingChannel,
    userGoal: input.userGoal,
    saveMode: "temporary",
    rawText,
    situationContext: input.situationContext ?? null,
    messages,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
