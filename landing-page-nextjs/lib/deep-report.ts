import type { ReferenceCaseHit } from "@/lib/ai/embeddings/reference-search";

export type DeepReportScenario = {
  actionLabel: string;
  expectedFlow: string;
  risk: string;
  bestMessage: string;
  timing: string;
  confidence: "low" | "medium" | "high";
};

export type DeepReportSimilarCase = {
  situationType: string;
  flowSummary: string;
  outcome: "progressed" | "stalled" | "ended";
  lesson: string;
};

export type DeepReportContent = {
  similarCases: {
    patternSummary: string;
    cases: DeepReportSimilarCase[];
  } | null;
  scenarios: DeepReportScenario[];
};

export type DraftCheckResult = {
  predictedReaction: string;
  riskLevel: "low" | "medium" | "high";
  risks: string[];
  improvedDraft: string;
  rationale: string;
};

export const DRAFT_CHECK_LIMIT = 5;

const ACTION_LABELS: Record<string, string> = {
  keep_light: "부담 없는 톤으로 연결을 유지한다",
  suggest_date: "가볍게 다음 만남을 제안한다",
  slow_down: "한 템포 낮추고 반응을 지켜본다",
  wait_for_response: "추가 메시지 없이 반응을 기다린다",
  consider_stopping: "투자를 줄이고 거리를 조절한다",
};

function toOutcome(label: string): DeepReportSimilarCase["outcome"] {
  return label === "progressed" || label === "stalled" || label === "ended"
    ? label
    : "stalled";
}

/**
 * LLM 실패 시 부분 리포트. 유사 사례는 검색 원자료를 그대로 요약하고,
 * 시나리오는 규칙 기반 추천 행동 1개를 골격으로 만든다.
 */
export function buildFallbackDeepReport(params: {
  recommendedAction: string;
  recommendedActionReason: string;
  referenceCases: ReferenceCaseHit[];
}): DeepReportContent {
  const cases = params.referenceCases.slice(0, 3).map((hit) => ({
    situationType: hit.situationType,
    flowSummary: hit.summaryText,
    outcome: toOutcome(hit.outcomeLabel),
    lesson: hit.lesson,
  }));

  return {
    similarCases:
      cases.length > 0
        ? {
            patternSummary:
              "비슷한 상황의 기록을 찾았어요. 아래 사례 흐름을 참고하되, 세부 상황은 다를 수 있어요.",
            cases,
          }
        : null,
    scenarios: [
      {
        actionLabel: ACTION_LABELS[params.recommendedAction] ?? "현재 흐름을 유지한다",
        expectedFlow: `기본 분석 기준으로는 이 경로가 안전해 보여요. ${params.recommendedActionReason}`,
        risk: "지금은 상세 시뮬레이션을 만들지 못했어요. 아래 초안 검증으로 개별 메시지를 점검해 보세요.",
        bestMessage: "",
        timing: "상황에 맞게",
        confidence: "low",
      },
    ],
  };
}
