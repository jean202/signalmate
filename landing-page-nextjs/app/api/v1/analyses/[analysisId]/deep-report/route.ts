import { requireAuth } from "@/lib/auth-helpers";
import { errorResponse, successResponse } from "@/lib/api-response";
import { generateDeepReport } from "@/lib/ai/chains/deep-report-generator";
import { findSimilarReferenceCases } from "@/lib/ai/embeddings/reference-search";
import {
  completeDeepReport,
  failDeepReport,
  getDeepReportByAnalysisId,
  hasDeepAccess,
  upsertGeneratingDeepReport,
} from "@/lib/deep-report-store";
import { buildFallbackDeepReport } from "@/lib/deep-report";
import { createLogger } from "@/lib/logger";
import { getAnalysis, getConversation, isDbEnabled } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const logger = createLogger("api.deep_report");

type RouteContext = {
  params: Promise<{ analysisId: string }>;
};

function encodeSse(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  if (!isDbEnabled()) {
    return errorResponse(503, "DB_REQUIRED", "심화 분석은 DB 모드에서만 사용할 수 있어요.");
  }

  const { analysisId } = await context.params;
  const analysis = await getAnalysis(analysisId);
  if (!analysis) {
    return errorResponse(404, "NOT_FOUND", "분석을 찾을 수 없어요.");
  }

  if (!(await hasDeepAccess(userId, analysisId))) {
    return errorResponse(402, "PAYMENT_REQUIRED", "심화 분석 결제 후 이용할 수 있어요.");
  }

  const conversation = await getConversation(analysis.conversationId);
  if (!conversation) {
    return errorResponse(404, "NOT_FOUND", "대화를 찾을 수 없어요.");
  }

  const existing = await getDeepReportByAnalysisId(analysisId);
  if (existing && existing.userId !== userId) {
    return errorResponse(403, "FORBIDDEN", "본인 리포트만 볼 수 있어요.");
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => controller.enqueue(encodeSse(event));

      try {
        if (existing?.status === "completed" && existing.content) {
          emit({ type: "complete", content: existing.content, fallback: false, cached: true });
          controller.close();
          return;
        }

        await upsertGeneratingDeepReport(analysisId, userId);
        emit({ type: "started" });

        const queryText = [conversation.situationContext, analysis.overallSummary]
          .filter(Boolean)
          .join("\n");
        const referenceCases = await findSimilarReferenceCases(queryText, 5);
        emit({ type: "similar_cases_searched", count: referenceCases.length });

        const signalLines = analysis.signals.map(
          (signal) =>
            `${signal.signalType}/${signal.signalKey}: ${signal.title} - ${signal.evidenceText}`,
        );

        let fallback = false;
        let content;
        try {
          content = await generateDeepReport({
            analysisId,
            relationshipStage: conversation.relationshipStage,
            meetingChannel: conversation.meetingChannel,
            userGoal: conversation.userGoal,
            situationContext: conversation.situationContext ?? null,
            overallSummary: analysis.overallSummary,
            recommendedAction: analysis.recommendedAction,
            recommendedActionReason: analysis.recommendedActionReason,
            signalLines,
            referenceCases,
          });
        } catch (error) {
          logger.error("generator_failed_falling_back", { analysisId, error });
          fallback = true;
          content = buildFallbackDeepReport({
            recommendedAction: analysis.recommendedAction,
            recommendedActionReason: analysis.recommendedActionReason,
            referenceCases,
          });
        }

        await completeDeepReport(analysisId, content);
        emit({ type: "complete", content, fallback, cached: false });
      } catch (error) {
        logger.error("stream_failed", { analysisId, error });
        await failDeepReport(analysisId).catch(() => undefined);
        emit({ type: "error", message: "리포트 생성에 실패했어요. 다시 시도해 주세요." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!isDbEnabled()) {
    return errorResponse(503, "DB_REQUIRED", "심화 분석은 DB 모드에서만 사용할 수 있어요.");
  }

  const { analysisId } = await context.params;
  const report = await getDeepReportByAnalysisId(analysisId);

  if (!report) {
    return errorResponse(404, "NOT_FOUND", "심화 리포트가 아직 없어요.");
  }
  if (report.userId !== auth.userId) {
    return errorResponse(403, "FORBIDDEN", "본인 리포트만 볼 수 있어요.");
  }

  return successResponse({ report });
}
