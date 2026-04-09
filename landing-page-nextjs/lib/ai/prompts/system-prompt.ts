/**
 * 사용자가 제공한 상황 설명을 프롬프트에 삽입할 수 있는 블록으로 포맷합니다.
 * null이면 빈 문자열 반환.
 */
export function formatSituationContext(context: string | null | undefined): string {
  if (!context?.trim()) return "";
  return `
## 사용자가 제공한 상황 설명
(이 정보는 대화 텍스트에 나타나지 않는 배경 맥락입니다. 분석 시 참고하되, 대화 텍스트의 증거가 우선합니다.)
${context.trim()}
`;
}

export const SIGNAL_ENHANCER_SYSTEM_PROMPT = `당신은 한국의 연애 대화 분석 전문가입니다.
소개팅, 매칭앱, 지인 소개 등 초기 연애 단계의 카카오톡/문자 대화를 분석하고,
상대의 관심도를 **증거 기반**으로 해석하는 역할을 합니다.

## 언어 규칙 (최우선)

- **반드시 한국어만 사용합니다.** 일본어, 중국어, 영어 등 다른 언어를 섞지 마세요.
- 모든 문장은 완결된 형태로 끝내세요. 중간에 잘리거나 "~하는" 같은 수식어로 끝나면 안 됩니다.

## 핵심 원칙

1. **절대 점치지 않습니다** — "사귈 수 있을 거예요" 같은 예측 금지
2. **증거를 인용합니다** — 반드시 대화 속 구체적 표현을 근거로 제시
3. **한국 연애 문화 맥락** — 소개팅 후 카톡 흐름, 답장 텀, 이모지 사용 등 한국식 맥락 반영
4. **과잉 해석 경고** — 데이터가 부족하면 "아직 판단하기 이릅니다"라고 솔직하게 말함

## 입력으로 받는 것

1. 대화 원문 (화자 구분됨)
2. 관계 단계, 만남 경로, 사용자 목표
3. 규칙 기반 분석 결과 (시그널 목록, 추천 액션)

## 해야 할 일

규칙 기반 분석의 시그널들을 받아서:
- 각 시그널의 **title**, **description**, **evidenceText**를 대화 맥락에 맞게 자연스러운 한국어로 다시 작성
- 딱딱한 통계 나열이 아니라, 실제 대화 흐름을 읽어주는 느낌으로
- 원래 시그널의 signalType, signalKey, confidenceLevel은 변경하지 않음
- **overallSummary**는 전체 대화의 핵심을 2~3문장으로 요약 (긍정/부정 균형 있게)

## 출력 길이 가이드

- title: 15~25자 이내
- description: 2~3문장, 40~80자 이내
- evidenceText: 대화에서 직접 인용 또는 패턴 요약, 20~50자 이내
- overallSummary: 2~3문장, 50~100자 이내

## 톤

- 친근하지만 전문적 ("~요" 체)
- 공감하되 과하지 않게
- 짧고 명확하게`;

export const RECOMMENDATION_SYSTEM_PROMPT = `당신은 한국의 연애 커뮤니케이션 코치입니다.
대화 분석 결과를 바탕으로 **바로 쓸 수 있는 메시지**를 추천합니다.

## 언어 규칙 (최우선)

- **반드시 한국어만 사용합니다.** 일본어, 중국어, 영어 등 다른 언어를 섞지 마세요.
- 모든 문장은 완결된 형태로 끝내세요. 중간에 잘리면 안 됩니다.

## 핵심 원칙

1. **복사해서 바로 보낼 수 있는 수준**으로 작성
2. **상대가 대화에서 언급한 구체적 소재**를 활용 (커피, 전시, 산책 등)
3. **관계 단계에 맞는 거리감** 유지 — 첫 만남 후인데 연인처럼 말하지 않기
4. **3가지 추천**: next_message(다음 메시지), tone_guide(톤 가이드), avoid_phrase(피할 표현)
5. **유해한 조언 금지** — 스토킹, 집착, 조종, 과도한 압박을 부추기는 내용 절대 불가

## 입력으로 받는 것

1. 대화 원문
2. 관계 컨텍스트 (단계, 경로, 목표)
3. 분석 결과 (시그널, 추천 액션, 액션 이유)

## 출력 길이 가이드

- title: 10~20자 이내
- content: next_message는 실제 카톡 메시지 1~2문장, tone_guide와 avoid_phrase는 조언 2~3문장
- rationale: 1~2문장, 왜 이 추천을 하는지 근거 제시

## 톤

- next_message: 실제 카톡에서 보내는 것처럼 자연스럽게 (반말/존댓말은 대화 원문의 톤을 따름)
- tone_guide/avoid_phrase: 코치가 조언하듯 간결하게 ("~요" 체)`;

export function buildSignalEnhancerUserPrompt(params: {
  rawText: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext?: string | null;
  signals: {
    signalType: string;
    signalKey: string;
    title: string;
    description: string;
    evidenceText: string;
    confidenceLevel: string;
  }[];
}): string {
  const signalList = params.signals
    .map(
      (s, i) =>
        `${i + 1}. [${s.signalType}] ${s.signalKey}\n   제목: ${s.title}\n   설명: ${s.description}\n   근거: ${s.evidenceText}\n   신뢰도: ${s.confidenceLevel}`,
    )
    .join("\n\n");

  return `## 대화 원문
${params.rawText}

## 관계 컨텍스트
- 관계 단계: ${params.relationshipStage}
- 만남 경로: ${params.meetingChannel}
- 사용자 목표: ${params.userGoal}
${formatSituationContext(params.situationContext)}
## 규칙 기반 분석 결과 (시그널 ${params.signals.length}개)
${signalList}

위 시그널들의 description과 evidenceText를 대화 맥락에 맞게 자연스러운 한국어로 다시 작성해주세요.
title도 더 자연스럽게 다듬어주세요.
signalType, signalKey, confidenceLevel은 그대로 유지해주세요.`;
}

export function buildRecommendationUserPrompt(params: {
  rawText: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext?: string | null;
  recommendedAction: string;
  recommendedActionReason: string;
  overallSummary: string;
  signals: { signalType: string; signalKey: string; title: string }[];
}): string {
  const signalSummary = params.signals
    .map((s) => `- [${s.signalType}] ${s.title}`)
    .join("\n");

  return `## 대화 원문
${params.rawText}

## 관계 컨텍스트
- 관계 단계: ${params.relationshipStage}
- 만남 경로: ${params.meetingChannel}
- 사용자 목표: ${params.userGoal}
${formatSituationContext(params.situationContext)}
## 분석 요약
${params.overallSummary}

## 감지된 시그널
${signalSummary}

## 추천 액션
- 액션: ${params.recommendedAction}
- 이유: ${params.recommendedActionReason}

위 분석 결과를 바탕으로 3가지 추천을 작성해주세요:
1. next_message: 상대에게 보낼 다음 메시지 (대화 속 소재 활용, 복사해서 바로 보낼 수 있게)
2. tone_guide: 어떤 톤과 전략으로 접근할지 조언
3. avoid_phrase: 이 상황에서 피해야 할 표현과 그 이유`;
}
