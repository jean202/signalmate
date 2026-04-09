import type { Tool } from "@anthropic-ai/sdk/resources/messages";

/**
 * Step 1: 시그널 설명 강화 도구.
 * Claude가 규칙 기반 시그널의 description/evidenceText/title을 자연어로 개선해서 반환.
 */
export const submitEnhancedSignalsTool: Tool = {
  name: "submit_enhanced_signals",
  description:
    "규칙 기반 분석의 시그널들을 대화 맥락에 맞는 자연스러운 한국어로 개선한 결과를 제출합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      overallSummary: {
        type: "string",
        description: "전체 분석 요약. 2~3문장, 50~100자. 한국어만 사용. 문장을 끝까지 완성할 것.",
      },
      signals: {
        type: "array",
        description: "강화된 시그널 목록 (원래 순서 유지)",
        items: {
          type: "object",
          properties: {
            signalType: {
              type: "string",
              enum: ["positive", "ambiguous", "caution"],
              description: "시그널 유형 (원본 유지)",
            },
            signalKey: {
              type: "string",
              description: "시그널 키 (원본 유지)",
            },
            title: {
              type: "string",
              description: "시그널 제목. 15~25자 이내. 한국어만 사용.",
            },
            description: {
              type: "string",
              description: "시그널 설명. 2~3문장, 40~80자. 대화 맥락 반영. 한국어만 사용. 문장을 끝까지 완성할 것.",
            },
            evidenceText: {
              type: "string",
              description: "근거. 대화 속 구체적 표현을 직접 인용하거나 패턴 요약. 20~50자. 한국어만 사용.",
            },
            confidenceLevel: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "신뢰도 (원본 유지)",
            },
          },
          required: [
            "signalType",
            "signalKey",
            "title",
            "description",
            "evidenceText",
            "confidenceLevel",
          ],
        },
      },
    },
    required: ["overallSummary", "signals"],
  },
};

/**
 * Step 2: 추천 메시지 생성 도구.
 * Claude가 분석 결과를 바탕으로 맞춤 추천 3종을 반환.
 */
export const submitRecommendationsTool: Tool = {
  name: "submit_recommendations",
  description:
    "분석 결과를 바탕으로 사용자에게 보낼 추천 메시지 3종을 제출합니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      recommendedActionReason: {
        type: "string",
        description: "추천 액션의 이유. 1~2문장. 한국어만 사용. 문장을 끝까지 완성할 것.",
      },
      recommendations: {
        type: "array",
        description: "추천 3개 (next_message, tone_guide, avoid_phrase 순서)",
        items: {
          type: "object",
          properties: {
            recommendationType: {
              type: "string",
              enum: ["next_message", "tone_guide", "avoid_phrase"],
              description: "추천 유형",
            },
            title: {
              type: "string",
              description: "추천 제목. 10~20자 이내. 한국어만 사용.",
            },
            content: {
              type: "string",
              description:
                "추천 내용. next_message는 복사해서 바로 보낼 수 있는 카톡 메시지(1~2문장), tone_guide와 avoid_phrase는 조언(2~3문장). 한국어만 사용. 문장을 끝까지 완성할 것.",
            },
            rationale: {
              type: "string",
              description: "이 추천을 하는 이유. 1~2문장. 한국어만 사용.",
            },
            toneLabel: {
              type: "string",
              description: "톤 라벨 (light, direct, gentle, patient, clear, avoid 등)",
            },
          },
          required: [
            "recommendationType",
            "title",
            "content",
            "rationale",
            "toneLabel",
          ],
        },
        minItems: 3,
        maxItems: 3,
      },
    },
    required: ["recommendedActionReason", "recommendations"],
  },
};
