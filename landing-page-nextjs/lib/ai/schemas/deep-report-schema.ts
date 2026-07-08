import type { Tool } from "@anthropic-ai/sdk/resources/messages";

/** 심화 리포트(유사 사례 요약 + 행동 시나리오) 제출 도구. */
export const submitDeepReportTool: Tool = {
  name: "submit_deep_report",
  strict: true,
  description: "유사 사례 패턴 요약과 행동 시나리오 시뮬레이션을 제출합니다.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      patternSummary: {
        type: "string",
        description:
          "유사 사례들의 공통 패턴 요약. 2~3문장, 한국어. 유사 사례가 없으면 빈 문자열.",
      },
      cases: {
        type: "array",
        description: "각색된 유사 사례 요약 (최대 3개, 제공된 사례만 사용, 없으면 빈 배열)",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            situationType: { type: "string", description: "상황 유형 (원본 유지)" },
            flowSummary: {
              type: "string",
              description: "사례 흐름 요약. 2문장 내외, 개인 식별 요소 없이 각색. 한국어.",
            },
            outcome: {
              type: "string",
              enum: ["progressed", "stalled", "ended"],
              description: "결말 (원본 유지)",
            },
            lesson: { type: "string", description: "이 사례에서 얻을 교훈 1문장. 한국어." },
          },
          required: ["situationType", "flowSummary", "outcome", "lesson"],
        },
      },
      scenarios: {
        type: "array",
        description: "행동 시나리오 2~3개. 서로 다른 행동 경로여야 한다.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            actionLabel: { type: "string", description: "행동 이름. 15자 내외 한국어." },
            expectedFlow: {
              type: "string",
              description: "이 행동을 했을 때 예상 전개. 2~3문장, 신호 근거 기반. 한국어.",
            },
            risk: { type: "string", description: "주요 리스크 1~2문장. 한국어." },
            bestMessage: {
              type: "string",
              description: "이 경로를 택할 때 보내기 좋은 메시지 예시 1개. 한국어.",
            },
            timing: { type: "string", description: "권장 타이밍. 예: 지금 바로, 1~2일 뒤." },
            confidence: {
              type: "string",
              enum: ["low", "medium", "high"],
              description: "이 시나리오 예측의 확신도",
            },
          },
          required: ["actionLabel", "expectedFlow", "risk", "bestMessage", "timing", "confidence"],
        },
      },
    },
    required: ["patternSummary", "cases", "scenarios"],
  },
};

/** 초안 메시지 검증 결과 제출 도구. */
export const submitDraftCheckTool: Tool = {
  name: "submit_draft_check",
  strict: true,
  description: "사용자가 보내려는 초안 메시지에 대한 검증 결과를 제출합니다.",
  input_schema: {
    type: "object" as const,
    additionalProperties: false,
    properties: {
      predictedReaction: {
        type: "string",
        description: "상대의 예상 반응. 2문장 내외, 단정하지 말고 신호 근거로. 한국어.",
      },
      riskLevel: {
        type: "string",
        enum: ["low", "medium", "high"],
        description: "이 초안을 보냈을 때의 리스크 수준",
      },
      risks: {
        type: "array",
        items: { type: "string", description: "구체적 리스크 1문장. 한국어." },
        description: "리스크 목록 (0~3개)",
      },
      improvedDraft: {
        type: "string",
        description: "개선된 초안. 원문 의도를 유지하되 리스크를 줄인 버전. 한국어.",
      },
      rationale: {
        type: "string",
        description: "개선 근거 1~2문장. 한국어.",
      },
    },
    required: ["predictedReaction", "riskLevel", "risks", "improvedDraft", "rationale"],
  },
};
