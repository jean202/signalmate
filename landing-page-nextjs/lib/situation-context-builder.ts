/**
 * Mode B: 가이드 질문 응답을 자연스러운 한국어 문장으로 조합합니다.
 *
 * 결과는 situationContext 컬럼에 저장됩니다 (DB 스키마 변경 없음).
 */

import type { GuidedAnswers } from "@/lib/situation-input";

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

const INPUT_FOCUS_LABELS: Record<string, string> = {
  chat: "입력은 채팅 대화 중심입니다",
  meeting_note: "입력은 실제 만남 후기 중심입니다",
  mixed: "입력은 채팅과 실제 만남 후기가 섞여 있습니다",
  follow_up: "입력은 만남 뒤 연락 흐름 중심입니다",
};

const OTHER_INITIATIVE_LABELS: Record<string, string> = {
  low: "상대 적극성은 낮아 보였습니다",
  medium: "상대 적극성은 보통으로 보였습니다",
  high: "상대 적극성은 높아 보였습니다",
  unknown: "상대 적극성은 아직 판단하기 어렵습니다",
};

const AFTER_MEETING_CONTACT_LABELS: Record<string, string> = {
  none: "만남 뒤 아직 연락이 없습니다",
  self_first: "만남 뒤에는 내가 먼저 연락했습니다",
  other_first: "만남 뒤에는 상대가 먼저 연락했습니다",
  slower: "만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다",
  ongoing: "만남 뒤 연락이 이어지고 있습니다",
  not_applicable: "만남 뒤 연락 흐름은 아직 해당 없습니다",
};

const DESIRED_HELP_LABELS: Record<string, string> = {
  next_message: "사용자는 다음 메시지를 어떻게 보낼지 알고 싶어합니다",
  ask_for_date: "사용자는 애프터나 다음 만남을 제안해도 되는지 알고 싶어합니다",
  wait_or_send: "사용자는 연락을 더 할지 기다릴지 판단하고 싶어합니다",
  decide_to_stop: "사용자는 관계를 정리할지 판단하고 싶어합니다",
};

// ─── 조합 함수 ────────────────────────────────────────

/**
 * 가이드 응답을 자연스러운 한국어 문단으로 조합합니다.
 *
 * @returns 조합된 텍스트. 모든 항목이 비어있으면 null.
 */
export function buildGuidedSituationContext(answers: GuidedAnswers): string | null {
  const sentences: string[] = [];

  if (answers.inputFocus && INPUT_FOCUS_LABELS[answers.inputFocus]) {
    sentences.push(INPUT_FOCUS_LABELS[answers.inputFocus]);
  }

  // Q1: 오프라인 만남 횟수
  if (answers.meetingCount && MEETING_COUNT_LABELS[answers.meetingCount]) {
    sentences.push(MEETING_COUNT_LABELS[answers.meetingCount]);
  }

  // Q2: 만남 분위기
  if (answers.meetingVibe && answers.meetingVibe !== "none" && MEETING_VIBE_LABELS[answers.meetingVibe]) {
    sentences.push(MEETING_VIBE_LABELS[answers.meetingVibe]);
  }

  if (answers.otherInitiative && OTHER_INITIATIVE_LABELS[answers.otherInitiative]) {
    sentences.push(OTHER_INITIATIVE_LABELS[answers.otherInitiative]);
  }

  if (answers.afterMeetingContact && AFTER_MEETING_CONTACT_LABELS[answers.afterMeetingContact]) {
    sentences.push(AFTER_MEETING_CONTACT_LABELS[answers.afterMeetingContact]);
  }

  if (answers.desiredHelp && DESIRED_HELP_LABELS[answers.desiredHelp]) {
    sentences.push(DESIRED_HELP_LABELS[answers.desiredHelp]);
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

  return sentences.map((sentence) => sentence.replace(/\.+$/g, "")).join(". ") + ".";
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
  const trimmedGuidedFree = guidedAnswers?.freeText?.trim() || null;

  if (guidedText && trimmedFree) {
    if (trimmedGuidedFree && trimmedGuidedFree === trimmedFree) {
      return guidedText.slice(0, 2000);
    }

    // 가이드 텍스트 + 추가 자유 입력
    return `${guidedText} ${trimmedFree}`.slice(0, 2000);
  }

  return (guidedText || trimmedFree)?.slice(0, 2000) ?? null;
}

export type { GuidedAnswers } from "@/lib/situation-input";
