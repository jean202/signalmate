# 단계별 온도감 인식 분석 설계

작성일: 2026-05-17

## 문제

규칙 엔진 16패턴과 Claude 프롬프트가 모든 관계 단계에 동일한 기준을 적용하고 있다.
첫 연락 단계에서 질문 없는 짧은 답장은 정상이지만, 2~3번 만난 후에는 냉각 신호다.
현재 엔진은 이 차이를 구분하지 못한다.

## 해결 방향

A + B 병행:
- **A**: 규칙 엔진에 단계별 임계값 레이어 추가
- **B**: Claude 프롬프트에 단계별 "정상 기준선" 텍스트 주입

## 단계 분류

`meetingCount` 입력값을 내부적으로 4개 단계로 매핑한다.

| 내부 단계 | meetingCount | 관계 상황 |
|-----------|-------------|----------|
| `pre_meeting` | `none` | 아직 직접 만난 적 없음 |
| `after_first` | `once` | 첫 만남 후 |
| `after_few` | `2_3_times` | 2~3번 만남 후 |
| `established` | `4_plus` | 4번 이상 만남 |

## 섹션 A: 규칙 엔진 임계값

### 변경 대상 파일
`landing-page-nextjs/lib/rule-based-analysis.ts`

### 새 타입

```typescript
type RelationshipStage = 'pre_meeting' | 'after_first' | 'after_few' | 'established';

type StageConfig = {
  toneDropThreshold: number;   // 메시지 길이 감소 비율 (이 이하면 toneDrop)
  shortReplyMaxLength: number; // 이 글자 이하 = 짧은 답장
  questionWarningThreshold: number; // 이 미만이면 question_balance 경고
  questionWarningType: 'warning' | 'ambiguous'; // 경고 수준
};
```

### 단계별 설정값

| 설정 | pre_meeting | after_first | after_few | established |
|------|-------------|-------------|-----------|-------------|
| `toneDropThreshold` | 0.50 | 0.40 | 0.35 | 0.30 |
| `shortReplyMaxLength` | 5 | 8 | 10 | 10 |
| `questionWarningThreshold` | 0 (경고 없음) | 0 | 1 | 1 |
| `questionWarningType` | `ambiguous` | `ambiguous` | `warning` | `warning` |

**근거:**
- `pre_meeting`: 탐색 단계라 짧은 답장·질문 부재가 정상. 느슨한 기준 적용.
- `after_first`: 만남 후 첫 대화라 아직 경계가 있을 수 있음. 중간 기준.
- `after_few` / `established`: 관계가 어느 정도 형성됐으므로 질문 부재와 짧은 답장이 냉각 신호.

### 인터페이스 변경

```typescript
// 기존
function runRuleBasedAnalysis(conversation: StoredConversation): AnalysisResult

// 변경 후
function runRuleBasedAnalysis(
  conversation: StoredConversation,
  meetingCount?: 'none' | 'once' | '2_3_times' | '4_plus'
): AnalysisResult
```

`meetingCount`가 없으면 기존 동작과 동일한 기본값(`pre_meeting` 기준) 사용. 하위 호환 유지.

### 내부 구현

```typescript
const STAGE_CONFIGS: Record<RelationshipStage, StageConfig> = {
  pre_meeting:  { toneDropThreshold: 0.50, shortReplyMaxLength: 5,  questionWarningThreshold: 0, questionWarningType: 'ambiguous' },
  after_first:  { toneDropThreshold: 0.40, shortReplyMaxLength: 8,  questionWarningThreshold: 0, questionWarningType: 'ambiguous' },
  after_few:    { toneDropThreshold: 0.35, shortReplyMaxLength: 10, questionWarningThreshold: 1, questionWarningType: 'warning'   },
  established:  { toneDropThreshold: 0.30, shortReplyMaxLength: 10, questionWarningThreshold: 1, questionWarningType: 'warning'   },
};

function meetingCountToStage(meetingCount?: string): RelationshipStage {
  switch (meetingCount) {
    case 'once':      return 'after_first';
    case '2_3_times': return 'after_few';
    case '4_plus':    return 'established';
    default:          return 'pre_meeting';
  }
}
```

`buildMetrics`에서 `toneDrop` 계산 시 `stageConfig.toneDropThreshold` 사용.
신호 생성 시 `shortReplyMaxLength`와 `questionWarningThreshold`/`questionWarningType` 사용.

## 섹션 B: 프롬프트 기준선 주입

