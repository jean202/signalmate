import { classifyChatTranscriptLine, parseChatText } from "@/lib/chat-parser";
import type { GuidedAnswers, SituationInputFocus } from "@/lib/situation-input";
import type { SaveMode } from "@/lib/store";

export type AnalysisInputMessage = {
  senderRole: "self" | "other" | "unknown";
  messageText: string;
  sentAt: string | null;
  sequenceNo: number;
};

type BuildAnalysisRequestInputParams = {
  rawText: string;
  inputFocus: SituationInputFocus;
  guidedAnswers: GuidedAnswers;
  selfName?: string;
};

type BuildCreateConversationRequestBodyParams = BuildAnalysisRequestInputParams & {
  title: string;
  sourceType: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode: SaveMode;
};

export type CreateConversationRequestBody = {
  title: string;
  sourceType: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode: SaveMode;
  rawText: string;
  selfName: string;
  guidedAnswers: GuidedAnswers;
  messages: AnalysisInputMessage[];
};

export function hasRecognizableSpeakers(messages: AnalysisInputMessage[]): boolean {
  return messages.some(
    (message) => message.senderRole === "self" || message.senderRole === "other",
  );
}

function inferSenderRole(token: string | undefined): AnalysisInputMessage["senderRole"] {
  if (!token) {
    return "unknown";
  }

  const normalized = token.trim().toLowerCase();

  if (["나", "저", "me", "self", "mine"].includes(normalized)) {
    return "self";
  }

  if (["상대", "상대방", "그분", "you", "other"].includes(normalized)) {
    return "other";
  }

  return "unknown";
}

function fallbackParseConversationMessages(rawText: string): AnalysisInputMessage[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const timestampMatch = line.match(/^\[(.*?)\]\s*(.*)$/);
      const body = timestampMatch ? timestampMatch[2].trim() : line;
      const speakerMatch = body.match(
        /^(나|저|me|self|mine|상대|상대방|그분|you|other)\s*[:：]\s*(.+)$/i,
      );
      const messageText = (speakerMatch?.[2] ?? body).trim();

      return {
        senderRole: inferSenderRole(speakerMatch?.[1]),
        messageText,
        sentAt: null,
        sequenceNo: index + 1,
      };
    })
    .filter((message) => message.messageText.length > 0);
}

function mergeSituationFreeText(existingFreeText: string | undefined, extractedSituationText: string) {
  const parts = [existingFreeText?.trim() ?? "", extractedSituationText.trim()].filter(Boolean);

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

function splitSituationAwareRawText(rawText: string) {
  const chatLines: string[] = [];
  const situationLines: string[] = [];

  for (const line of rawText.split(/\r?\n/)) {
    const trimmedLine = line.trim();
    const lineKind = classifyChatTranscriptLine(trimmedLine);

    if (lineKind === "empty" || lineKind === "metadata") {
      continue;
    }

    if (lineKind === "message") {
      chatLines.push(trimmedLine);
      continue;
    }

    situationLines.push(trimmedLine);
  }

  return {
    chatText: chatLines.join("\n"),
    situationText: situationLines.join("\n"),
  };
}

export function parseConversationMessages(
  rawText: string,
  selfName = "나",
): AnalysisInputMessage[] {
  const result = parseChatText(rawText, selfName);
  if (result.messages.length > 0) {
    return result.messages.map((message) => ({
      senderRole: message.senderRole,
      messageText: message.messageText,
      sentAt: message.sentAt,
      sequenceNo: message.sequenceNo,
    }));
  }

  return fallbackParseConversationMessages(rawText);
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

export function buildAnalysisRequestInput({
  rawText,
  inputFocus,
  guidedAnswers,
  selfName = "나",
}: BuildAnalysisRequestInputParams): {
  messages: AnalysisInputMessage[];
  guidedAnswers: GuidedAnswers;
} {
  if (inputFocus === "chat") {
    return {
      messages: resolveMessagesForAnalysisInput(
        parseConversationMessages(rawText, selfName),
        inputFocus,
      ),
      guidedAnswers,
    };
  }

  const { chatText, situationText } = splitSituationAwareRawText(rawText);
  const parsedMessages = parseConversationMessages(chatText, selfName);
  const messages = resolveMessagesForAnalysisInput(parsedMessages, inputFocus);
  const fallbackSituationText =
    messages.length === 0 && chatText.trim().length > 0
      ? [chatText.trim(), situationText].filter(Boolean).join("\n")
      : situationText;

  return {
    messages,
    guidedAnswers: {
      ...guidedAnswers,
      freeText: mergeSituationFreeText(guidedAnswers.freeText, fallbackSituationText),
    },
  };
}

export function buildCreateConversationRequestBody({
  title,
  sourceType,
  relationshipStage,
  meetingChannel,
  userGoal,
  saveMode,
  rawText,
  inputFocus,
  guidedAnswers,
  selfName = "나",
}: BuildCreateConversationRequestBodyParams): CreateConversationRequestBody {
  const analysisInput = buildAnalysisRequestInput({
    rawText,
    inputFocus,
    guidedAnswers,
    selfName,
  });

  return {
    title,
    sourceType,
    relationshipStage,
    meetingChannel,
    userGoal,
    saveMode,
    rawText,
    selfName,
    guidedAnswers: analysisInput.guidedAnswers,
    messages: analysisInput.messages,
  };
}
