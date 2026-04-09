import { randomUUID } from "node:crypto";
import type {
  ConfidenceLevel,
  RecommendedAction,
  StoredAnalysis,
  StoredConversation,
  StoredRecommendation,
  StoredSignal,
} from "@/lib/analysis-store";

type AnalysisBuildOptions = {
  analysisVersion?: string;
  modelName?: string;
};

type MessageMetrics = {
  totalMessages: number;
  selfMessages: number;
  otherMessages: number;
  otherResponsePairs: number;
  otherQuestionCount: number;
  selfSchedulingAskCount: number;
  otherFutureMentionCount: number;
  otherWarmCount: number;
  otherHedgeCount: number;
  otherDefinitePlanCount: number;
  otherAverageLength: number;
  selfAverageLength: number;
  lastSenderRole: "self" | "other" | "unknown" | null;
  firstSenderRole: "self" | "other" | "unknown" | null;
  selfToOtherRatio: number;
  otherShortReplyCount: number;
  hasClosingWithoutFollowUp: boolean;
  toneDrop: boolean;
};

const futurePattern =
  /(다음|또|같이|보자|가자|볼까요|가볼까요|주말|다음 주|이번 주|시간|약속|커피|전시|식사|산책)/i;
const questionPattern = /\?/;
const warmPattern = /[!~ㅎㅋ🙂😊😄😂😍]/;
const hedgePattern = /(애매|바쁘|나중에|다음에|봐야|모르겠|힘들|어려|조금|정신없|일정)/i;
const definitePlanPattern =
  /(\d{1,2}\s*시|\d{1,2}\s*일|월요일|화요일|수요일|목요일|금요일|토요일|일요일|내일|모레)/i;
const schedulingAskPattern = /(언제|주말|다음 주|이번 주|시간|볼까|볼까요|가볼까요|만날|약속)/i;
const closingPattern = /(잘 자|수고|바이|안녕|굿[나밤]|좋은 [밤꿈하]|내일 봐|들어가)/i;
const topicKeywords = ["전시", "커피", "식사", "영화", "산책", "공연", "맛집", "책", "드라이브"];

function averageLength(messages: string[]) {
  if (messages.length === 0) {
    return 0;
  }

  const totalLength = messages.reduce((sum, message) => sum + message.length, 0);
  return totalLength / messages.length;
}

function buildMetrics(conversation: StoredConversation): MessageMetrics {
  const otherMessages = conversation.messages.filter((message) => message.senderRole === "other");
  const selfMessages = conversation.messages.filter((message) => message.senderRole === "self");
  const otherResponsePairs = conversation.messages.reduce((count, message, index, messages) => {
    const nextMessage = messages[index + 1];

    if (message.senderRole === "self" && nextMessage?.senderRole === "other") {
      return count + 1;
    }

    return count;
  }, 0);

  const selfAvgLen = averageLength(selfMessages.map((message) => message.messageText));
  const otherAvgLen = averageLength(otherMessages.map((message) => message.messageText));
  const selfToOtherRatio =
    otherMessages.length > 0 ? selfMessages.length / otherMessages.length : selfMessages.length > 0 ? Infinity : 0;

  const otherShortReplyCount = otherMessages.filter(
    (message) => message.messageText.trim().length <= 5,
  ).length;

  const lastMessage = conversation.messages.at(-1);
  const secondLastMessage = conversation.messages.at(-2);
  const hasClosingWithoutFollowUp =
    secondLastMessage !== undefined &&
    closingPattern.test(secondLastMessage.messageText) &&
    lastMessage !== undefined &&
    secondLastMessage.senderRole === lastMessage.senderRole;

  let toneDrop = false;
  if (otherMessages.length >= 4) {
    const half = Math.floor(otherMessages.length / 2);
    const firstHalf = otherMessages.slice(0, half);
    const secondHalf = otherMessages.slice(half);
    const firstHalfAvg = averageLength(firstHalf.map((m) => m.messageText));
    const secondHalfAvg = averageLength(secondHalf.map((m) => m.messageText));
    toneDrop = secondHalfAvg < firstHalfAvg * 0.6;
  }

  return {
    totalMessages: conversation.messages.length,
    selfMessages: selfMessages.length,
    otherMessages: otherMessages.length,
    otherResponsePairs,
    otherQuestionCount: otherMessages.filter((message) => questionPattern.test(message.messageText)).length,
    selfSchedulingAskCount: selfMessages.filter((message) =>
      schedulingAskPattern.test(message.messageText),
    ).length,
    otherFutureMentionCount: otherMessages.filter((message) =>
      futurePattern.test(message.messageText),
    ).length,
    otherWarmCount: otherMessages.filter((message) => warmPattern.test(message.messageText)).length,
    otherHedgeCount: otherMessages.filter((message) => hedgePattern.test(message.messageText)).length,
    otherDefinitePlanCount: otherMessages.filter((message) =>
      definitePlanPattern.test(message.messageText),
    ).length,
    otherAverageLength: otherAvgLen,
    selfAverageLength: selfAvgLen,
    lastSenderRole: conversation.messages.at(-1)?.senderRole ?? null,
    firstSenderRole: conversation.messages.at(0)?.senderRole ?? null,
    selfToOtherRatio,
    otherShortReplyCount,
    hasClosingWithoutFollowUp,
    toneDrop,
  };
}

