import {
  getOpenAIClient,
  isOpenAIAvailable,
  EMBEDDING_MODEL,
} from "@/lib/ai/embeddings/openai-client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ai.reference_search");

export type ReferenceCaseHit = {
  id: string;
  summaryText: string;
  situationType: string;
  outcomeLabel: "progressed" | "stalled" | "ended";
  lesson: string;
  similarity: number;
};

function toOutcomeLabel(value: string | null): ReferenceCaseHit["outcomeLabel"] {
  return value === "progressed" || value === "stalled" || value === "ended"
    ? value
    : "stalled";
}

/**
 * 시드 코퍼스(reference_cases)에서 현재 상황과 유사한 사례를 검색합니다.
 * 실패·미설정 시 빈 배열(유사 사례 섹션 생략 폴백).
 */
export async function findSimilarReferenceCases(
  queryText: string,
  limit = 5,
): Promise<ReferenceCaseHit[]> {
  if (!isOpenAIAvailable()) {
    return [];
  }

  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: queryText,
    });

    const vectorStr = `[${response.data[0].embedding.join(",")}]`;

    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        summary_text: string;
        situation_type: string;
        outcome_label: string | null;
        lesson: string;
        similarity: number;
      }[]
    >(
      `SELECT
         id,
         summary_text,
         situation_type,
         outcome_label,
         lesson,
         1 - (embedding <=> $1::vector) AS similarity
       FROM reference_cases
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorStr,
      limit,
    );

    return rows.map((row) => ({
      id: row.id,
      summaryText: row.summary_text,
      situationType: row.situation_type,
      outcomeLabel: toOutcomeLabel(row.outcome_label),
      lesson: row.lesson,
      similarity: Math.round(Number(row.similarity) * 1000) / 1000,
    }));
  } catch (error) {
    logger.error("failed", { limit, error });
    return [];
  }
}
