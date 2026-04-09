import { errorResponse, successResponse } from "@/lib/api-response";
import {
  deleteConversation,
  getConversation,
  updateConversation,
  type SaveMode,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

type ConversationUpdateBody = {
  title?: string;
  saveMode?: "temporary" | "saved";
};

export async function GET(_: Request, context: RouteContext) {
  const { conversationId } = await context.params;

  if (!conversationId) {
    return errorResponse(400, "VALIDATION_ERROR", "conversationId is required.");
  }

  const conversation = await getConversation(conversationId);

  if (!conversation) {
    return errorResponse(404, "NOT_FOUND", "conversation not found.");
  }

  return successResponse({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      sourceType: conversation.sourceType,
      relationshipStage: conversation.relationshipStage,
      meetingChannel: conversation.meetingChannel,
      userGoal: conversation.userGoal,
      saveMode: conversation.saveMode,
      createdAt: conversation.createdAt,
    },
    messages: conversation.messages,
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { conversationId } = await context.params;
  let body: ConversationUpdateBody;

  try {
    body = (await request.json()) as ConversationUpdateBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (body.saveMode && body.saveMode !== "temporary" && body.saveMode !== "saved") {
    return errorResponse(400, "VALIDATION_ERROR", "saveMode must be temporary or saved.");
  }

  const conversation = await updateConversation(conversationId, {
    title: body.title,
    saveMode: body.saveMode as SaveMode | undefined,
  });

  if (!conversation) {
    return errorResponse(404, "NOT_FOUND", "conversation not found.");
  }

  return successResponse({
    conversation: {
      id: conversation.id,
      saveMode: conversation.saveMode,
      relationshipStage: conversation.relationshipStage,
      messageCount: conversation.messages.length,
      title: conversation.title,
    },
  });
}

export async function DELETE(_: Request, context: RouteContext) {
  const { conversationId } = await context.params;

  if (!conversationId) {
    return errorResponse(400, "VALIDATION_ERROR", "conversationId is required.");
  }

  const deleted = await deleteConversation(conversationId);

  if (!deleted) {
    return errorResponse(404, "NOT_FOUND", "conversation not found.");
  }

  return successResponse({ deleted: true });
}
