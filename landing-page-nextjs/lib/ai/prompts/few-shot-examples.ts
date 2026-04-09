import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Few-shot examples for signal enhancement.
 * Uses proper tool_use → tool_result → assistant acknowledgment flow.
 */
export const SIGNAL_ENHANCER_FEW_SHOT: MessageParam[] = [
  {
    role: "user",
    content: `## 대화 원문
나: 오늘 즐거웠어요!
상대: 저도요 ㅎㅎ 다음에 또 만나요
나: 네! 다음주 토요일 어때요?
상대: 좋아요 그때 봐요~

## 관계 컨텍스트
- 관계 단계: after_first_date
- 만남 경로: blind_date
- 사용자 목표: evaluate_interest

## 규칙 기반 분석 결과 (시그널 3개)
1. [positive] reply_continuity
   제목: 대화를 끊지 않고 다시 반응하고 있어요
   설명: 상대가 내 메시지 뒤에 다시 응답하는 패턴이 반복됩니다.
   근거: 내 발화 뒤 응답이 2회 이어졌고, 대화가 한 번에 끊기지 않았습니다.
   신뢰도: high

2. [positive] future_reference
   제목: 미래 지향 표현이 보입니다
   설명: 상대가 다음 만남이나 이후 대화를 연상시키는 표현을 남겼습니다.
   근거: 상대 메시지에서 미래 지향 표현이 1회 확인됐습니다.
   신뢰도: medium

3. [ambiguous] question_balance
   제목: 질문을 되돌려주는 비율은 낮아요
   설명: 응답은 하지만 대화를 주도적으로 확장하는 패턴은 아직 약합니다.
   근거: 상대 메시지에 되묻기 질문이 거의 없어서, 관심 표현이 적극적이라고 보긴 어렵습니다.
   신뢰도: medium

위 시그널들의 description과 evidenceText를 대화 맥락에 맞게 자연스러운 한국어로 다시 작성해주세요.
title도 더 자연스럽게 다듬어주세요.
signalType, signalKey, confidenceLevel은 그대로 유지해주세요.`,
  },
  {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "fewshot_signal_1",
        name: "submit_enhanced_signals",
        input: {
          overallSummary:
            "첫 만남 후 대화가 자연스럽게 이어지고 있고, 상대가 다음 약속에 긍정적이에요. 다만 상대가 먼저 화제를 꺼내거나 질문하는 모습은 아직 보이지 않아서, 관심의 깊이는 좀 더 지켜볼 필요가 있어요.",
          signals: [
            {
              signalType: "positive",
              signalKey: "reply_continuity",
              title: "대화가 자연스럽게 이어지고 있어요",
              description:
                "당신이 메시지를 보낼 때마다 상대가 빠짐없이 응답하고 있어요. 대화가 한 번도 끊기지 않고 흘러간 건 좋은 신호예요.",
              evidenceText:
                "\"저도요 ㅎㅎ\", \"좋아요 그때 봐요~\" 등 매번 호응하며 대화를 이어감",
              confidenceLevel: "high",
            },
            {
              signalType: "positive",
              signalKey: "future_reference",
              title: "다음 만남에 열려 있어요",
              description:
                "상대가 \"다음에 또 만나요\"라고 먼저 말한 건 긍정적이에요. 토요일 제안에도 수락한 점을 함께 보면 실제 의향이 있어 보여요.",
              evidenceText: "\"다음에 또 만나요\", \"좋아요 그때 봐요~\"",
              confidenceLevel: "medium",
            },
            {
              signalType: "ambiguous",
              signalKey: "question_balance",
              title: "아직 상대가 먼저 묻는 건 없어요",
              description:
                "상대가 응답은 잘 하지만, 당신에게 질문을 던지거나 새로운 화제를 꺼내진 않았어요. 아직 적극적으로 표현하는 단계는 아닐 수 있어요.",
              evidenceText: "상대 메시지 4개 중 되묻기 질문이 0개",
              confidenceLevel: "medium",
            },
          ],
        },
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "fewshot_signal_1",
        content: "제출 완료",
      },
    ],
  },
  {
    role: "assistant",
    content: "시그널 강화 결과를 제출했습니다.",
  },
];

