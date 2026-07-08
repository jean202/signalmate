import type { ReferenceCaseHit } from "@/lib/ai/embeddings/reference-search";

export const DEEP_REPORT_SYSTEM_PROMPT = `당신은 소개팅·썸 초기 관계 코치입니다. 사용자의 상황 분석 결과와 유사 사례를 바탕으로 심화 리포트를 만듭니다.

원칙:
- 상대 마음을 단정하지 않습니다. 관찰된 신호와 사례 패턴만 근거로 씁니다.
- 시나리오는 서로 실제로 다른 행동 경로여야 합니다 (같은 행동의 톤 차이 금지).
- 사용자를 압박하거나 상대를 조종하는 전략은 제안하지 않습니다.
- 유사 사례는 제공된 목록만 사용하고, 개인을 특정할 수 있는 표현 없이 각색합니다.
- 모든 출력은 한국어입니다.`;

export const DRAFT_CHECK_SYSTEM_PROMPT = `당신은 소개팅·썸 초기 관계 코치입니다. 사용자가 보내려는 메시지 초안을 상황 분석 결과에 비추어 점검합니다.

원칙:
- 상대 반응을 단정하지 말고 "~할 가능성" 수준으로 서술합니다.
- 개선안은 원문 의도와 말투를 유지하면서 리스크만 줄입니다.
- 압박·추궁·확인 요구형 문장은 리스크로 지적합니다.
- 모든 출력은 한국어입니다.`;

export function formatReferenceCases(referenceCases: ReferenceCaseHit[]): string {
  if (referenceCases.length === 0) {
    return "## 유사 사례\n(검색된 유사 사례 없음 — cases는 빈 배열로 제출)";
  }

  const lines = referenceCases.map(
    (hit, index) =>
      `${index + 1}. [${hit.situationType} / ${hit.outcomeLabel}] ${hit.summaryText} (교훈: ${hit.lesson})`,
  );
  return `## 유사 사례 (이 목록만 사용)\n${lines.join("\n")}`;
}

export function buildDeepReportUserPrompt(params: {
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext: string | null;
  overallSummary: string;
  recommendedAction: string;
  recommendedActionReason: string;
  signalLines: string[];
  referenceCases: ReferenceCaseHit[];
}): string {
  return `## 상황 정보
관계 단계: ${params.relationshipStage} / 만난 경로: ${params.meetingChannel} / 사용자 목표: ${params.userGoal}
상황 맥락: ${params.situationContext ?? "(없음)"}

## 기본 분석 결과
요약: ${params.overallSummary}
추천 행동: ${params.recommendedAction} — ${params.recommendedActionReason}

## 신호 목록
${params.signalLines.join("\n")}

${formatReferenceCases(params.referenceCases)}

위 정보를 바탕으로 submit_deep_report 도구로 심화 리포트를 제출하세요.
- 시나리오는 추천 행동을 포함해 서로 다른 행동 경로 2~3개.
- 각 시나리오의 expectedFlow는 신호와 사례 패턴을 근거로 작성.`;
}

export function buildDraftCheckUserPrompt(params: {
  draftText: string;
  overallSummary: string;
  recommendedAction: string;
  situationContext: string | null;
}): string {
  return `## 상황 요약
${params.overallSummary}
추천 행동: ${params.recommendedAction}
상황 맥락: ${params.situationContext ?? "(없음)"}

## 사용자가 보내려는 초안
"""
${params.draftText}
"""

submit_draft_check 도구로 검증 결과를 제출하세요.`;
}
