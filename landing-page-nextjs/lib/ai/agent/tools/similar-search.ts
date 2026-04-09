import { isOpenAIAvailable } from "@/lib/ai/embeddings/openai-client";
import {
  findSimilarConversations,
  buildQueryText,
} from "@/lib/ai/embeddings/similarity-search";
import {
  buildInsight,
  formatInsightForPrompt,
  type SimilarPatternInsight,
} from "@/lib/ai/embeddings/insight-builder";

/**
 * RAG 유사 대화 검색 도구.
 *
 * Phase 3의 similarity-search를 래핑합니다.
 */
export type SimilarSearchResult = {
  available: boolean;
  insight: SimilarPatternInsight | null;
  formattedContext: string;
  summary: string;
};

export async function searchSimilar(params: {
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
  excludeConversationId?: string;
}): Promise<SimilarSearchResult> {
  if (!isOpenAIAvailable()) {
    return {
      available: false,
      insight: null,
      formattedContext: "",
      summary: "OPENAI_API_KEY가 설정되지 않아 유사 대화 검색을 건너뜁니다.",
    };
  }

  try {
    const queryText = buildQueryText(params);
    const similar = await findSimilarConversations(queryText, 5, params.excludeConversationId);
    const insight = buildInsight(similar);

    if (!insight) {
      return {
        available: true,
        insight: null,
        formattedContext: "",
        summary: "유사한 대화가 아직 없습니다. 데이터가 쌓이면 비교 분석이 가능해요.",
      };
    }

    return {
      available: true,
      insight,
      formattedContext: formatInsightForPrompt(insight),
      summary: insight.insightText,
    };
  } catch (error) {
    return {
      available: false,
      insight: null,
      formattedContext: "",
      summary: `유사 대화 검색 중 오류: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
