import type { StoredConversation } from "@/lib/analysis-store";
import { makeConversationFixture } from "@/test/helpers/make-conversation";

export type CaptureMessage = { sender: "me" | "them"; text: string; sentAt?: string };
export type CaptureContext = Record<string, string>;
export type CaptureLabel = {
  temperature: "cold" | "neutral" | "warm" | "hot";
  topSignal: string;
  nextMove: string;
};
export type Capture = {
  id: string;
  source?: string;
  context?: CaptureContext;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  messages: CaptureMessage[];
  myLabel?: CaptureLabel;
};

export function captureToConversation(capture: Capture): StoredConversation {
  const situationContext = capture.context
    ? Object.entries(capture.context)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ")
    : null;

  return makeConversationFixture({
    relationshipStage: capture.relationshipStage ?? "unknown",
    meetingChannel: capture.meetingChannel ?? "dating_app",
    userGoal: capture.userGoal ?? "build_rapport",
    situationContext,
    messages: capture.messages.map((message) => ({
      senderRole: message.sender === "me" ? "self" : "other",
      messageText: message.text,
      sentAt: message.sentAt ?? null,
    })),
  });
}
