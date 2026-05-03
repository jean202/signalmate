import { randomUUID } from "node:crypto";
import { buildRuleBasedAnalysis } from "@/lib/rule-based-analysis";
import { isAnthropicAvailable } from "@/lib/ai/anthropic-client";
import { enhanceSignals } from "@/lib/ai/chains/signal-enhancer";
import { generateRecommendations } from "@/lib/ai/chains/recommendation-generator";
import { createAnalysis, getConversation } from "@/lib/store";
import { embedConversation } from "@/lib/ai/embeddings/embed-conversation";
import { isOpenAIAvailable } from "@/lib/ai/embeddings/openai-client";
import { findSimilarConversations, buildQueryText } from "@/lib/ai/embeddings/similarity-search";
import { buildInsight, formatInsightForPrompt } from "@/lib/ai/embeddings/insight-builder";
import type { StoredSignal, StoredRecommendation } from "@/lib/analysis-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

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
  const body = await request.json().catch(() => ({})) as {
    analysisVersion?: string;
    conversationInline?: {
      rawText: string;
      relationshipStage: string;
      meetingChannel: string;
      userGoal: string;
      situationContext?: string | null;
      messages: Array<{ senderRole: string; messageText: string; sentAt: string | null; sequenceNo: number }>;
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

      try {
        // ── Stage 1: Rule-based analysis (fast, <100ms) ────────────────────
        const ruleResult = buildRuleBasedAnalysis(conversation, { analysisVersion: "v1" });

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

        // ── Fallback: no Claude key → save rule-based and complete ──────────
        if (!isAnthropicAvailable()) {
          const analysis = await createAnalysis({
            ...ruleResult,
            conversationId: conversation.id,
          });
          embedConversation(conversation, analysis).catch(() => {});
          emit({ type: "complete", analysisId: analysis.id, modelName: "rule-based-dev" });
          controller.close();
          return;
        }

        // ── Stage 1.5: RAG context (optional, non-blocking) ─────────────────
        let similarPatternContext: string | undefined;
        if (isOpenAIAvailable()) {
          try {
            const selfCount = conversation.messages.filter((m) => m.senderRole === "self").length;
            const otherCount = conversation.messages.filter((m) => m.senderRole === "other").length;
            const queryText = buildQueryText({
              relationshipStage: conversation.relationshipStage,
              meetingChannel: conversation.meetingChannel,
              userGoal: conversation.userGoal,
              messageCount: conversation.messages.length,
              selfCount,
              otherCount,
              positiveSignalCount: ruleResult.positiveSignalCount,
              ambiguousSignalCount: ruleResult.ambiguousSignalCount,
              cautionSignalCount: ruleResult.cautionSignalCount,
              signalTitles: ruleResult.signals.map((s) => s.title),
              overallSummary: ruleResult.overallSummary,
            });
            const similar = await findSimilarConversations(queryText, 5, conversation.id);
            const insight = buildInsight(similar);
            if (insight) {
              similarPatternContext = formatInsightForPrompt(insight);
            }
          } catch {
            // RAG is optional
          }
        }

        // ── Stage 2: Claude signal enhancement ──────────────────────────────
        const enhancedResult = await enhanceSignals({
          rawText: conversation.rawText,
          relationshipStage: conversation.relationshipStage,
          meetingChannel: conversation.meetingChannel,
          userGoal: conversation.userGoal,
          situationContext: conversation.situationContext,
          signals: ruleResult.signals,
          similarPatternContext,
        });

        const mergedSignals: StoredSignal[] = ruleResult.signals.map((original, index) => {
          const enhanced = enhancedResult.signals[index];
          if (!enhanced || enhanced.signalKey !== original.signalKey) return original;
          return {
            ...original,
            title: enhanced.title || original.title,
            description: enhanced.description || original.description,
            evidenceText: enhanced.evidenceText || original.evidenceText,
          };
        });

        const enhancedSummary = enhancedResult.overallSummary || ruleResult.overallSummary;

        emit({
          type: "signals_enhanced",
          signals: mergedSignals,
          overallSummary: enhancedSummary,
        });

        // ── Stage 3: Claude recommendation generation ────────────────────────
        const recsResult = await generateRecommendations({
          rawText: conversation.rawText,
          relationshipStage: conversation.relationshipStage,
          meetingChannel: conversation.meetingChannel,
          userGoal: conversation.userGoal,
          situationContext: conversation.situationContext,
          recommendedAction: ruleResult.recommendedAction,
          recommendedActionReason: ruleResult.recommendedActionReason,
          overallSummary: enhancedSummary,
          signals: mergedSignals,
        });

        const mergedRecs: StoredRecommendation[] = recsResult.recommendations.map((rec, index) => ({
          id: randomUUID(),
          recommendationType: rec.recommendationType as StoredRecommendation["recommendationType"],
          title: rec.title,
          content: rec.content,
          rationale: rec.rationale,
          toneLabel: rec.toneLabel || null,
          displayOrder: index + 1,
        }));

        const finalRecs = mergedRecs.length >= 3 ? mergedRecs : ruleResult.recommendations;
        const finalActionReason =
          recsResult.recommendedActionReason || ruleResult.recommendedActionReason;

        emit({
          type: "recommendations_ready",
          recommendations: finalRecs,
          recommendedActionReason: finalActionReason,
        });

        // ── Stage 4: Persist + complete ──────────────────────────────────────
        // inlineMode: conversationInline이 제공된 경우 DB 없이 동작 (Vercel 데모 모드)
        const modelName = similarPatternContext ? "hybrid-v1+rag" : "hybrid-v1";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let analysisId: any = randomUUID();

        if (!body.conversationInline) {
          try {
            const analysis = await createAnalysis({
              conversationId: conversation.id,
              analysisVersion: "v1",
              modelName,
              overallSummary: enhancedSummary,
              positiveSignalCount: ruleResult.positiveSignalCount,
              ambiguousSignalCount: ruleResult.ambiguousSignalCount,
              cautionSignalCount: ruleResult.cautionSignalCount,
              confidenceLevel: ruleResult.confidenceLevel,
              recommendedAction: ruleResult.recommendedAction,
              recommendedActionReason: finalActionReason,
              analysisStatus: "completed",
              signals: mergedSignals,
              recommendations: finalRecs,
            });
            analysisId = analysis.id;
            embedConversation(conversation, analysis).catch(() => {});
          } catch {
            // DB 저장 실패 시 UUID로 fallback — 결과는 이미 스트리밍됨
          }
        }

        emit({ type: "complete", analysisId, modelName });
        controller.close();
      } catch (err) {
        emitError(err instanceof Error ? err.message : "Analysis failed");
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
