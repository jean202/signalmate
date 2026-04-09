/**
 * 최종 결과 품질 체크 도구.
 *
 * 유해한 조언, 일관성, 증거 기반 여부를 검증합니다.
 */
export type QualityCheckResult = {
  passed: boolean;
  issues: string[];
  warnings: string[];
  summary: string;
};

/** 유해 패턴 — 스토킹, 조종, 과도한 집착 관련 표현 */
const HARMFUL_PATTERNS = [
  /몰래|미행|추적|감시/,
  /집\s*앞에?\s*(가|가서|에서)\s*기다/,
  /강제|억지|무조건\s*만나/,
  /질투\s*나게|다른\s*(남자|여자).*(만나|얘기)/,
  /무시\s*해|차갑게\s*대/,
  /폭탄\s*문자|연속\s*연락|답장\s*올\s*때까지/,
  /통제|지배|소유/,
];

export function checkQuality(params: {
  signals: { signalType: string; signalKey: string; title: string; description: string; evidenceText: string }[];
  recommendations: { title: string; content: string; rationale: string }[];
  overallSummary: string;
  recommendedAction: string;
  rawText: string;
}): QualityCheckResult {
  const issues: string[] = [];
  const warnings: string[] = [];

  // 1. 유해 조언 검사
  for (const rec of params.recommendations) {
    const combined = `${rec.title} ${rec.content} ${rec.rationale}`;
    for (const pattern of HARMFUL_PATTERNS) {
      if (pattern.test(combined)) {
        issues.push(`유해 표현 감지: "${rec.title}" — ${pattern.source}`);
      }
    }
  }

  // 2. 시그널-증거 일관성
  for (const signal of params.signals) {
    if (!signal.evidenceText || signal.evidenceText.trim().length < 5) {
      warnings.push(`시그널 "${signal.signalKey}"에 증거가 불충분합니다.`);
    }

    if (signal.description && signal.description.length < 10) {
      warnings.push(`시그널 "${signal.signalKey}"의 설명이 너무 짧습니다.`);
    }
  }

  // 3. 추천 액션과 시그널 일관성
  const positiveCount = params.signals.filter((s) => s.signalType === "positive").length;
  const cautionCount = params.signals.filter((s) => s.signalType === "caution").length;

  if (params.recommendedAction === "suggest_date" && cautionCount > positiveCount) {
    warnings.push("주의 시그널이 더 많은데 데이트를 제안하는 건 일관성이 떨어집니다.");
  }

  if (params.recommendedAction === "consider_stopping" && positiveCount > cautionCount + 1) {
    warnings.push("긍정 시그널이 더 많은데 관계 중단을 추천하는 건 일관성이 떨어집니다.");
  }

  // 4. 추천 메시지 완성도
  if (params.recommendations.length < 3) {
    warnings.push(`추천이 ${params.recommendations.length}개뿐입니다. 3개를 권장합니다.`);
  }

  // 5. 전체 요약 품질
  if (params.overallSummary.length < 20) {
    warnings.push("전체 요약이 너무 짧습니다.");
  }

  // 6. 데이터 부족 경고
  if (params.signals.length <= 1) {
    warnings.push("시그널이 1개 이하라 판단하기 어렵습니다. '더 많은 대화가 필요합니다' 권고를 고려하세요.");
  }

  const passed = issues.length === 0;

  const summaryParts: string[] = [];
  if (passed && warnings.length === 0) {
    summaryParts.push("품질 체크 통과. 이슈 없음.");
  } else if (passed) {
    summaryParts.push(`품질 체크 통과. 경고 ${warnings.length}건: ${warnings.join("; ")}`);
  } else {
    summaryParts.push(`품질 체크 실패! 이슈 ${issues.length}건: ${issues.join("; ")}`);
    if (warnings.length > 0) {
      summaryParts.push(`경고 ${warnings.length}건: ${warnings.join("; ")}`);
    }
  }

  return {
    passed,
    issues,
    warnings,
    summary: summaryParts.join(" "),
  };
}
