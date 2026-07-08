import { requireAuth } from "@/lib/auth-helpers";
import { errorResponse, successResponse } from "@/lib/api-response";
import { checkDraft } from "@/lib/ai/chains/draft-checker";
import {
  getDeepReportByAnalysisId,
  incrementDraftCheckCount,
} from "@/lib/deep-report-store";
import { DRAFT_CHECK_LIMIT } from "@/lib/deep-report";
import { createLogger } from "@/lib/logger";
import { getAnalysis, getConversation, isDbEnabled } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logger = createLogger("api.draft_check");
const MAX_DRAFT_LENGTH = 500;

type RouteContext = {
  params: Promise<{ analysisId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!isDbEnabled()) {
    return errorResponse(503, "DB_REQUIRED", "심화 분석은 DB 모드에서만 사용할 수 있어요.");
  }

  const { analysisId } = await context.params;

  let body: { draftText?: string };
  try {
    body = (await request.json()) as { draftText?: string };
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }

  const draftText = body.draftText?.trim() ?? "";
  if (!draftText) {
    return errorResponse(400, "VALIDATION_ERROR", "검증할 초안을 입력해 주세요.");
  }
  if (draftText.length > MAX_DRAFT_LENGTH) {
    return errorResponse(
      400,
      "VALIDATION_ERROR",
      `초안은 ${MAX_DRAFT_LENGTH}자 이하로 입력해 주세요.`,
    );
  }

  const report = await getDeepReportByAnalysisId(analysisId);
  if (!report || report.status !== "completed") {
    return errorResponse(
      404,
      "NOT_FOUND",
      "완료된 심화 리포트가 있어야 초안 검증을 쓸 수 있어요.",
    );
  }
  if (report.userId !== auth.userId) {
    return errorResponse(403, "FORBIDDEN", "본인 리포트에서만 사용할 수 있어요.");
  }
  if (report.draftCheckCount >= DRAFT_CHECK_LIMIT) {
    return errorResponse(429, "LIMIT_EXCEEDED", "초안 검증 횟수를 모두 사용했어요.");
  }

  const analysis = await getAnalysis(analysisId);
  const conversation = analysis ? await getConversation(analysis.conversationId) : null;
  if (!analysis || !conversation) {
    return errorResponse(404, "NOT_FOUND", "분석을 찾을 수 없어요.");
  }

  let result;
  try {
    result = await checkDraft({
      analysisId,
      draftText,
      overallSummary: analysis.overallSummary,
      recommendedAction: analysis.recommendedAction,
      situationContext: conversation.situationContext ?? null,
    });
  } catch (error) {
    logger.error("draft_check_failed", { analysisId, error });
    return errorResponse(502, "LLM_ERROR", "검증에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }

  const newCount = await incrementDraftCheckCount(analysisId);

  return successResponse({
    result,
    remaining: Math.max(0, DRAFT_CHECK_LIMIT - newCount),
  });
}
