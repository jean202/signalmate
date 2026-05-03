import { errorResponse, successResponse } from "@/lib/api-response";
import { createConversation, type SaveMode, type SenderRole } from "@/lib/store";
import { mergeSituationContext, type GuidedAnswers } from "@/lib/situation-context-builder";
import { getCurrentUserId } from "@/lib/auth-helpers";
import { parseChatText } from "@/lib/chat-parser";

type ConversationMessageInput = {
  senderRole?: "self" | "other" | "unknown";
  messageText?: string;
  sentAt?: string | null;
  sequenceNo?: number;
};

type ConversationCreateBody = {
  title?: string;
  sourceType?: string;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  saveMode?: string;
  rawText?: string;
  /** Hint for which sender name is "self" in auto-parsed chat */
  selfName?: string;
  /** Mode A: 자유 텍스트 상황 설명 */
  situationContext?: string;
  /** Mode B: 가이드 질문 응답 */
  guidedAnswers?: GuidedAnswers;
  messages?: ConversationMessageInput[];
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const validSenderRoles: SenderRole[] = ["self", "other", "unknown"];
const validSaveModes: SaveMode[] = ["temporary", "saved"];

export async function POST(request: Request) {
  let body: ConversationCreateBody;

  try {
    body = (await request.json()) as ConversationCreateBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (!body.relationshipStage || !body.meetingChannel || !body.userGoal) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      "relationshipStage, meetingChannel, and userGoal are required.",
    );
  }

  if (!body.rawText?.trim() && (!Array.isArray(body.messages) || body.messages.length === 0)) {
    return errorResponse(400, "VALIDATION_ERROR", "rawText or messages is required.");
  }

  let normalizedMessages: { senderRole: SenderRole; messageText: string; sentAt: string | null; sequenceNo: number }[];

  if (Array.isArray(body.messages) && body.messages.length > 0) {
    // Mode 1: Pre-parsed messages provided
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
  } else {
    // Mode 2: Auto-parse from rawText
    const parseResult = parseChatText(body.rawText!, body.selfName);
    normalizedMessages = parseResult.messages.map((m) => ({
      senderRole: m.senderRole as SenderRole,
      messageText: m.messageText,
      sentAt: m.sentAt,
      sequenceNo: m.sequenceNo,
    }));
  }

  if (normalizedMessages.length === 0) {
    return errorResponse(400, "VALIDATION_ERROR", "Could not parse any messages from the input.");
  }

  if (body.saveMode && !validSaveModes.includes(body.saveMode as SaveMode)) {
    return errorResponse(400, "VALIDATION_ERROR", "saveMode must be temporary or saved.");
  }

  // situationContext: Mode A(자유 텍스트) + Mode B(가이드 응답) 병합, 최대 2000자
  const situationContext = mergeSituationContext(body.situationContext, body.guidedAnswers);
  if (situationContext && situationContext.length > 2000) {
    return errorResponse(400, "VALIDATION_ERROR", "situationContext must be 2000 characters or less.");
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