function buildSignalFactory() {
  const signals: StoredSignal[] = [];

  return {
    add(
      signalType: StoredSignal["signalType"],
      signalKey: string,
      title: string,
      description: string,
      evidenceText: string,
      confidenceLevel: StoredSignal["confidenceLevel"],
    ) {
      signals.push({
        id: randomUUID(),
        signalType,
        signalKey,
        title,
        description,
        evidenceText,
        confidenceLevel,
        displayOrder: signals.length + 1,
      });
    },
    list() {
      return signals;
    },
  };
}

function buildSummary(metrics: MessageMetrics, positiveCount: number, cautionCount: number) {
  if (metrics.otherMessages === 0) {
    return "상대 반응이 아직 없어 관계 신호를 충분히 읽기 어려운 상태입니다.";
  }

  if (positiveCount >= 2 && cautionCount === 0) {
    return "대화 흐름은 비교적 안정적이며, 가볍게 다음 제안까지 검토할 만한 상태입니다.";
  }

  if (positiveCount >= 1 && cautionCount >= 1) {
    return "관심 신호는 보이지만, 아직 일정 확정이나 확신 단계로 단정하기는 이릅니다.";
  }

  if (cautionCount >= 1) {
    return "반응은 이어지더라도 현재는 속도를 낮추고 해석을 보수적으로 가져가는 편이 안전합니다.";
  }

  return "대화는 이어지고 있지만 아직 탐색 단계라서, 명확한 호감 신호보다는 패턴을 더 지켜봐야 합니다.";
}

function buildConfidenceLevel(metrics: MessageMetrics, signalCount: number): ConfidenceLevel {
  let score = 0;

  if (metrics.totalMessages >= 6) {
    score += 1;
  }

  if (metrics.otherMessages >= 3) {
    score += 1;
  }

  if (signalCount >= 3) {
    score += 1;
  }

  if (score >= 3) {
    return "high";
  }

  if (score === 2) {
    return "medium";
  }

  return "low";
}

function buildRecommendedAction(
  metrics: MessageMetrics,
  positiveCount: number,
  cautionCount: number,
): {
  action: RecommendedAction;
  reason: string;
} {
  if (metrics.otherMessages === 0) {
    return {
      action: "wait_for_response",
      reason: "상대 반응이 아직 없어 추가 메시지를 몰아보내기보다 응답을 기다리는 편이 낫습니다.",
    };
  }

  if (positiveCount >= 2 && cautionCount === 0 && metrics.otherFutureMentionCount > 0) {
    return {
      action: "suggest_date",
      reason: "상대가 대화를 이어가고 미래 지향 표현도 보여서, 가벼운 약속 제안을 해볼 만합니다.",
    };
  }

  if (
    metrics.selfSchedulingAskCount > 0 &&
    metrics.otherHedgeCount > 0 &&
    metrics.otherDefinitePlanCount === 0
  ) {
    return {
      action: positiveCount > 0 ? "keep_light" : "wait_for_response",
      reason: "일정 관련 반응은 왔지만 아직 구체화가 약하므로, 압박보다 가벼운 연결이 더 안전합니다.",
    };
  }

  if (cautionCount >= 2 && positiveCount === 0) {
    return {
      action: "consider_stopping",
      reason: "경고 신호가 누적되고 긍정 신호가 약해, 추가 투입 전에 관계 정리 가능성도 함께 보는 편이 좋습니다.",
    };
  }

  if (metrics.lastSenderRole === "self") {
    return {
      action: "wait_for_response",
      reason: "마지막 공이 아직 상대에게 있으므로, 답장을 재촉하기보다 반응을 기다리는 편이 좋습니다.",
    };
  }

  if (positiveCount > cautionCount) {
    return {
      action: "keep_light",
      reason: "흐름은 나쁘지 않지만 확신 단계는 아니므로, 가볍게 온도를 유지하는 접근이 적합합니다.",
    };
  }

  return {
    action: "slow_down",
    reason: "신호가 뚜렷하지 않으니, 메시지 강도를 낮추고 반응을 더 지켜보는 편이 안전합니다.",
  };
}

