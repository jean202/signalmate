import type { SimilarConversation } from "@/lib/ai/embeddings/similarity-search";

/**
 * 유사 대화 검색 결과로부터 통계적 인사이트를 생성합니다.
 *
 * "유사한 대화 패턴 10건 중 7건이 긍정적 진전을 보였습니다" 같은 인사이트.
 */
export type SimilarPatternInsight = {
  /** 검색된 유사 대화 수 */
  totalFound: number;

  /** outcome별 통계 */
  outcomeStats: {
    positive_progress: number;
    neutral: number;
    negative: number;
  };

  /** 주요 결론 (한국어 문장) */
  insightText: string;

  /** 가장 유사한 대화의 요약 (상위 3건) */
  topSummaries: string[];
};

/**
 * 유사 대화 목록에서 통계 인사이트를 빌드합니다.
 */
export function buildInsight(
  similarConversations: SimilarConversation[],
): SimilarPatternInsight | null {
  if (similarConversations.length === 0) {
    return null;
  }

  const outcomeStats = {
    positive_progress: 0,
    neutral: 0,
    negative: 0,
  };

  for (const conv of similarConversations) {
    const label = conv.outcomeLabel as keyof typeof outcomeStats;
    if (label in outcomeStats) {
      outcomeStats[label]++;
    } else {
      outcomeStats.neutral++;
    }
  }

  const total = similarConversations.length;
  const positiveRate = Math.round((outcomeStats.positive_progress / total) * 100);
  const negativeRate = Math.round((outcomeStats.negative / total) * 100);

  // 인사이트 문장 생성
  let insightText: string;

  if (positiveRate >= 70) {
    insightText = `유사한 대화 패턴 ${total}건 중 ${outcomeStats.positive_progress}건(${positiveRate}%)이 긍정적인 진전을 보였어요. 현재 흐름이 좋은 방향이에요.`;
  } else if (positiveRate >= 40) {
    insightText = `유사한 대화 패턴 ${total}건을 분석한 결과, ${outcomeStats.positive_progress}건(${positiveRate}%)이 긍정적 진전, ${outcomeStats.neutral}건이 중립적 결과를 보였어요. 앞으로의 대화가 중요해요.`;
  } else if (negativeRate >= 50) {
    insightText = `유사한 대화 패턴 ${total}건 중 ${outcomeStats.negative}건(${negativeRate}%)이 부정적인 결과로 이어졌어요. 현재 흐름에 주의가 필요해요.`;
  } else {
    insightText = `유사한 대화 패턴 ${total}건의 결과가 다양하게 나타났어요. 아직 방향이 정해지지 않은 단계예요.`;
  }

  const topSummaries = similarConversations
    .slice(0, 3)
    .map((c) => c.summaryText);

  return {
    totalFound: total,
    outcomeStats,
    insightText,
    topSummaries,
  };
}

/**
 * 인사이트를 프롬프트에 주입할 문자열로 변환합니다.
 */
export function formatInsightForPrompt(insight: SimilarPatternInsight): string {
  const lines = [
    `## 유사 대화 패턴 분석 (${insight.totalFound}건)`,
    "",
    insight.insightText,
    "",
    `- 긍정적 진전: ${insight.outcomeStats.positive_progress}건`,
    `- 중립적 결과: ${insight.outcomeStats.neutral}건`,
    `- 부정적 결과: ${insight.outcomeStats.negative}건`,
  ];

  if (insight.topSummaries.length > 0) {
    lines.push("", "### 가장 유사한 대화 요약:");
    insight.topSummaries.forEach((summary, i) => {
      lines.push(`${i + 1}. ${summary.split("\n").join(" | ")}`);
    });
  }

  return lines.join("\n");
}