### 변경 대상 파일
`landing-page-nextjs/lib/ai/prompts/index.ts`

### 새 상수 및 함수

```typescript
const STAGE_BASELINES: Record<RelationshipStage, string> = {
  pre_meeting: `
첫 만남 전 단계입니다.
- 답장이 짧거나 질문을 돌려주지 않아도 아직 경계를 풀지 않은 것일 수 있습니다
- 만남 언급(만나자, 어디 가보자)이 있으면 명확한 긍정 신호입니다
- 답장 텀이 반나절 이내면 관심 있다고 볼 수 있습니다
- 회피 표현(바쁘다, 나중에, 애매하다)이 반복되면 주의 신호입니다`,

  after_first: `
첫 만남 직후 단계입니다.
- 만남 당일~24시간 내 후속 연락이 오면 관심 신호입니다
- 질문 없이 짧은 호응만 반복된다면 애매하게 봐야 합니다
- "다음에 또"처럼 막연한 표현은 의례적일 수 있으니 약속의 구체성을 함께 봐야 합니다
- 상대가 먼저 장소나 날짜를 꺼내면 강한 긍정 신호입니다`,

  after_few: `
2~3번 만난 후 단계입니다.
- 이 단계에서는 상대가 먼저 화제를 꺼내거나 질문을 돌려주는 게 자연스러운 흐름입니다
- 약속 제안 시 날짜·장소가 구체적이면 진지한 신호입니다
- 계속 "언제 한번"으로만 넘어가면 회피 패턴으로 볼 수 있습니다
- 대화 길이나 이모지가 줄었다면 온도 하락 신호입니다`,

  established: `
4번 이상 만난 후 단계입니다.
- 상대가 먼저 연락하지 않거나 주도성이 줄었다면 냉각 신호입니다
- 짧은 답장이 반복되는 것은 이 단계에서 명확한 주의 신호입니다
- 약속 잡기를 계속 미루거나 이유 없이 취소하면 거리두기 신호입니다
- 여전히 먼저 연락하고 일정을 구체적으로 잡는다면 좋은 신호입니다`,
};

export function formatStageBaseline(meetingCount?: string): string {
  const stage = meetingCountToStage(meetingCount);
  return `\n## 이 단계의 정상 패턴 (해석 기준선)\n${STAGE_BASELINES[stage]}\n`;
}
```

`meetingCountToStage`는 rule-based-analysis.ts와 동일한 로직 — 공유 유틸로 분리하거나 양쪽에 각각 둔다. 규모가 작으니 각각 두는 게 의존성 없이 단순하다.

### 주입 위치

`buildSignalEnhancerUserPrompt`와 `buildRecommendationUserPrompt` 두 함수의 `## 관계 컨텍스트` 블록 바로 아래에 삽입:

```typescript
export function buildSignalEnhancerUserPrompt(params: {
  // 기존 파라미터...
  meetingCount?: string; // 추가
}): string {
  return `## 대화 원문
${params.rawText}

## 관계 컨텍스트
...
${formatStageBaseline(params.meetingCount)}  // 추가
## 규칙 기반 분석 결과
...`;
}
```

`meetingCount`가 없으면 `formatStageBaseline`이 `pre_meeting` 기준선을 반환. 기존 동작과 차이 없음.

## 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `lib/rule-based-analysis.ts` | 임계값 상수 추가, 함수 시그니처 선택적 파라미터 추가 |
| `lib/ai/prompts/index.ts` | 상수 + 헬퍼 함수 추가, 기존 빌더 함수 파라미터 추가 |
| API 라우트 | `meetingCount`를 규칙 엔진과 프롬프트 빌더에 전달하도록 연결 확인 |
| DB / 스키마 | 변경 없음 |
| 프론트엔드 | 변경 없음 |

## 성공 기준

- `pre_meeting` 단계에서 질문 없는 짧은 답장이 `warning`이 아닌 `ambiguous`로 분류됨
- `after_few` 단계에서 동일 패턴이 `warning`으로 분류됨
- Claude 프롬프트에 단계별 기준선 텍스트가 포함됨
- `meetingCount` 없이 호출해도 기존과 동일하게 동작함
- 기존 테스트 모두 통과

## 제외 범위

- Few-shot 예시 변경 (단계별 few-shot은 데이터 쌓인 뒤 2차 작업)
- 신호 가중치 시스템 (C안, 추후)
- UI 변경
- 새 API 엔드포인트
