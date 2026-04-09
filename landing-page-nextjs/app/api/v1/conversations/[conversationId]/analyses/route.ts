import { errorResponse, successResponse } from "@/lib/api-response";
import { createAnalysis, getConversation } from "@/lib/store";
import { runAnalysis } from "@/lib/ai/analysis-engine";
import { runEvaluation } from "@/lib/ai/evaluation/comparator";
import { embedConversation } from "@/lib/ai/embeddings/embed-conversation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnalysisCreateBody = {
  analysisVersion?: string;
  modelName?: string;
};

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { conversationId } = await context.params;
  let body: AnalysisCreateBody = {};

  if (!conversationId) {
    return errorResponse(400, "VALIDATION_ERROR", "conversationId is required.");
  }

  try {
    body = (await request.json()) as AnalysisCreateBody;
  } catch {
    return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  const conversation = await getConversation(conversationId);

  if (!conversation) {
    return errorResponse(404, "NOT_FOUND", "conversation not found.");
  }

  // eval 모드: URL에 ?eval=true 또는 환경변수 EVAL_MODE=true
  const url = new URL(request.url);
  const isEvalMode =
    url.searchParams.get("eval") === "true" || process.env.EVAL_MODE === "true";

  if (isEvalMode) {
    // 평가 모드: 규칙 기반 + 하이브리드 둘 다 실행, 비교 메트릭 포함
    const { analysis: analysisDraft, evaluation } = await runEvaluation(conversation, {
      analysisVersion: body.analysisVersion,
    });

    const analysis = await createAnalysis(analysisDraft);

    return successResponse(
      {
        analysis: {
          id: analysis.id,
          analysisStatus: analysis.analysisStatus,
          modelName: analysis.modelName,
        },
        evaluation,
      },
      202,
    );
  }

  // 일반 모드
  const analysisDraft = await runAnalysis(conversation, {
    analysisVersion: body.analysisVersion,
    modelName: body.modelName,
  });

  const analysis = await createAnalysis(analysisDraft);

  // 분석 완료 후 비동기로 임베딩 저장 (Phase 3 RAG)
  // 실패해도 분석 결과에 영향 없음
  embedConversation(conversation, analysis).catch((err) => {
    console.error("[route] Background embedding failed:", err);
  });

  return successResponse(
    {
      analysis: {
        id: analysis.id,
        analysisStatus: analysis.analysisStatus,
        modelName: analysis.modelName,
      },
    },
    202,
  );
}
