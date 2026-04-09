/**
 * Mode B: 가이드 질문 응답을 자연스러운 한국어 문장으로 조합합니다.
 *
 * 결과는 situationContext 컬럼에 저장됩니다 (DB 스키마 변경 없음).
 */

// ─── 타입 ─────────────────────────────────────────────

export type GuidedAnswers = {
  /** 오프라인 만남 횟수 */
  meetingCount?: "none" | "once" | "2_3_times" | "4_plus";
  /** 만났을 때 분위기 (meetingCount가 none이 아닌 경우) */
  meetingVibe?: "awkward" | "normal" | "good" | "great";
  /** 상대 커뮤니케이션 스타일 (복수 선택) */
  otherStyle?: (
    | "fast_reply"
    | "slow_reply"
    | "short_messages"
    | "long_messages"
    | "uses_emoji"
    | "unknown"
  )[];
  /** 자유 입력 (최대 500자) */
  freeText?: string;
};

// ─── 레이블 매핑 ──────────────────────────────────────

const MEETING_COUNT_LABELS: Record<string, string> = {
  none: "아직 직접 만난 적이 없습니다",
  once: "직접 1번 만났습니다",
  "2_3_times": "직접 2~3번 만났습니다",
  "4_plus": "직접 4번 이상 만났습니다",
};

const MEETING_VIBE_LABELS: Record<string, string> = {
  awkward: "만났을 때 분위기는 어색했습니다",
  normal: "만났을 때 분위기는 보통이었습니다",
  good: "만났을 때 분위기는 좋았습니다",
  great: "만났을 때 분위기가 아주 좋았고, 상대도 다음 만남을 언급했습니다",
};

const OTHER_STYLE_LABELS: Record<string, string> = {
  fast_reply: "답장이 빠른 편",
  slow_reply: "답장이 느린 편 (반나절~하루)",
  short_messages: "짧게 답하는 스타일",
  long_messages: "길게 적는 스타일",
  uses_emoji: "이모지/이모티콘을 자주 사용",
  unknown: "메시지 스타일을 잘 모르겠음",
};

// ─── 조합 함수 ────────────────────────────────────────

/**
 * 가이드 응답을 자연스러운 한국어 문단으로 조합합니다.
 *
 * @returns 조합된 텍스트. 모든 항목이 비어있으면 null.
 */
export function buildGuidedSituationContext(answers: GuidedAnswers): string | null {
  const sentences: string[] = [];

  // Q1: 오프라인 만남 횟수
  if (answers.meetingCount && MEETING_COUNT_LABELS[answers.meetingCount]) {
    sentences.push(MEETING_COUNT_LABELS[answers.meetingCount]);
  }

  // Q2: 만남 분위기 (만난 적 있을 때만)
  if (
    answers.meetingCount &&
    answers.meetingCount !== "none" &&
    answers.meetingVibe &&
    MEETING_VIBE_LABELS[answers.meetingVibe]
  ) {
    sentences.push(MEETING_VIBE_LABELS[answers.meetingVibe]);
  }

  // Q3: 상대 커뮤니케이션 스타일
  if (answers.otherStyle && answers.otherStyle.length > 0) {
    const styleLabels = answers.otherStyle
      .map((s) => OTHER_STYLE_LABELS[s])
      .filter(Boolean);
    if (styleLabels.length > 0) {
      sentences.push(`상대는 ${styleLabels.join(", ")}입니다`);
    }
  }

  // Q4: 자유 입력
  const freeText = answers.freeText?.trim().slice(0, 500);
  if (freeText) {
    sentences.push(freeText);
  }

  if (sentences.length === 0) return null;

  return sentences.join(". ").replace(/\.\./g, ".") + ".";
}

/**
 * Mode A(자유 텍스트)와 Mode B(가이드 응답)를 병합합니다.
 *
 * - guidedAnswers가 있으면 우선 사용
 * - 자유 텍스트가 추가로 있으면 뒤에 덧붙임
 * - 둘 다 없으면 null
 */
export function mergeSituationContext(
  freeText?: string | null,
  guidedAnswers?: GuidedAnswers | null,
): string | null {
  const guidedText = guidedAnswers ? buildGuidedSituationContext(guidedAnswers) : null;
  const trimmedFree = freeText?.trim() || null;

  if (guidedText && trimmedFree) {
    // 가이드 텍스트 + 추가 자유 입력
    return `${guidedText} ${trimmedFree}`.slice(0, 2000);
  }

  return (guidedText || trimmedFree)?.slice(0, 2000) ?? null;
}
