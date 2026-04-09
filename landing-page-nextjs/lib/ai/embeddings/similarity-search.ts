import {
  getOpenAIClient,
  isOpenAIAvailable,
  EMBEDDING_MODEL,
} from "@/lib/ai/embeddings/openai-client";
import { prisma } from "@/lib/prisma";

/**
 * 유사 대화 검색 결과 타입.
 */
export type SimilarConversation = {
  conversationId: string;
  summaryText: string;
  outcomeLabel: string;
  similarity: number;
};

/**
 * 현재 대화와 유사한 과거 대화를 pgvector 코사인 유사도로 검색합니다.
 *
 * @param queryText - 현재 대화의 구조화 요약 문자열
 * @param limit - 반환할 최대 개수 (기본 5)
 * @param excludeConversationId - 자기 자신 제외
 * @returns 유사도 내림차순 정렬된 결과
 */
export async function findSimilarConversations(
  queryText: string,
  limit = 5,
  excludeConversationId?: string,
): Promise<SimilarConversation[]> {
  if (!isOpenAIAvailable()) {
    return [];
  }

  try {
    // 쿼리 텍스트를 임베딩으로 변환
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: queryText,
    });

    const queryVector = response.data[0].embedding;
    const vectorStr = `[${queryVector.join(",")}]`;

    // pgvector 코사인 유사도 검색
    // 1 - (vector <=> query_vector) = cosine similarity (0~1)
    const results = await prisma.$queryRawUnsafe<
      {
        conversation_id: string;
        summary_text: string;
        outcome_label: string;
        similarity: number;
      }[]
    >(
      `SELECT
         conversation_id,
         summary_text,
         outcome_label,
         1 - (embedding <=> $1::vector) AS similarity
       FROM conversation_embeddings
       WHERE conversation_id != $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      vectorStr,
      excludeConversationId ?? "00000000-0000-0000-0000-000000000000",
      limit,
    );

    return results.map((row) => ({
      conversationId: row.conversation_id,
      summaryText: row.summary_text,
      outcomeLabel: row.outcome_label ?? "neutral",
      similarity: Math.round(Number(row.similarity) * 1000) / 1000,
    }));
  } catch (error) {
    console.error("[similarity-search] Failed:", error);
    return [];
  }
}

/**
 * 현재 대화의 구조화 요약 텍스트를 생성합니다.
 * embed-conversation.ts의 buildSummaryText와 동일한 포맷.
 */
export function buildQueryText(params: {
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  messageCount: number;
  selfCount: number;
  otherCount: number;
  positiveSignalCount: number;
  ambiguousSignalCount: number;
  cautionSignalCount: number;
  signalTitles: string[];
  overallSummary: string;
}): string {
  return [
    `관계단계: ${params.relationshipStage}`,
    `만남경로: ${params.meetingChannel}`,
    `목표: ${params.userGoal}`,
    `메시지수: ${params.messageCount}개 (나: ${params.selfCount}, 상대: ${params.otherCount})`,
    `긍정시그널: ${params.positiveSignalCount}개, 모호시그널: ${params.ambiguousSignalCount}개, 주의시그널: ${params.cautionSignalCount}개`,
    `시그널: ${params.signalTitles.join(", ")}`,
    `요약: ${params.overallSummary}`,
  ].join("\n");
}