/**
 * Few-shot examples for recommendation generation.
 */
export const RECOMMENDATION_FEW_SHOT: MessageParam[] = [
  {
    role: "user",
    content: `## 대화 원문
나: 지난번 전시 재밌었어요! 다음에도 같이 가요
상대: 네 좋아요! 다음 주에 시간 맞으면 가볼까요?
나: 오 좋아요! 어떤 전시 좋아하세요?
상대: 현대미술 쪽이요 ㅎㅎ

## 관계 컨텍스트
- 관계 단계: after_first_date
- 만남 경로: mutual_friend
- 사용자 목표: ask_for_date

## 분석 요약
대화가 자연스럽게 이어지고 있고, 상대도 다음 만남에 열린 자세를 보이고 있어요.

## 감지된 시그널
- [positive] 대화를 자연스럽게 이어가고 있어요
- [positive] 상대가 먼저 일정을 꺼냈어요
- [positive] 따뜻한 톤이 유지되고 있어요

## 추천 액션
- 액션: suggest_date
- 이유: 상대가 대화를 이어가고 미래 지향 표현도 보여서, 가벼운 약속 제안을 해볼 만합니다.

위 분석 결과를 바탕으로 3가지 추천을 작성해주세요:
1. next_message: 상대에게 보낼 다음 메시지 (대화 속 소재 활용, 복사해서 바로 보낼 수 있게)
2. tone_guide: 어떤 톤과 전략으로 접근할지 조언
3. avoid_phrase: 이 상황에서 피해야 할 표현과 그 이유`,
  },
  {
    role: "assistant",
    content: [
      {
        type: "tool_use",
        id: "fewshot_rec_1",
        name: "submit_recommendations",
        input: {
          recommendedActionReason:
            "상대가 \"다음 주에 가볼까요?\"라며 먼저 일정을 꺼냈어요. 관심이 있다는 뚜렷한 신호이니, 구체적인 전시를 제안하면 자연스럽게 약속이 잡힐 수 있어요.",
          recommendations: [
            {
              recommendationType: "next_message",
              title: "전시 소재로 자연스러운 제안",
              content:
                "현대미술 좋아하시는구나! 다음 주에 서울시립미술관 가볼까요? 요즘 전시 꽤 괜찮다고 하더라고요 ㅎㅎ",
              rationale:
                "상대가 좋아한다고 말한 '현대미술'을 바로 활용해서, 구체적인 장소까지 제안하면 실행력 있어 보여요.",
              toneLabel: "light",
            },
            {
              recommendationType: "tone_guide",
              title: "가볍고 여유 있는 톤 유지",
              content:
                "제안할 때 \"꼭 가자!\"보다는 \"가볼까요?\" 식으로 상대에게 선택권을 주세요. 아직 초반이라 부담 없이 참여할 수 있는 느낌이 중요해요.",
              rationale:
                "첫 만남 직후라 너무 적극적이면 부담을 줄 수 있어요.",
              toneLabel: "gentle",
            },
            {
              recommendationType: "avoid_phrase",
              title: "일방적 확정 표현 피하기",
              content:
                "\"다음 주 토요일 2시에 만나요\" 같은 일방적 확정이나, \"저 그날 하루 비워놨어요\" 같은 과도한 준비 표현은 피하세요. 가볍게 물어보는 톤이 좋아요.",
              rationale:
                "상대가 부담을 느끼면 오히려 거리를 둘 수 있어요.",
              toneLabel: "avoid",
            },
          ],
        },
      },
    ],
  },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "fewshot_rec_1",
        content: "제출 완료",
      },
    ],
  },
  {
    role: "assistant",
    content: "추천 메시지를 제출했습니다.",
  },
];
