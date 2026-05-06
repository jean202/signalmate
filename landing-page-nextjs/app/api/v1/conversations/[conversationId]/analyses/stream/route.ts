import { randomUUID } from "node:crypto";
import {
  runHybridAnalysis,
  type HybridFallbackStage,
} from "@/lib/ai/hybrid-analysis-runner";
import { trackUsage } from "@/lib/ai/token-tracker";
import { embedConversation } from "@/lib/ai/embeddings/embed-conversation";
import { createAnalysis, getConversation } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

type StreamFallbackStage = HybridFallbackStage | "stream_pipeline";

function encode(data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
}

function encodeError(message: string): Uint8Array {
  return new TextEncoder().encode(`event: error\ndata: ${JSON.stringify({ message })}\n\n`);
}

export async function POST(request: Request, context: RouteContext) {
  const { conversationId } = await context.params;

  if (!conversationId) {
    return new Response(JSON.stringify({ error: "conversationId required" }), { status: 400 });
  }

  // conversationInline: Vercel/stateless 모드에서 store 조회 없이 직접 전달된 대화 데이터.
  // USE_DB=false 환경(serverless 포함)에서 Lambda 인스턴스 분리 문제를 피하기 위해 사용.
  const body = (await request.json().catch(() => ({}))) as {
    analysisVersion?: string;
    conversationInline?: {
      rawText: string;
      relationshipStage: string;
      meetingChannel: string;
      userGoal: string;
      situationContext?: string | null;
      messages: Array<{
        senderRole: string;
        messageText: string;
        sentAt: string | null;
        sequenceNo: number;
      }>;
    };
  };

  let conversation: Awaited<ReturnType<typeof getConversation>>;

  if (body.conversationInline) {
    // Stateless 모드: 인라인 데이터 사용 (DB 조회 없음)
    conversation = {
      id: conversationId,
      title: null,
      sourceType: "manual",
      saveMode: "temporary",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...body.conversationInline,
      situationContext: body.conversationInline.situationContext ?? null,
    } as Awaited<ReturnType<typeof getConversation>>;
  } else {
    conversation = await getConversation(conversationId);
  }

  if (!conversation) {
    return new Response(JSON.stringify({ error: "Conversation not found" }), { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: unknown) => controller.enqueue(encode(data));
      const emitError = (message: string) => controller.enqueue(encodeError(message));
      const analysisVersion = body.analysisVersion?.trim() || "v1";

      try {
        const { analysis } = await runHybridAnalysis(conversation, {
          analysisVersion,
          noApiKeyModelName: "rule-based-dev",
          callbacks: {
            onRuleComplete(ruleResult) {
              emit({
                type: "rule_complete",
                signals: ruleResult.signals,
                overallSummary: ruleResult.overallSummary,
                positiveSignalCount: ruleResult.positiveSignalCount,
                ambiguousSignalCount: ruleResult.ambiguousSignalCount,
                cautionSignalCount: ruleResult.cautionSignalCount,
                recommendedAction: ruleResult.recommendedAction,
                recommendedActionReason: ruleResult.recommendedActionReason,
                confidenceLevel: ruleResult.confidenceLevel,
              });
            },
            onSignalsReady({ signals, overallSummary }) {
              emit({
                type: "signals_enhanced",
                signals,
                overallSummary,
              });
            },
            onRecommendationsReady({ recommendations, recommendedActionReason }) {
              emit({
                type: "recommendations_ready",
                recommendations,
                recommendedActionReason,
              });
            },
            onStageWarning({ stage }) {
              emit({
                type: "stage_warning",
                stage,
                message: getPublicStageWarningMessage(stage),
              });
            },
          },
        });

        // inlineMode: conversationInline이 제공된 경우 DB 없이 동작 (Vercel 데모 모드)
        let analysisId: string = randomUUID();

        if (!body.conversationInline) {
          try {
            const savedAnalysis = await createAnalysis(analysis);
            analysisId = savedAnalysis.id;
            embedConversation(conversation, savedAnalysis).catch(() => {});
          } catch {
            // DB 저장 실패 시 UUID로 fallback. 결과는 이미 스트리밍됨.
          }
        }

        emit({ type: "complete", analysisId, modelName: analysis.modelName });
        controller.close();
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        console.error("[analysis-stream] Pipeline failed:", errorMessage);
        await trackStreamFallback("stream_pipeline", errorMessage, false);
        emitError("분석 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getPublicStageWarningMessage(stage: StreamFallbackStage): string {
  switch (stage) {
    case "no_anthropic_api_key":
      return "AI API 설정이 없어 규칙 기반 분석으로 완료합니다.";
    case "agent":
      return "에이전트 분석이 지연되어 하이브리드 분석으로 이어갑니다.";
    case "signal_enhancer":
      return "시그널 문장 보강이 지연되어 기본 분석 결과로 이어갑니다.";
    case "signal_quality_gate":
      return "시그널 근거 검증 결과 기본 분석 결과로 이어갑니다.";
    case "recommendation_generator":
      return "맞춤 추천 생성이 지연되어 기본 추천으로 이어갑니다.";
    case "quality_gate":
      return "추천 품질 검증 결과 기본 추천으로 이어갑니다.";
    case "all_llm_stages":
      return "AI 보강 단계가 지연되어 규칙 기반 분석으로 완료합니다.";
    case "hybrid_pipeline":
    case "stream_pipeline":
      return "분석 처리 중 문제가 발생했습니다.";
  }
}

async function trackStreamFallback(
  fallbackStage: StreamFallbackStage,
  errorMessage: string,
  success: boolean,
): Promise<void> {
  await trackUsage({
    modelName: "hybrid-v1",
    chainStep: "fallback",
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    success,
    errorMessage,
    fallbackStage,
  }).catch(() => {});
}
