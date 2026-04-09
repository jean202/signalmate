import { randomUUID } from "node:crypto";

type ConversationMessageInput = {
  senderRole: "self" | "other" | "unknown";
  messageText: string;
  sentAt?: string | null;
  sequenceNo: number;
};

type ConversationInput = {
  title?: string;
  sourceType?: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode?: string;
  rawText?: string;
  messages?: ConversationMessageInput[];
};

const sampleMessages: ConversationMessageInput[] = [
  {
    senderRole: "self",
    messageText: "오늘 잘 들어갔어요?",
    sentAt: "2026-03-27T20:10:00+09:00",
    sequenceNo: 1,
  },
  {
    senderRole: "other",
    messageText: "네 덕분에요 :) 집 오니까 오늘 얘기했던 전시 생각나네요.",
    sentAt: "2026-03-27T20:13:00+09:00",
    sequenceNo: 2,
  },
];

export function buildConversationSummary(input: ConversationInput) {
  return {
    id: randomUUID(),
    saveMode: input.saveMode ?? "temporary",
    relationshipStage: input.relationshipStage,
    messageCount: input.messages?.length ?? 0,
  };
}

export function buildConversationDetail(conversationId: string) {
  return {
    conversation: {
      id: conversationId,
      title: "첫 소개팅 후 대화",
      sourceType: "kakao",
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      saveMode: "temporary",
      createdAt: "2026-03-27T11:03:20Z",
    },
    messages: sampleMessages,
  };
}

export function buildQueuedAnalysis() {
  return {
    analysis: {
      id: randomUUID(),
      analysisStatus: "queued",
    },
  };
}

export function buildAnalysisDetail(analysisId: string) {
  return {
    analysis: {
      id: analysisId,
      analysisStatus: "completed",
      overallSummary:
        "대화는 긍정적으로 이어지고 있지만 아직 적극적인 확신 단계는 아닙니다.",
      positiveSignalCount: 4,
      ambiguousSignalCount: 2,
      cautionSignalCount: 1,
      confidenceLevel: "medium",
      recommendedAction: "keep_light",
      recommendedActionReason:
        "대화는 계속 이어지지만 질문 회수와 약속 구체성이 아직 높지 않습니다.",
      createdAt: "2026-03-27T11:05:10Z",
      completedAt: "2026-03-27T11:05:15Z",
    },
  };
}

export function buildSignalList() {
  return {
    signals: [
      {
        id: randomUUID(),
        signalType: "positive",
        signalKey: "reply_continuity",
        title: "대화를 끊지 않고 이어가고 있어요",
        description: "상대는 짧더라도 대화를 종료하지 않고 연결하고 있습니다.",
        evidenceText: "질문형 답변은 적지만 응답 자체는 지속되고 있습니다.",
        confidenceLevel: "high",
        displayOrder: 1,
      },
      {
        id: randomUUID(),
        signalType: "ambiguous",
        signalKey: "question_ratio",
        title: "질문을 되돌려주는 빈도는 낮아요",
        description: "관심은 있으나 주도적으로 대화를 끌고 가는 패턴은 아직 약합니다.",
        evidenceText: "응답은 이어지지만 탐색형 질문의 횟수는 높지 않습니다.",
        confidenceLevel: "medium",
        displayOrder: 2,
      },
      {
        id: randomUUID(),
        signalType: "caution",
        signalKey: "date_specificity",
        title: "약속 구체화는 아직 뚜렷하지 않아요",
        description: "대화의 온도는 유지되지만 구체적인 일정 확정 의지는 아직 약합니다.",
        evidenceText: "만남 관련 언급은 있지만 날짜와 시간 수준의 확정은 보이지 않습니다.",
        confidenceLevel: "medium",
        displayOrder: 3,
      },
    ],
  };
}

export function buildRecommendationList() {
  return {
    recommendations: [
      {
        id: randomUUID(),
        recommendationType: "next_message",
        title: "가볍게 후속 대화 이어가기",
        content:
          "오늘 이야기했던 전시 생각보다 계속 기억나네요. 다음에 시간 맞으면 다른 곳도 같이 가보면 재밌을 것 같아요.",
        rationale: "지금은 강하게 밀기보다 공통 화제를 활용한 가벼운 연결이 적합합니다.",
        toneLabel: "light",
      },
      {
        id: randomUUID(),
        recommendationType: "tone_guide",
        title: "부담 없이 반 걸음만",
        content: "호감 표현을 과하게 올리기보다 편안한 후속 대화 톤을 유지하세요.",
        rationale: "상대가 흐름은 이어가고 있으므로 과속보다 자연스러운 연결이 더 안전합니다.",
        toneLabel: "steady",
      },
      {
        id: randomUUID(),
        recommendationType: "avoid_phrase",
        title: "확답 압박은 피하기",
        content: "왜 답이 느려요?, 언제 시간 돼요? 같은 압박형 질문은 지금 단계에서 불리할 수 있습니다.",
        rationale: "구체성 부족이 보이는 단계에서는 압박형 문장이 관계 온도를 떨어뜨릴 수 있습니다.",
        toneLabel: "avoid",
      },
    ],
  };
}

export function buildAnalysisList() {
  return {
    items: [
      {
        analysisId: randomUUID(),
        conversationTitle: "첫 소개팅 후 대화",
        overallSummary: "긍정적이지만 아직 탐색 단계입니다.",
        recommendedAction: "keep_light",
        createdAt: "2026-03-27T11:05:10Z",
      },
      {
        analysisId: randomUUID(),
        conversationTitle: "애프터 전 대화",
        overallSummary: "대화는 이어지지만 약속 신호는 아직 약합니다.",
        recommendedAction: "wait_for_response",
        createdAt: "2026-03-26T19:14:22Z",
      },
    ],
    nextCursor: null,
  };
}

export function buildCheckoutResponse() {
  return {
    paymentId: randomUUID(),
    checkoutUrl: "https://payments.example.com/checkout/mock-session",
  };
}
