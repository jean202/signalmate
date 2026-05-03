import type { ConfidenceLevel, RecommendedAction } from "../../lib/analysis-store";

type FixtureMessage = {
  senderRole: "self" | "other" | "unknown";
  messageText: string;
};

export type RuleAnalysisCase = {
  name: string;
  why: string;
  input: {
    relationshipStage: string;
    meetingChannel: string;
    userGoal: string;
    rawText?: string;
    messages: FixtureMessage[];
  };
  expect: {
    recommendedAction: RecommendedAction;
    confidenceLevel: ConfidenceLevel;
    counts: {
      positive: number;
      ambiguous: number;
      caution: number;
    };
    includeSignalKeys: string[];
    excludeSignalKeys?: string[];
    summaryIncludes?: string[];
  };
};

export const ruleAnalysisCases: RuleAnalysisCase[] = [
  {
    name: "애프터 가능성은 있지만 일정 확정은 약한 대화",
    why: "미래 언급은 있지만 확답이 없을 때 keep_light와 date_specificity가 함께 살아 있어야 합니다.",
    input: {
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      rawText: `[오후 8:10] 나: 오늘 잘 들어갔어요?
[오후 8:13] 상대: 네 덕분에요 :) 집 오니까 오늘 얘기했던 전시 생각나네요.
[오후 8:24] 나: 이번 주말은 어떠세요?
[오후 8:31] 상대: 이번 주말은 조금 애매한데, 다음 주는 괜찮을 것 같아요.`,
      messages: [
        { senderRole: "self", messageText: "오늘 잘 들어갔어요?" },
        {
          senderRole: "other",
          messageText: "네 덕분에요 :) 집 오니까 오늘 얘기했던 전시 생각나네요.",
        },
        { senderRole: "self", messageText: "이번 주말은 어떠세요?" },
        {
          senderRole: "other",
          messageText: "이번 주말은 조금 애매한데, 다음 주는 괜찮을 것 같아요.",
        },
      ],
    },
    expect: {
      recommendedAction: "keep_light",
      confidenceLevel: "low",
      counts: {
        positive: 4,
        ambiguous: 1,
        caution: 1,
      },
      includeSignalKeys: [
        "reply_continuity",
        "future_reference",
        "warm_tone",
        "length_balance",
        "question_balance",
        "date_specificity",
      ],
      summaryIncludes: ["관심 신호", "확신"],
    },
  },
  {
    name: "미래 제안과 구체 일정이 살아 있는 대화",
    why: "구체 날짜와 상호 호응이 맞물리면 suggest_date로 바로 전환돼야 합니다.",
    input: {
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "ask_for_date",
      messages: [
        { senderRole: "self", messageText: "오늘 즐거웠어요." },
        { senderRole: "other", messageText: "저도요 :) 다음에 또 보고 싶네요." },
        { senderRole: "self", messageText: "저도 그래요. 다음 주 평일 저녁 괜찮으세요?" },
        { senderRole: "other", messageText: "좋아요! 수요일이나 목요일 어때요?" },
        { senderRole: "self", messageText: "저는 목요일이 더 좋아요." },
        { senderRole: "other", messageText: "그럼 목요일 7시에 볼까요?" },
      ],
    },
    expect: {
      recommendedAction: "suggest_date",
      confidenceLevel: "high",
      counts: {
        positive: 5,
        ambiguous: 0,
        caution: 0,
      },
      includeSignalKeys: [
        "reply_continuity",
        "future_reference",
        "definite_plan",
        "warm_tone",
        "length_balance",
      ],
      excludeSignalKeys: ["question_balance", "date_specificity", "awaiting_reply"],
      summaryIncludes: ["대화 흐름", "다음 제안"],
    },
  },
  {
    name: "내 메시지로 끝나서 기다림이 필요한 대화",
    why: "마지막 공이 내 쪽에 있으면 해석보다 대기 전략이 우선이어야 합니다.",
    input: {
      relationshipStage: "ongoing_chat",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      messages: [
        { senderRole: "self", messageText: "오늘 일정 괜찮으셨어요?" },
        { senderRole: "other", messageText: "네 무난했어요." },
        { senderRole: "self", messageText: "다음에 시간 맞으면 커피 한잔해요." },
      ],
    },
    expect: {
      recommendedAction: "wait_for_response",
      confidenceLevel: "low",
      counts: {
        positive: 0,
        ambiguous: 1,
        caution: 1,
      },
      includeSignalKeys: ["question_balance", "awaiting_reply"],
      excludeSignalKeys: ["future_reference", "date_specificity"],
      summaryIncludes: ["속도를 낮추고", "안전"],
    },
  },
  {
    name: "짧지만 분위기는 나쁘지 않은 초기 대화",
    why: "초기 2턴 대화는 강한 해석보다 sample_size와 가벼운 긍정만 남겨야 합니다.",
    input: {
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "evaluate_interest",
      messages: [
        { senderRole: "self", messageText: "오늘 하루 어땠어요?" },
        { senderRole: "other", messageText: "괜찮았어요 :) 오늘은 어땠어요?" },
      ],
    },
    expect: {
      recommendedAction: "keep_light",
      confidenceLevel: "low",
      counts: {
        positive: 1,
        ambiguous: 1,
        caution: 0,
      },
      includeSignalKeys: ["warm_tone", "sample_size"],
      excludeSignalKeys: ["question_balance", "awaiting_reply"],
      summaryIncludes: ["탐색 단계"],
    },
  },
  {
    name: "완곡한 회피 표현이 반복되는 대화",
    why: "완곡한 회피가 누적되면 관계 진전보다 속도 조절 쪽으로 해석이 기울어야 합니다.",
    input: {
      relationshipStage: "cooling_down",
      meetingChannel: "dating_app",
      userGoal: "decide_to_stop",
      messages: [
        { senderRole: "self", messageText: "요즘 많이 바쁘셨죠?" },
        { senderRole: "other", messageText: "네 많이 바쁘네요." },
        { senderRole: "self", messageText: "그래도 이야기할 여유가 조금은 있나 궁금했어요." },
        { senderRole: "other", messageText: "일정은 봐야 해요." },
      ],
    },
    expect: {
      recommendedAction: "slow_down",
      confidenceLevel: "low",
      counts: {
        positive: 1,
        ambiguous: 1,
        caution: 1,
      },
      includeSignalKeys: ["reply_continuity", "question_balance", "hedged_replies"],
      excludeSignalKeys: ["future_reference", "date_specificity"],
      summaryIncludes: ["관심 신호", "확신"],
    },
  },
  {
    name: "종결 인사 후 내가 다시 밀어붙이는 대화",
    why: "종결 인사 뒤 재접촉은 consider_stopping 분기를 실제로 고정하는 대표 케이스입니다.",
    input: {
      relationshipStage: "cooling_down",
      meetingChannel: "dating_app",
      userGoal: "decide_to_stop",
      messages: [
        { senderRole: "self", messageText: "오늘 어땠어요?" },
        { senderRole: "other", messageText: "그냥 그랬어요" },
        { senderRole: "self", messageText: "알겠어요 잘 자요" },
        { senderRole: "self", messageText: "내일 다시 연락해도 될까요?" },
      ],
    },
    expect: {
      recommendedAction: "consider_stopping",
      confidenceLevel: "low",
      counts: {
        positive: 0,
        ambiguous: 1,
        caution: 2,
      },
      includeSignalKeys: ["question_balance", "awaiting_reply", "closing_without_follow_up"],
      excludeSignalKeys: ["reply_continuity", "future_reference", "date_specificity"],
      summaryIncludes: ["속도를 낮추고", "보수적으로"],
    },
  },
  {
    name: "상대가 먼저 열고 다음 만남을 암시하는 대화",
    why: "other_initiated와 future_reference가 같이 잡히면 짧은 로그여도 suggest_date로 가야 합니다.",
    input: {
      relationshipStage: "after_first_date",
      meetingChannel: "blind_date",
      userGoal: "ask_for_date",
      messages: [
        {
          senderRole: "other",
          messageText: "오늘 회사 근처 지나가다가 지난번에 말한 전시 생각났어요 :)",
        },
        { senderRole: "self", messageText: "오 진짜요? 저도 그 얘기 떠올랐어요." },
        { senderRole: "other", messageText: "다음에 시간 맞으면 같이 가봐도 좋겠어요." },
      ],
    },
    expect: {
      recommendedAction: "suggest_date",
      confidenceLevel: "low",
      counts: {
        positive: 5,
        ambiguous: 1,
        caution: 0,
      },
      includeSignalKeys: [
        "reply_continuity",
        "future_reference",
        "other_initiated",
        "warm_tone",
        "length_balance",
        "question_balance",
      ],
      excludeSignalKeys: ["definite_plan", "awaiting_reply"],
      summaryIncludes: ["대화 흐름", "다음 제안"],
    },
  },
  {
    name: "내가 과하게 이어 보내서 일방향이 된 대화",
    why: "메시지 수가 한쪽으로 크게 쏠리면 단순 대기보다 slow_down 쪽으로 더 보수적으로 떨어져야 합니다.",
    input: {
      relationshipStage: "cooling_down",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      messages: [
        { senderRole: "self", messageText: "잘 잤어요?" },
        { senderRole: "other", messageText: "네" },
        { senderRole: "self", messageText: "오늘 바쁘세요?" },
        { senderRole: "self", messageText: "점심은 드셨어요?" },
        { senderRole: "self", messageText: "오후에는 좀 괜찮아요?" },
        { senderRole: "self", messageText: "지난번 카페 얘기 재밌었어요." },
        { senderRole: "self", messageText: "주말에 시간 되면 커피 한잔할래요?" },
        { senderRole: "self", messageText: "편할 때 답 주세요." },
      ],
    },
    expect: {
      recommendedAction: "slow_down",
      confidenceLevel: "medium",
      counts: {
        positive: 0,
        ambiguous: 2,
        caution: 1,
      },
      includeSignalKeys: ["one_sided_conversation", "question_balance", "awaiting_reply"],
      excludeSignalKeys: ["reply_continuity", "future_reference", "short_replies"],
      summaryIncludes: ["속도를 낮추고", "보수적으로"],
    },
  },
  {
    name: "짧은 단답이 반복되지만 답장은 이어지는 대화",
    why: "단답과 회피가 겹치면 reply_continuity 하나만으로 keep_light가 되면 안 됩니다.",
    input: {
      relationshipStage: "ongoing_chat",
      meetingChannel: "dating_app",
      userGoal: "ask_for_date",
      messages: [
        { senderRole: "self", messageText: "오늘 일정 끝났어요?" },
        { senderRole: "other", messageText: "네" },
        { senderRole: "self", messageText: "저녁 먹었어요?" },
        { senderRole: "other", messageText: "아직요" },
        { senderRole: "self", messageText: "내일 괜찮으면 잠깐 볼래요?" },
        { senderRole: "other", messageText: "몰라요" },
        { senderRole: "self", messageText: "그럼 주말은요?" },
        { senderRole: "other", messageText: "조금 바빠요" },
      ],
    },
    expect: {
      recommendedAction: "slow_down",
      confidenceLevel: "high",
      counts: {
        positive: 1,
        ambiguous: 2,
        caution: 1,
      },
      includeSignalKeys: [
        "reply_continuity",
        "short_replies",
        "question_balance",
        "date_specificity",
      ],
      excludeSignalKeys: ["future_reference", "definite_plan", "awaiting_reply"],
      summaryIncludes: ["속도를 낮추고", "보수적으로"],
    },
  },
  {
    name: "후반부로 갈수록 답장이 급격히 짧아지는 대화",
    why: "tone_drop이 보이면 요약도 mixed가 아니라 보수적인 경고 톤으로 내려와야 합니다.",
    input: {
      relationshipStage: "cooling_down",
      meetingChannel: "dating_app",
      userGoal: "evaluate_interest",
      messages: [
        {
          senderRole: "self",
          messageText: "오늘 이동하면서 지난번에 했던 음악 이야기 다시 떠올랐어요. 생각보다 오래 남네요.",
        },
        {
          senderRole: "other",
          messageText: "저도요. 그때 음악 취향 이야기한 게 의외로 계속 생각났어요.",
        },
        {
          senderRole: "self",
          messageText: "말이 잘 통해서 편했어요. 그래서 괜히 더 기억에 남는 것 같아요.",
        },
        {
          senderRole: "other",
          messageText: "그러게요. 생각보다 편하게 이야기했던 것 같아요.",
        },
        { senderRole: "self", messageText: "오늘은 일찍 들어가세요?" },
        { senderRole: "other", messageText: "응" },
        { senderRole: "self", messageText: "내일은 좀 여유 있으세요?" },
        { senderRole: "other", messageText: "네" },
      ],
    },
    expect: {
      recommendedAction: "slow_down",
      confidenceLevel: "high",
      counts: {
        positive: 1,
        ambiguous: 1,
        caution: 1,
      },
      includeSignalKeys: ["reply_continuity", "question_balance", "tone_drop"],
      excludeSignalKeys: ["future_reference", "date_specificity", "hedged_replies"],
      summaryIncludes: ["속도를 낮추고", "보수적으로"],
    },
  },
  {
    name: "화자 구분이 흐려서 신호가 거의 없는 로그",
    why: "파싱이 불완전한 입력에서도 limited_signal이 fallback으로 남아야 합니다.",
    input: {
      relationshipStage: "unknown",
      meetingChannel: "other",
      userGoal: "evaluate_interest",
      messages: [
        { senderRole: "unknown", messageText: "사진 잘 봤어요" },
        { senderRole: "unknown", messageText: "고마워요" },
        { senderRole: "unknown", messageText: "좋은 하루 보내세요" },
        { senderRole: "unknown", messageText: "네" },
        { senderRole: "unknown", messageText: "다음에 얘기해요" },
        { senderRole: "unknown", messageText: "알겠어요" },
      ],
    },
    expect: {
      recommendedAction: "wait_for_response",
      confidenceLevel: "low",
      counts: {
        positive: 0,
        ambiguous: 1,
        caution: 0,
      },
      includeSignalKeys: ["limited_signal"],
      excludeSignalKeys: ["sample_size", "awaiting_reply", "question_balance"],
      summaryIncludes: ["상대 반응이 아직 없어", "충분히 읽기 어려운"],
    },
  },
  {
    name: "상대 답장이 한 번도 오지 않은 초반 대화",
    why: "무응답 구간은 otherMessages === 0 분기와 awaiting_reply를 함께 검증하는 기본 케이스입니다.",
    input: {
      relationshipStage: "before_meeting",
      meetingChannel: "dating_app",
      userGoal: "continue_chat",
      messages: [
        { senderRole: "self", messageText: "오늘 잘 들어가셨어요?" },
        { senderRole: "self", messageText: "지난번 이야기 재밌었어요." },
        { senderRole: "self", messageText: "편할 때 답 주세요." },
      ],
    },
    expect: {
      recommendedAction: "wait_for_response",
      confidenceLevel: "low",
      counts: {
        positive: 0,
        ambiguous: 1,
        caution: 1,
      },
      includeSignalKeys: ["sample_size", "awaiting_reply"],
      excludeSignalKeys: ["limited_signal", "question_balance", "reply_continuity"],
      summaryIncludes: ["상대 반응이 아직 없어", "충분히 읽기 어려운"],
    },
  },
];
