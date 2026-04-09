import type { StoredConversationMessage } from "@/lib/analysis-store";

/**
 * 대화 전후반 톤 변화 감지 도구.
 */
export type ToneShiftResult = {
  /** 전반부 톤 지표 */
  firstHalf: ToneMetrics;
  /** 후반부 톤 지표 */
  secondHalf: ToneMetrics;
  /** 톤 변화 감지 여부 */
  hasShift: boolean;
  /** 변화 방향 */
  shiftDirection: "warming" | "cooling" | "stable";
  /** 요약 텍스트 */
  summary: string;
};

type ToneMetrics = {
  warmMarkerCount: number;
  hedgeMarkerCount: number;
  avgMessageLength: number;
  questionCount: number;
  emojiCount: number;
};

const WARM_PATTERNS = /[!~ㅎㅋ😊😄🥰❤️💕👍🙂😆]+/g;
const HEDGE_PATTERNS = /애매|모르겠|바쁘|나중에|글쎄|좀|힘들|괜찮|그냥/g;
const QUESTION_PATTERN = /\?|뭐|어때|할까|볼까|갈까|있어|있나|인가|일까/g;
const EMOJI_PATTERN = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

function analyzeTone(messages: StoredConversationMessage[]): ToneMetrics {
  const otherMsgs = messages.filter((m) => m.senderRole === "other");
  if (otherMsgs.length === 0) {
    return { warmMarkerCount: 0, hedgeMarkerCount: 0, avgMessageLength: 0, questionCount: 0, emojiCount: 0 };
  }

  let warmCount = 0;
  let hedgeCount = 0;
  let questionCount = 0;
  let emojiCount = 0;
  let totalLength = 0;

  for (const msg of otherMsgs) {
    const text = msg.messageText;
    warmCount += (text.match(WARM_PATTERNS) || []).length;
    hedgeCount += (text.match(HEDGE_PATTERNS) || []).length;
    questionCount += (text.match(QUESTION_PATTERN) || []).length;
    emojiCount += (text.match(EMOJI_PATTERN) || []).length;
    totalLength += text.length;
  }

  return {
    warmMarkerCount: warmCount,
    hedgeMarkerCount: hedgeCount,
    avgMessageLength: Math.round(totalLength / otherMsgs.length),
    questionCount,
    emojiCount,
  };
}

export function detectToneShift(messages: StoredConversationMessage[]): ToneShiftResult {
  const sorted = [...messages].sort((a, b) => a.sequenceNo - b.sequenceNo);
  const mid = Math.floor(sorted.length / 2);

  const firstHalf = analyzeTone(sorted.slice(0, mid));
  const secondHalf = analyzeTone(sorted.slice(mid));

  // 톤 변화 판단
  const warmDiff = secondHalf.warmMarkerCount - firstHalf.warmMarkerCount;
  const hedgeDiff = secondHalf.hedgeMarkerCount - firstHalf.hedgeMarkerCount;
  const lengthDiff = secondHalf.avgMessageLength - firstHalf.avgMessageLength;

  let shiftDirection: "warming" | "cooling" | "stable" = "stable";
  let hasShift = false;

  if (warmDiff >= 2 || (lengthDiff > 5 && hedgeDiff <= 0)) {
    shiftDirection = "warming";
    hasShift = true;
  } else if (hedgeDiff >= 2 || (lengthDiff < -5 && warmDiff <= 0)) {
    shiftDirection = "cooling";
    hasShift = true;
  }

  const summaryParts: string[] = [];

  if (shiftDirection === "warming") {
    summaryParts.push("후반부로 갈수록 상대의 톤이 따뜻해지고 있어요.");
    if (warmDiff > 0) summaryParts.push(`긍정 표현이 ${warmDiff}개 증가했어요.`);
    if (secondHalf.emojiCount > firstHalf.emojiCount) summaryParts.push("이모지 사용도 늘었어요.");
  } else if (shiftDirection === "cooling") {
    summaryParts.push("후반부로 갈수록 상대의 톤이 차가워지고 있어요.");
    if (hedgeDiff > 0) summaryParts.push(`유보적 표현이 ${hedgeDiff}개 증가했어요.`);
    if (lengthDiff < -5) summaryParts.push("메시지 길이도 줄어들었어요.");
  } else {
    summaryParts.push("전반부와 후반부의 톤이 비슷하게 유지되고 있어요.");
  }

  return {
    firstHalf,
    secondHalf,
    hasShift,
    shiftDirection,
    summary: summaryParts.join(" "),
  };
}
