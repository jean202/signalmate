import { errorResponse, successResponse } from "@/lib/api-response";
import { createConversation, type SaveMode, type SenderRole } from "@/lib/store";
import { getCurrentUserId } from "@/lib/auth-helpers";
import { parseChatText } from "@/lib/chat-parser";
import { mergeSituationContext } from "@/lib/situation-context-builder";
import {
  hasEnoughSituationInput,
  type GuidedAnswers,
} from "@/lib/situation-input";

type ConversationMessageInput = {
  senderRole?: "self" | "other" | "unknown" | null;
  messageText?: string | null;
  sentAt?: string | null;
  sequenceNo?: number | null;
};

type ConversationCreateBody = {
  title?: string | null;
  sourceType?: string | null;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  saveMode?: SaveMode | null;
  rawText?: string | null;
  /** Hint for which sender name is "self" in auto-parsed chat */
  selfName?: string | null;
  /** Mode A: 자유 텍스트 상황 설명 */
  situationContext?: string | null;
  /** Mode B: 가이드 질문 응답 */
  guidedAnswers?: GuidedAnswers | null;
  messages?: ConversationMessageInput[] | null;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validSenderRoles: SenderRole[] = ["self", "other", "unknown"];
const validSaveModes: SaveMode[] = ["temporary", "saved"];
const guidedAnswerValues = {
  inputFocus: ["chat", "meeting_note", "mixed", "follow_up"],
  meetingCount: ["none", "once", "2_3_times", "4_plus"],
  meetingVibe: ["none", "awkward", "normal", "good", "great"],
  otherInitiative: ["low", "medium", "high", "unknown"],
  afterMeetingContact: ["none", "self_first", "other_first", "slower", "ongoing", "not_applicable"],
  desiredHelp: ["next_message", "ask_for_date", "wait_or_send", "decide_to_stop"],
} as const;
const otherStyleValues = [
  "fast_reply", "slow_reply", "short_messages", "long_messages", "uses_emoji", "unknown",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isMessageInput(value: unknown): value is ConversationMessageInput {
  if (!isRecord(value)) return false;
  return (value.senderRole == null || (
    typeof value.senderRole === "string"
    && validSenderRoles.includes(value.senderRole as SenderRole)
  ))
    && isOptionalNullableString(value.messageText)
    && isOptionalNullableString(value.sentAt)
    && (value.sequenceNo == null || (
      typeof value.sequenceNo === "number" && Number.isInteger(value.sequenceNo)
    ));
}

function isOptionalEnum(value: unknown, allowed: readonly string[]): boolean {
  return value === undefined || (typeof value === "string" && allowed.includes(value));
}

function isGuidedAnswers(value: unknown): value is GuidedAnswers {
  if (!isRecord(value)) return false;
  return isOptionalEnum(value.inputFocus, guidedAnswerValues.inputFocus)
    && isOptionalEnum(value.meetingCount, guidedAnswerValues.meetingCount)
    && isOptionalEnum(value.meetingVibe, guidedAnswerValues.meetingVibe)
    && isOptionalEnum(value.otherInitiative, guidedAnswerValues.otherInitiative)
    && isOptionalEnum(value.afterMeetingContact, guidedAnswerValues.afterMeetingContact)
    && isOptionalEnum(value.desiredHelp, guidedAnswerValues.desiredHelp)
    && (value.freeText === undefined || typeof value.freeText === "string")
    && (value.otherStyle === undefined || (
      Array.isArray(value.otherStyle)
      && value.otherStyle.every((style) => (
        typeof style === "string" && otherStyleValues.includes(style as typeof otherStyleValues[number])
      ))
    ));
}

export async function POST(request: Request) {
  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (!isRecord(parsedBody)) {
    return errorResponse(400, "VALIDATION_ERROR", "Request body must be a JSON object.");
  }
  const body = parsedBody as ConversationCreateBody;

  if (!isNonEmptyString(body.relationshipStage)
    || !isNonEmptyString(body.meetingChannel)
    || !isNonEmptyString(body.userGoal)) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "relationshipStage, meetingChannel, and userGoal are required.",
    );
  }

  if (!isOptionalNullableString(body.title)
    || !isOptionalNullableString(body.sourceType)
    || !isOptionalNullableString(body.rawText)
    || !isOptionalNullableString(body.selfName)
    || !isOptionalNullableString(body.situationContext)) {
    return errorResponse(400, "VALIDATION_ERROR", "Optional text fields must be strings or null.");
  }
  if (body.saveMode != null && (
    typeof body.saveMode !== "string" || !validSaveModes.includes(body.saveMode as SaveMode)
  )) {
    return errorResponse(400, "VALIDATION_ERROR", "saveMode must be temporary or saved.");
  }
  if (body.messages != null && (
    !Array.isArray(body.messages) || !body.messages.every(isMessageInput)
  )) {
    return errorResponse(400, "VALIDATION_ERROR", "messages has an invalid format.");
  }
  if (body.situationContext && body.situationContext.length > 2000) {
    return errorResponse(400, "VALIDATION_ERROR", "situationContext must be 2000 characters or less.");
  }
  if (body.guidedAnswers != null && !isGuidedAnswers(body.guidedAnswers)) {
    return errorResponse(400, "VALIDATION_ERROR", "guidedAnswers has an invalid format.");
  }
  if (body.guidedAnswers?.freeText && body.guidedAnswers.freeText.length > 2000) {
    return errorResponse(400, "VALIDATION_ERROR", "guidedAnswers.freeText must be 2000 characters or less.");
  }

  // User-authored fields are limited independently; generated guidance may make the merged value longer.
  const situationContext = mergeSituationContext(body.situationContext, body.guidedAnswers);

  const allowsSituationOnly = hasEnoughSituationInput({
    rawText: body.rawText,
    situationContext,
    guidedAnswers: body.guidedAnswers,
  });

  if (
    !body.rawText?.trim() &&
    (!Array.isArray(body.messages) || body.messages.length === 0) &&
    !allowsSituationOnly
  ) {
    return errorResponse(400, "VALIDATION_ERROR", "rawText or messages is required.");
  }

  let normalizedMessages: { senderRole: SenderRole; messageText: string; sentAt: string | null; sequenceNo: number }[];

  if (Array.isArray(body.messages)) {
    // Mode 1: Pre-parsed messages provided. 빈 배열도 명시적 입력으로 존중한다.
    normalizedMessages = body.messages
      .map((message, index) => ({
        senderRole: validSenderRoles.includes(message.senderRole ?? "unknown")
          ? (message.senderRole ?? "unknown")
          : ("unknown" as SenderRole),
        messageText: message.messageText?.trim() ?? "",
        sentAt: typeof message.sentAt === "string" ? message.sentAt : null,
        sequenceNo: Number.isInteger(message.sequenceNo) ? (message.sequenceNo as number) : index + 1,
      }))
      .filter((message) => message.messageText.length > 0)
      .sort((left, right) => left.sequenceNo - right.sequenceNo);
  } else if (body.rawText?.trim()) {
    // Mode 2: Auto-parse from rawText
    const parseResult = parseChatText(body.rawText, body.selfName ?? undefined);
    normalizedMessages = parseResult.messages.map((m) => ({
      senderRole: m.senderRole as SenderRole,
      messageText: m.messageText,
      sentAt: m.sentAt,
      sequenceNo: m.sequenceNo,
    }));
  } else {
    normalizedMessages = [];
  }

  if (normalizedMessages.length === 0 && !allowsSituationOnly) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "채팅 메시지를 찾지 못했어요. 만남 후기만 입력할 때는 상황을 20자 이상 적고 입력 중심을 만남 후기나 만남 뒤 연락으로 선택해 주세요.",
    );
  }

  // 로그인된 유저가 있으면 연결 (비로그인도 허용)
  const userId = await getCurrentUserId();

  const conversation = await createConversation({
    title: body.title?.trim() || null,
    sourceType: body.sourceType?.trim() || "manual",
    relationshipStage: body.relationshipStage,
    meetingChannel: body.meetingChannel,
    userGoal: body.userGoal,
    saveMode: (body.saveMode as SaveMode | undefined) ?? "temporary",
    rawText: body.rawText ?? "",
    situationContext,
    userId,
    messages: normalizedMessages,
  });

  return successResponse(
    {
      conversation: {
        id: conversation.id,
        saveMode: conversation.saveMode,
        relationshipStage: conversation.relationshipStage,
        meetingChannel: conversation.meetingChannel,
        userGoal: conversation.userGoal,
        rawText: conversation.rawText,
        situationContext: conversation.situationContext,
        messages: conversation.messages,
        messageCount: conversation.messages.length,
      },
    },
    201,
  );
}