function buildConversationHook(conversation: StoredConversation) {
  for (const keyword of topicKeywords) {
    if (conversation.rawText.includes(keyword)) {
      return `${keyword} 이야기`;
    }
  }

  return "아까 나눈 이야기";
}

function buildRecommendations(
  action: RecommendedAction,
  reason: string,
  conversation: StoredConversation,
): StoredRecommendation[] {
  const hook = buildConversationHook(conversation);

  const templates: Record<RecommendedAction, Omit<StoredRecommendation, "id" | "displayOrder">[]> = {
    keep_light: [
      {
        recommendationType: "next_message",
        title: "가볍게 연결 유지하기",
        content: `${hook} 계속 생각났어요. 여유 생길 때 가볍게 이어서 이야기해도 좋겠어요.`,
        rationale: reason,
        toneLabel: "light",
      },
      {
        recommendationType: "tone_guide",
        title: "부담 없는 톤 유지",
        content: "확답을 재촉하기보다 공통 화제나 안부로 대화 온도를 유지하는 편이 좋습니다.",
        rationale: "지금은 확신보다 탐색 단계이므로, 부담 없는 후속 대화가 더 자연스럽습니다.",
        toneLabel: "steady",
      },
      {
        recommendationType: "avoid_phrase",
        title: "압박형 질문은 피하기",
        content: "왜 답이 늦어요?, 그럼 언제 돼요? 같은 문장은 지금 단계에서 압박으로 들릴 수 있습니다.",
        rationale: "일정이 아직 정리되지 않은 단계에서 압박형 문장은 오히려 온도를 떨어뜨릴 수 있습니다.",
        toneLabel: "avoid",
      },
    ],
    suggest_date: [
      {
        recommendationType: "next_message",
        title: "짧고 구체적인 제안",
        content: `지난번 ${hook} 재밌었어요. 다음 주에 시간 맞으면 가볍게 커피나 산책 어때요?`,
        rationale: reason,
        toneLabel: "direct",
      },
      {
        recommendationType: "tone_guide",
        title: "선택지가 있는 제안",
        content: "막연한 제안보다 날짜 범위나 활동을 한 단계만 구체화하는 편이 응답하기 쉽습니다.",
        rationale: "긍정 신호가 있는 흐름에서는 짧고 명확한 제안이 전환율이 높습니다.",
        toneLabel: "clear",
      },
      {
        recommendationType: "avoid_phrase",
        title: "무거운 의미 부여는 보류",
        content: "우리 이제 좀 진전된 거 같죠? 같은 해석형 문장보다, 실제 만남 제안이 더 적절합니다.",
        rationale: "상대 감정 해석을 먼저 꺼내기보다 행동 제안으로 전환하는 편이 자연스럽습니다.",
        toneLabel: "avoid",
      },
    ],
    slow_down: [
      {
        recommendationType: "next_message",
        title: "한 템포 낮춘 안부",
        content: "바쁘실 것 같아서 편할 때 답 주셔도 돼요. 지난번 이야기 즐거웠어요.",
        rationale: reason,
        toneLabel: "gentle",
      },
      {
        recommendationType: "tone_guide",
        title: "설명보다 여백",
        content: "감정 설명을 길게 붙이기보다 짧은 안부 한 번만 보내고 반응을 기다리는 편이 좋습니다.",
        rationale: "신호가 흐릴 때는 설명을 늘릴수록 관계 부담이 커질 수 있습니다.",
        toneLabel: "patient",
      },
      {
        recommendationType: "avoid_phrase",
        title: "의미 추궁은 금물",
        content: "요즘 저한테 관심 없는 거죠? 같은 확인 요구형 문장은 피하는 편이 좋습니다.",
        rationale: "불확실한 구간에서 확인 요구는 상대를 방어적으로 만들기 쉽습니다.",
        toneLabel: "avoid",
      },
    ],
    wait_for_response: [
      {
        recommendationType: "next_message",
        title: "답장을 기다리는 메시지",
        content: "지금은 추가 메시지를 바로 보내기보다 조금 기다렸다가, 필요하면 가벼운 안부 한 번만 보내는 편이 좋습니다.",
        rationale: reason,
        toneLabel: "patient",
      },
      {
        recommendationType: "tone_guide",
        title: "재촉 대신 간격 두기",
        content: "마지막 공이 상대에게 있을 때는 메시지 간격을 두고, 반응 여지를 남기는 톤이 안전합니다.",
        rationale: "답장 압박은 실제 관심보다 방어 반응을 먼저 끌어낼 수 있습니다.",
        toneLabel: "spaced",
      },
      {
        recommendationType: "avoid_phrase",
        title: "읽음 여부 집착 금지",
        content: "읽었는데 왜 답이 없어요? 같은 문장은 관계 온도를 빠르게 떨어뜨릴 수 있습니다.",
        rationale: "응답이 늦는 이유를 바로 추궁하면 관계 판단보다 감정 소모가 커집니다.",
        toneLabel: "avoid",
      },
    ],
    consider_stopping: [
      {
        recommendationType: "next_message",
        title: "과투자 줄이기",
        content: "추가 설득 메시지를 보내기보다 여기서 한 번 텀을 두고, 상대 반응이 있는지 먼저 보는 편이 좋습니다.",
        rationale: reason,
        toneLabel: "detached",
      },
      {
        recommendationType: "tone_guide",
        title: "관계 비용 관리",
        content: "좋아 보이게 만들려는 긴 설명보다, 내 에너지를 아끼는 쪽으로 의사결정을 가져가세요.",
        rationale: "경고 신호가 누적되면 메시지 기술보다 거리 조절이 더 중요해집니다.",
        toneLabel: "protective",
      },
      {
        recommendationType: "avoid_phrase",
        title: "마지막 확인 메시지 남발 금지",
        content: "그럼 끝인 거죠?, 마지막으로 답만 주세요 같은 메시지는 상황을 더 불편하게 만들 수 있습니다.",
        rationale: "정리 국면에서는 마무리 집착보다 명확한 거리 두기가 더 낫습니다.",
        toneLabel: "avoid",
      },
    ],
  };

  return templates[action].map((item, index) => ({
    id: randomUUID(),
    displayOrder: index + 1,
    ...item,
  }));
}

