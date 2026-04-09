import {
  getOpenAIClient,
  isOpenAIAvailable,
  EMBEDDING_MODEL,
} from "@/lib/ai/embeddings/openai-client";
import { prisma } from "@/lib/prisma";
import type { StoredConversation, StoredAnalysis } from "@/lib/analysis-store";

/**
 * 대화를 구조화 요약 → 임베딩 벡터로 변환하여 DB에 저장합니다.
 *
 * 임베딩 대상: 관계 컨텍스트 + 시그널 요약 + 결과를 결합한 문자열.
 * 단순 rawText가 아니라 분석 결과를 반영한 요약을 임베딩합니다.
 */
export async function embedConversation(
  conversation: StoredConversation,
  analysis: StoredAnalysis,
): Promise<void> {
  if (!isOpenAIAvailable()) {
    console.warn("[embed] OPENAI_API_KEY not set — skipping embedding");
    return;
  }

  // 이미 임베딩이 있는지 확인
  const existing = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint as count FROM conversation_embeddings WHERE conversation_id = $1`,
    conversation.id,
  );
  if (existing[0] && Number(existing[0].count) > 0) {
    console.log(`[embed] Embedding already exists for conversation ${conversation.id}`);
    return;
  }

  // 구조화 요약 생성
  const summaryText = buildSummaryText(conversation, analysis);
  const outcomeLabel = mapOutcomeLabel(analysis.recommendedAction);

  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: summaryText,
    });

    const vector = response.data[0].embedding;
    const vectorStr = `[${vector.join(",")}]`;

    // pgvector로 직접 저장 (Prisma의 Unsupported 타입은 ORM으로 안 됨)
    await prisma.$executeRawUnsafe(
      `INSERT INTO conversation_embeddings (id, conversation_id, summary_text, outcome_label, embedding, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::vector, NOW())
       ON CONFLICT (conversation_id) DO UPDATE
       SET summary_text = $2, outcome_label = $3, embedding = $4::vector, created_at = NOW()`,
      conversation.id,
      summaryText,
      outcomeLabel,
      vectorStr,
    );

    console.log(
      `[embed] Saved embedding for conversation ${conversation.id} (${response.usage.total_tokens} tokens)`,
    );
  } catch (error) {
    console.error("[embed] Failed to create embedding:", error);
  }
}

/**
 * 대화와 분석 결과를 임베딩용 구조화 요약 문자열로 변환합니다.
 */
function buildSummaryText(conversation: StoredConversation, analysis: StoredAnalysis): string {
  const messageCount = conversation.messages.length;
  const selfCount = conversation.messages.filter((m) => m.senderRole === "self").length;
  const otherCount = conversation.messages.filter((m) => m.senderRole === "other").length;

  const signalSummary = analysis.signals
    .map((s) => `${s.signalType}: ${s.title}`)
    .join(", ");

  return [
    `관계단계: ${conversation.relationshipStage}`,
    `만남경로: ${conversation.meetingChannel}`,
    `목표: ${conversation.userGoal}`,
    `메시지수: ${messageCount}개 (나: ${selfCount}, 상대: ${otherCount})`,
    `긍정시그널: ${analysis.positiveSignalCount}개, 모호시그널: ${analysis.ambiguousSignalCount}개, 주의시그널: ${analysis.cautionSignalCount}개`,
    `추천액션: ${analysis.recommendedAction}`,
    `신뢰도: ${analysis.confidenceLevel}`,
    `시그널: ${signalSummary}`,
    `요약: ${analysis.overallSummary}`,
  ].join("\n");
}

/**
 * recommendedAction을 outcome_label로 변환합니다.
 */
function mapOutcomeLabel(action: string): string {
  switch (action) {
    case "suggest_date":
    case "keep_light":
      return "positive_progress";
    case "wait_for_response":
    case "slow_down":
      return "neutral";
    case "consider_stopping":
      return "negative";
    default:
      return "neutral";
  }
}
