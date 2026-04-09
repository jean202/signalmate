import type { StoredConversationMessage } from "@/lib/analysis-store";

/**
 * 메시지 시간 패턴 분석 도구.
 *
 * 응답 간격, 대화 흐름의 시간적 특성을 분석합니다.
 */
export type TimelineResult = {
  totalMessages: number;
  selfMessages: number;
  otherMessages: number;
  /** 연속 발화 패턴 (같은 화자가 2회 이상 연속) */
  selfConsecutiveCount: number;
  otherConsecutiveCount: number;
  /** 대화 주도권 (첫 메시지 발신자) */
  firstSender: string;
  /** 마지막 메시지 발신자 */
  lastSender: string;
  /** 메시지 길이 추이 (전반 vs 후반) */
  firstHalfAvgLength: number;
  secondHalfAvgLength: number;
  /** 대화가 자연스럽게 마무리되었는지 */
  hasNaturalEnding: boolean;
  /** 요약 텍스트 */
  summary: string;
};

export function analyzeTimeline(messages: StoredConversationMessage[]): TimelineResult {
  const sorted = [...messages].sort((a, b) => a.sequenceNo - b.sequenceNo);

  const selfMsgs = sorted.filter((m) => m.senderRole === "self");
  const otherMsgs = sorted.filter((m) => m.senderRole === "other");

  // 연속 발화 카운트
  let selfConsecutive = 0;
  let otherConsecutive = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].senderRole === sorted[i - 1].senderRole) {
      if (sorted[i].senderRole === "self") selfConsecutive++;
      else otherConsecutive++;
    }
  }

  // 전반/후반 메시지 길이
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  const avgLen = (msgs: StoredConversationMessage[]) =>
    msgs.length > 0 ? msgs.reduce((s, m) => s + m.messageText.length, 0) / msgs.length : 0;

  const firstHalfAvgLength = Math.round(avgLen(firstHalf));
  const secondHalfAvgLength = Math.round(avgLen(secondHalf));

  // 자연스러운 마무리 감지
  const closingPatterns = /잘\s*자|좋은\s*꿈|내일\s*봐|그럼\s*또|안녕|바이|굿나잇/;
  const lastMsg = sorted[sorted.length - 1];
  const hasNaturalEnding = closingPatterns.test(lastMsg?.messageText ?? "");

  // 요약
  const lengthTrend =
    secondHalfAvgLength > firstHalfAvgLength * 1.2
      ? "후반부에 대화가 더 활발해짐"
      : secondHalfAvgLength < firstHalfAvgLength * 0.6
        ? "후반부에 대화가 줄어듦 (관심 하락 가능성)"
        : "전반적으로 균일한 대화 흐름";

  const summary = [
    `총 ${sorted.length}개 메시지 (나: ${selfMsgs.length}, 상대: ${otherMsgs.length})`,
    `대화 시작: ${sorted[0]?.senderRole === "self" ? "내가" : "상대가"} 먼저`,
    `연속 발화: 나 ${selfConsecutive}회, 상대 ${otherConsecutive}회`,
    `메시지 길이 추이: ${lengthTrend}`,
    `전반 평균 ${firstHalfAvgLength}자, 후반 평균 ${secondHalfAvgLength}자`,
  ].join("\n");

  return {
    totalMessages: sorted.length,
    selfMessages: selfMsgs.length,
    otherMessages: otherMsgs.length,
    selfConsecutiveCount: selfConsecutive,
    otherConsecutiveCount: otherConsecutive,
    firstSender: sorted[0]?.senderRole ?? "unknown",
    lastSender: lastMsg?.senderRole ?? "unknown",
    firstHalfAvgLength,
    secondHalfAvgLength,
    hasNaturalEnding,
    summary,
  };
}
