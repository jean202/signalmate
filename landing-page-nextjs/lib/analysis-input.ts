import type { SituationInputFocus } from "@/lib/situation-input";

export type AnalysisInputMessage = {
  senderRole: "self" | "other" | "unknown";
  messageText: string;
  sentAt: string | null;
  sequenceNo: number;
};

export function hasRecognizableSpeakers(messages: AnalysisInputMessage[]): boolean {
  return messages.some(
    (message) => message.senderRole === "self" || message.senderRole === "other",
  );
}

export function shouldSendParsedMessages(
  messages: AnalysisInputMessage[],
  inputFocus: SituationInputFocus,
): boolean {
  if (messages.length === 0) {
    return false;
  }

  if (inputFocus === "chat") {
    return true;
  }

  return hasRecognizableSpeakers(messages);
}

export function resolveMessagesForAnalysisInput(
  messages: AnalysisInputMessage[],
  inputFocus: SituationInputFocus,
): AnalysisInputMessage[] {
  return shouldSendParsedMessages(messages, inputFocus) ? messages : [];
}