export function buildRuleBasedAnalysis(
  conversation: StoredConversation,
  options?: AnalysisBuildOptions,
): Omit<StoredAnalysis, "id" | "createdAt" | "completedAt"> {
  const metrics = buildMetrics(conversation);
  const signalFactory = buildSignalFactory();

  if (metrics.otherResponsePairs >= 2 || (metrics.otherMessages >= 2 && metrics.otherResponsePairs >= 1)) {
    signalFactory.add(
      "positive",
      "reply_continuity",
      "대화를 끊지 않고 다시 반응하고 있어요",
      "상대가 내 메시지 뒤에 다시 응답하는 패턴이 반복됩니다.",
      `내 발화 뒤 응답이 ${metrics.otherResponsePairs}회 이어졌고, 대화가 한 번에 끊기지 않았습니다.`,
      metrics.otherResponsePairs >= 2 ? "high" : "medium",
    );
  }

  if (metrics.otherFutureMentionCount > 0) {
    signalFactory.add(
      "positive",
      "future_reference",
      "미래 지향 표현이 보입니다",
      "상대가 다음 만남이나 이후 대화를 연상시키는 표현을 남겼습니다.",
      `상대 메시지에서 미래 지향 표현이 ${metrics.otherFutureMentionCount}회 확인됐습니다.`,
      metrics.otherFutureMentionCount >= 2 ? "high" : "medium",
    );
  }

  // ── #10: 상대가 먼저 시작 ──
  if (metrics.firstSenderRole === "other") {
    signalFactory.add(
      "positive",
      "other_initiated",
      "상대가 먼저 대화를 시작했어요",
      "상대가 먼저 연락했다는 것은 관심이 있다는 기본적인 시그널입니다.",
      "대화의 첫 메시지가 상대 쪽에서 왔습니다.",
      "high",
    );
  }

  // ── #12: 구체적 확답 ──
  if (metrics.otherDefinitePlanCount > 0 && metrics.selfSchedulingAskCount > 0) {
    signalFactory.add(
      "positive",
      "definite_plan",
      "구체적인 일정 확답이 있어요",
      "상대가 날짜나 시간을 포함한 구체적인 응답을 보냈습니다.",
      `상대 메시지에서 구체적 날짜/시간 표현이 ${metrics.otherDefinitePlanCount}회 확인됐습니다.`,
      "high",
    );
  }

  if (metrics.otherWarmCount > 0 || metrics.otherAverageLength >= 18) {
    const warmthEvidence =
      metrics.otherWarmCount > 0
        ? `상대 메시지 평균 길이는 ${Math.round(metrics.otherAverageLength)}자이고, 온도감 있는 표현이 ${metrics.otherWarmCount}회 보였습니다.`
        : `상대 메시지 평균 길이가 ${Math.round(metrics.otherAverageLength)}자로 짧게 끊는 패턴은 아닙니다.`;

    signalFactory.add(
      "positive",
      "warm_tone",
      "답장 톤이 지나치게 건조하지는 않아요",
      "이모티브한 표현이나 일정 길이 이상의 답장이 보여서 완전히 닫힌 흐름은 아닙니다.",
      warmthEvidence,
      metrics.otherWarmCount > 0 ? "medium" : "low",
    );
  }

  // ── #9: 메시지 길이 균형 ──
  if (
    metrics.selfAverageLength > 0 &&
    metrics.otherAverageLength > 0 &&
    metrics.otherMessages >= 2
  ) {
    const lengthRatio = metrics.otherAverageLength / metrics.selfAverageLength;
    if (lengthRatio >= 0.7) {
      signalFactory.add(
        "positive",
        "length_balance",
        "답장 길이가 비슷한 수준이에요",
        "상대가 내 메시지와 비슷하거나 더 긴 답장을 보내고 있어서, 대화에 성의를 들이고 있습니다.",
        `내 메시지 평균 ${Math.round(metrics.selfAverageLength)}자, 상대 평균 ${Math.round(metrics.otherAverageLength)}자로 비율은 ${Math.round(lengthRatio * 100)}%입니다.`,
        lengthRatio >= 1.0 ? "high" : "medium",
      );
    }
  }

  // ── #13: 일방적 대화 ──
  if (metrics.selfToOtherRatio >= 2.5 && metrics.selfMessages >= 5) {
    signalFactory.add(
      "ambiguous",
      "one_sided_conversation",
      "대화 비율이 한쪽으로 쏠려 있어요",
      "내가 보낸 메시지 수가 상대보다 훨씬 많아서, 대화 주도권이 한쪽에 치우쳐 있습니다.",
      `내가 ${metrics.selfMessages}개, 상대가 ${metrics.otherMessages}개로 ${metrics.selfToOtherRatio.toFixed(1)}배 차이가 납니다.`,
      "medium",
    );
  }

  // ── #14: 단답 패턴 ──
  if (
    metrics.otherMessages >= 3 &&
    metrics.otherShortReplyCount / metrics.otherMessages >= 0.6
  ) {
    signalFactory.add(
      "ambiguous",
      "short_replies",
      "상대 답장이 대부분 짧아요",
      "5자 이하의 단답이 절반 이상이라서, 대화에 깊이 참여하고 있다고 보기 어렵습니다.",
      `상대 메시지 ${metrics.otherMessages}개 중 ${metrics.otherShortReplyCount}개가 5자 이하입니다.`,
      "medium",
    );
  }

  if (metrics.otherQuestionCount === 0 && metrics.otherMessages > 0) {
    signalFactory.add(
      "ambiguous",
      "question_balance",
      "질문을 되돌려주는 비율은 낮아요",
      "응답은 하지만 대화를 주도적으로 확장하는 패턴은 아직 약합니다.",
      "상대 메시지에 되묻기 질문이 거의 없어서, 관심 표현이 적극적이라고 보긴 어렵습니다.",
      "medium",
    );
  } else if (metrics.totalMessages < 6) {
    signalFactory.add(
      "ambiguous",
      "sample_size",
      "아직 표본이 짧습니다",
      "대화 수가 적으면 한두 문장만으로 관계 방향을 단정하기 어렵습니다.",
      `현재 분석은 총 ${metrics.totalMessages}개 메시지를 기준으로 하므로, 추세보다는 초기 힌트 수준에 가깝습니다.`,
      "low",
    );
  }

  if (
    metrics.selfSchedulingAskCount > 0 &&
    metrics.otherHedgeCount > 0 &&
    metrics.otherDefinitePlanCount === 0
  ) {
    signalFactory.add(
      "caution",
      "date_specificity",
      "약속 구체화는 아직 약합니다",
      "일정 관련 반응은 있으나, 시간이나 날짜 수준의 확정은 나오지 않았습니다.",
      `일정 제안 뒤 상대의 완곡 표현이 ${metrics.otherHedgeCount}회 있었고, 구체적 날짜/시간 표현은 확인되지 않았습니다.`,
      "medium",
    );
  } else if (metrics.lastSenderRole === "self") {
    signalFactory.add(
      "caution",
      "awaiting_reply",
      "아직 상대 답장을 기다리는 구간입니다",
      "마지막 메시지가 내 쪽에서 끝난 상태라서, 해석보다 대기 전략이 더 중요할 수 있습니다.",
      "현재 대화의 마지막 발화가 내 메시지라 추가 반응 데이터가 비어 있습니다.",
      "low",
    );
  } else if (metrics.otherHedgeCount >= 2) {
    signalFactory.add(
      "caution",
      "hedged_replies",
      "반응에 완곡한 표현이 섞여 있습니다",
      "거절은 아니지만, 분명한 확답보다는 여지를 남기는 문장이 반복됩니다.",
      `상대 메시지에서 일정 회피성 표현이 ${metrics.otherHedgeCount}회 확인됐습니다.`,
      "medium",
    );
  }

  // ── #15: 대화 종결 후 후속 없음 ──
  if (metrics.hasClosingWithoutFollowUp) {
    signalFactory.add(
      "caution",
      "closing_without_follow_up",
      "인사 후 대화가 이어지지 않았어요",
      "종결성 표현(잘 자, 수고 등) 이후 새로운 대화가 시작되지 않아, 자연스러운 마무리 상태입니다.",
      "마지막 대화가 종결 인사 이후 후속 메시지 없이 끝났습니다.",
      "low",
    );
  }

  // ── #16: 톤 하락 (대화 후반부 메시지 길이 급감) ──
  if (metrics.toneDrop) {
    signalFactory.add(
      "caution",
      "tone_drop",
      "대화 후반으로 갈수록 답장이 짧아지고 있어요",
      "상대 메시지 길이가 전반부 대비 후반부에서 크게 줄었습니다. 흥미가 줄었을 가능성이 있습니다.",
      "대화 후반부 평균 메시지 길이가 전반부의 60% 미만으로 떨어졌습니다.",
      "medium",
    );
  }

  if (signalFactory.list().length === 0) {
    signalFactory.add(
      "ambiguous",
      "limited_signal",
      "아직 뚜렷한 신호가 부족합니다",
      "대화가 너무 짧거나 화자 구분이 희미해 강한 해석을 내리기 어렵습니다.",
      `총 ${metrics.totalMessages}개 메시지로는 패턴 해석보다 추가 대화 관찰이 더 중요합니다.`,
      "low",
    );
  }

  const signals = signalFactory.list();
  const positiveSignalCount = signals.filter((signal) => signal.signalType === "positive").length;
  const ambiguousSignalCount = signals.filter((signal) => signal.signalType === "ambiguous").length;
  const cautionSignalCount = signals.filter((signal) => signal.signalType === "caution").length;
  const confidenceLevel = buildConfidenceLevel(metrics, signals.length);
  const { action, reason } = buildRecommendedAction(
    metrics,
    positiveSignalCount,
    cautionSignalCount,
  );
  const recommendations = buildRecommendations(action, reason, conversation);

  return {
    conversationId: conversation.id,
    analysisVersion: options?.analysisVersion?.trim() || "v1",
    modelName: options?.modelName?.trim() || "rule-based-dev",
    overallSummary: buildSummary(metrics, positiveSignalCount, cautionSignalCount),
    positiveSignalCount,
    ambiguousSignalCount,
    cautionSignalCount,
    confidenceLevel,
    recommendedAction: action,
    recommendedActionReason: reason,
    analysisStatus: "completed",
    signals,
    recommendations,
  };
}
