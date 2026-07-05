/**
 * 최종 결과 품질 체크 도구.
 *
 * 유해한 조언, 일관성, 증거 기반 여부를 검증합니다.
 *
 * `recommendedConfidence`는 calibration 신호입니다.
 * - "low": warnings가 많거나 약한 증거가 절반 이상 → 신뢰도를 낮추라는 권고
 * - null: 권고 없음 (분석 결과의 confidence 그대로 사용)
 *
 * runner는 이 값을 보고 분석의 confidenceLevel을 다운그레이드합니다 (절대 올리지 않음).
 */
export type ConfidenceRecommendation = "low" | null;

export type QualityCheckResult = {
  passed: boolean;
  issues: string[];
  warnings: string[];
  summary: string;
  recommendedConfidence: ConfidenceRecommendation;
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

const PRESSURE_PATTERNS = [
  /답장\s*(해|줘|주세요|바로|빨리)/,
  /왜\s*(답장|연락).*(안|없)/,
  /기다리고\s*있/,
  /계속\s*(연락|문자|카톡)/,
  /꼭\s*(만나|봐|답장|연락)/,
  /지금\s*(바로|당장)/,
  /제발/,
  /읽씹|안읽씹/,
  /서운/,
  /확실히\s*(말|대답)/,
];

const EARLY_STAGE_OVERINTIMACY_PATTERNS = [
  /사귀/,
  /연인|남친|여친/,
  /보고\s*싶/,
  /좋아해|사랑/,
  /내\s*(사람|꺼)/,
  /너밖에|당신밖에/,
  /매일\s*(연락|보고)/,
  /우리\s*사이/,
  /진지하게\s*(만나|생각)/,
];

const PATTERN_SUMMARY_HINTS = [
  "상대 메시지",
  "내 메시지",
  "평균",
  "비율",
  "패턴",
  "질문",
  "응답",
  "답장",
  "발화",
  "대화",
  "마지막",
  "총 ",
  "회",
  "개",
  "%",
];

export function checkQuality(params: {
  signals: { signalType: string; signalKey: string; title: string; description: string; evidenceText: string }[];
  recommendations: { recommendationType?: string; title: string; content: string; rationale: string }[];
  overallSummary: string;
  recommendedAction: string;
  rawText: string;
  situationContext?: string | null;
  relationshipStage?: string;
}): QualityCheckResult {
  const issues: string[] = [];
  const warnings: string[] = [];
  const evidenceCorpus = [params.rawText, params.situationContext]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join("\n");

  // 1. 유해 조언 검사
  for (const rec of params.recommendations) {
    const recommendationType = rec.recommendationType ?? "";
    const combined = `${rec.title} ${rec.content} ${rec.rationale}`;
    const isAvoidanceAdvice = recommendationType === "avoid_phrase" && hasAvoidanceCue(combined);

    for (const pattern of HARMFUL_PATTERNS) {
      if (pattern.test(combined)) {
        if (isAvoidanceAdvice) continue;
        issues.push(`유해 표현 감지: "${rec.title}" — ${pattern.source}`);
      }
    }

    if (recommendationType === "next_message") {
      for (const pattern of PRESSURE_PATTERNS) {
        if (pattern.test(rec.content)) {
          issues.push(`압박성 다음 메시지 감지: "${rec.title}" — ${pattern.source}`);
        }
      }

      if (isEarlyRelationshipStage(params.relationshipStage)) {
        for (const pattern of EARLY_STAGE_OVERINTIMACY_PATTERNS) {
          if (pattern.test(rec.content)) {
            issues.push(`관계 단계 대비 과몰입 표현 감지: "${rec.title}" — ${pattern.source}`);
          }
        }
      }

      const contentLength = countVisibleChars(rec.content);
      if (contentLength > 220) {
        issues.push(`다음 메시지가 너무 깁니다: "${rec.title}" — ${contentLength}자`);
      } else if (contentLength > 140) {
        warnings.push(`다음 메시지가 다소 깁니다: "${rec.title}" — ${contentLength}자`);
      }

      if ((rec.content.match(/\?/g) ?? []).length > 2) {
        warnings.push(`다음 메시지에 질문이 많아 부담스러울 수 있습니다: "${rec.title}"`);
      }
    } else if (countVisibleChars(rec.content) > 450) {
      warnings.push(`추천 내용이 다소 깁니다: "${rec.title}"`);
    }
  }

  // 2. 시그널-증거 일관성
  const normalizedEvidenceCorpus = normalizeForEvidenceMatch(evidenceCorpus);
  for (const signal of params.signals) {
    if (!signal.evidenceText || signal.evidenceText.trim().length < 5) {
      warnings.push(`시그널 "${signal.signalKey}"에 증거가 불충분합니다.`);
      continue;
    }

    if (signal.description && signal.description.length < 10) {
      warnings.push(`시그널 "${signal.signalKey}"의 설명이 너무 짧습니다.`);
    }

    const quotedEvidence = extractQuotedEvidence(signal.evidenceText);
    for (const quote of quotedEvidence) {
      if (!normalizedEvidenceCorpus.includes(normalizeForEvidenceMatch(quote))) {
        issues.push(`시그널 "${signal.signalKey}"의 인용 근거가 원문에 없습니다: "${quote}"`);
      }
    }

    if (
      quotedEvidence.length === 0 &&
      !looksLikePatternSummary(signal.evidenceText) &&
      !hasEvidenceTokenOverlap(signal.evidenceText, evidenceCorpus)
    ) {
      warnings.push(`시그널 "${signal.signalKey}"의 근거가 원문과 약하게 연결됩니다.`);
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

  // ─── 신뢰도 calibration ─────────────────────────────────
  // "low"를 권고하는 조건:
  //   - warnings 3개 이상 (전반적인 품질 신호 약함)
  //   - 증거가 약한 시그널이 전체의 절반 이상 (인용 근거 부족)
  //   - 시그널이 1개 이하 (데이터 부족)
  const weakEvidenceWarnings = warnings.filter((w) =>
    w.includes("증거가 불충분") || w.includes("원문과 약하게 연결"),
  ).length;

  const totalSignals = params.signals.length;
  const weakEvidenceRatio = totalSignals > 0 ? weakEvidenceWarnings / totalSignals : 0;

  let recommendedConfidence: ConfidenceRecommendation = null;
  if (warnings.length >= 3) {
    recommendedConfidence = "low";
  } else if (weakEvidenceRatio >= 0.5 && totalSignals >= 2) {
    recommendedConfidence = "low";
  } else if (totalSignals <= 1) {
    recommendedConfidence = "low";
  }

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

  if (recommendedConfidence === "low") {
    summaryParts.push(`신뢰도 다운그레이드 권고 (warnings=${warnings.length}, weakEvidence=${weakEvidenceWarnings}/${totalSignals}).`);
  }

  return {
    passed,
    issues,
    warnings,
    summary: summaryParts.join(" "),
    recommendedConfidence,
  };
}

function hasAvoidanceCue(text: string): boolean {
  return /피하|하지\s*마|삼가|안\s*좋|부담|금물|말고|대신|자제/.test(text);
}

function isEarlyRelationshipStage(stage: string | undefined): boolean {
  return stage === "before_meeting" || stage === "after_first_date";
}

function countVisibleChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function normalizeForEvidenceMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”‘’"「」『』.,!?…~ㅠㅎㅋ♡♥😊🙂:;()[\]{}<>\-\s]/g, "");
}

function extractQuotedEvidence(text: string): string[] {
  const quotes: string[] = [];
  const patterns = [
    /"([^"]+)"/g,
    /“([^”]+)”/g,
    /'([^']+)'/g,
    /‘([^’]+)’/g,
    /「([^」]+)」/g,
    /『([^』]+)』/g,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const quote = match[1]?.trim();
      if (quote && quote.length >= 2) {
        quotes.push(quote);
      }
    }
  }

  return quotes;
}

function looksLikePatternSummary(evidenceText: string): boolean {
  return PATTERN_SUMMARY_HINTS.some((hint) => evidenceText.includes(hint));
}

function hasEvidenceTokenOverlap(evidenceText: string, rawText: string): boolean {
  const rawTokens = new Set(extractKoreanTokens(rawText));
  const evidenceTokens = extractKoreanTokens(evidenceText).filter(
    (token) => !["상대", "메시지", "대화", "근거", "확인"].includes(token),
  );

  if (evidenceTokens.length === 0) return true;
  const overlapCount = evidenceTokens.filter((token) => rawTokens.has(token)).length;
  return overlapCount >= Math.min(2, evidenceTokens.length);
}

function extractKoreanTokens(text: string): string[] {
  return text.match(/[가-힣A-Za-z0-9]{2,}/g) ?? [];
}
