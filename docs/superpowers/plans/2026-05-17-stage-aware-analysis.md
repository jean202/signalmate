# Stage-Aware Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관계 단계(`relationshipStage`)에 따라 규칙 엔진 임계값과 Claude 프롬프트 기준선이 달라지도록 분석 파이프라인을 개선한다.

**Architecture:** `rule-based-analysis.ts`에 단계별 `StageConfig` 룩업 테이블을 추가해 `toneDrop`, `shortReply`, `question_balance` 임계값을 단계별로 적용한다. `prompts/index.ts`에 단계별 기준선 텍스트 블록을 추가해 signal enhancer와 recommendation 프롬프트에 주입한다.

**Tech Stack:** TypeScript, Vitest, Next.js 15, Anthropic SDK

---

## 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `landing-page-nextjs/lib/rule-based-analysis.ts` | 수정 | `StageConfig` 타입, `STAGE_CONFIGS` 상수, `stageFromRelationshipStage()` 헬퍼 추가; `buildMetrics`, `buildRuleBasedAnalysis` 수정 |
| `landing-page-nextjs/lib/ai/prompts/index.ts` | 수정 | `STAGE_BASELINES` 상수, `formatStageBaseline()` 함수 추가; `buildSignalEnhancerUserPrompt`, `buildRecommendationUserPrompt` 파라미터 추가 |
| `landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts` | 수정 | 단계별 임계값 테스트 추가 |
| `landing-page-nextjs/lib/ai/__tests__/prompts.test.ts` | 신규 | `formatStageBaseline` 출력 검증 |

---

## Task 1: StageConfig 타입과 룩업 테이블

**Files:**
- Modify: `landing-page-nextjs/lib/rule-based-analysis.ts` (맨 위 상수 영역)
- Test: `landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts`

### 배경

`relationshipStage`는 프론트엔드에서 4개 값 중 하나로 전달된다:
- `"before_meeting"` — 첫 만남 전
- `"after_first_date"` — 첫 만남 후
- `"after_second_date"` — 두세 번 만남 후
- `"cooling_down"` — 식어가는 느낌

`"caution"`은 현재 코드베이스의 signal type (spec에서 `"warning"`으로 쓴 건 오타).

- [ ] **Step 1: 실패하는 테스트 작성**

`landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts` 파일 하단에 추가:

```typescript
describe("stageFromRelationshipStage", () => {
  it("maps known values correctly", () => {
    expect(stageFromRelationshipStage("before_meeting")).toBe("pre_meeting");
    expect(stageFromRelationshipStage("after_first_date")).toBe("after_first");
    expect(stageFromRelationshipStage("after_second_date")).toBe("after_few");
    expect(stageFromRelationshipStage("cooling_down")).toBe("established");
  });

  it("falls back to pre_meeting for unknown values", () => {
    expect(stageFromRelationshipStage(undefined)).toBe("pre_meeting");
    expect(stageFromRelationshipStage("unknown_stage")).toBe("pre_meeting");
  });
});
```

그리고 파일 상단의 import에 `stageFromRelationshipStage` 추가:

```typescript
import { buildRuleBasedAnalysis, stageFromRelationshipStage } from "../rule-based-analysis";
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: FAIL — `stageFromRelationshipStage is not exported`

- [ ] **Step 3: StageConfig 타입과 룩업 테이블 구현**

`landing-page-nextjs/lib/rule-based-analysis.ts` 파일 맨 위(import 아래, 기존 상수들 위)에 추가:

```typescript
// ── 단계별 설정 ──────────────────────────────────────────────────────────────

type RelationshipStageKey = "pre_meeting" | "after_first" | "after_few" | "established";

type StageConfig = {
  /** toneDrop 감지: 후반부 평균이 전반부 대비 이 비율 미만이면 감지 (낮을수록 더 예민) */
  toneDropThreshold: number;
  /** 단답 기준: 이 글자 수 이하면 short reply로 집계 */
  shortReplyMaxLength: number;
  /** question_balance 신호 타입: pre_meeting/after_first는 ambiguous, 이후는 caution */
  questionWarningType: "caution" | "ambiguous";
};

const STAGE_CONFIGS: Record<RelationshipStageKey, StageConfig> = {
  pre_meeting:  { toneDropThreshold: 0.50, shortReplyMaxLength: 5,  questionWarningType: "ambiguous" },
  after_first:  { toneDropThreshold: 0.40, shortReplyMaxLength: 8,  questionWarningType: "ambiguous" },
  after_few:    { toneDropThreshold: 0.35, shortReplyMaxLength: 10, questionWarningType: "caution"   },
  established:  { toneDropThreshold: 0.30, shortReplyMaxLength: 10, questionWarningType: "caution"   },
};

export function stageFromRelationshipStage(stage?: string): RelationshipStageKey {
  switch (stage) {
    case "after_first_date":  return "after_first";
    case "after_second_date": return "after_few";
    case "cooling_down":      return "established";
    default:                  return "pre_meeting";
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: PASS (기존 테스트 포함 모두)

- [ ] **Step 5: 커밋**

```bash
git add landing-page-nextjs/lib/rule-based-analysis.ts landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts
git commit -m "feat: add StageConfig types and stageFromRelationshipStage helper"
```

---

## Task 2: 규칙 엔진에 단계별 임계값 적용

**Files:**
- Modify: `landing-page-nextjs/lib/rule-based-analysis.ts`
- Test: `landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts`

### 현재 하드코딩된 값들

- `buildMetrics` line ~94: `toneDrop = secondHalfAvg < firstHalfAvg * 0.6`
- `buildMetrics` line ~57: `otherShortReplyCount` 집계 시 `message.messageText.trim().length <= 5`

- [ ] **Step 1: toneDrop 임계값 테스트 작성**

`landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts` 하단에 추가:

```typescript
describe("stage-aware toneDrop threshold", () => {
  function makeConvWithToneDrop(
    stage: string,
    overrides?: Partial<StoredConversation>,
  ): StoredConversation {
    // 전반부는 긴 메시지, 후반부는 전반부의 45% 수준 메시지
    // → pre_meeting(0.50 threshold)에서는 감지 안됨, after_first(0.40)에서는 감지됨
    return makeConversation(
      [
        { role: "other", text: "안녕하세요 반갑습니다 오늘 날씨가 좋네요" }, // ~18자
        { role: "self",  text: "네 반갑습니다" },
        { role: "other", text: "요즘 어떻게 지내세요 저는 요즘 바빠서" }, // ~17자
        { role: "self",  text: "저도 바빠요" },
        { role: "other", text: "네" }, // 1자 — 급감
        { role: "self",  text: "그렇군요" },
        { role: "other", text: "ㅇㅇ" }, // 2자
        { role: "self",  text: "연락해요" },
      ],
      { relationshipStage: stage, ...overrides },
    );
  }

  it("does NOT flag toneDrop for pre_meeting at ~45% drop (threshold 0.50)", () => {
    const result = buildRuleBasedAnalysis(makeConvWithToneDrop("before_meeting"));
    const toneDropSignal = result.signals.find((s) => s.signalKey === "tone_drop");
    expect(toneDropSignal).toBeUndefined();
  });

  it("flags toneDrop for after_first_date at ~45% drop (threshold 0.40)", () => {
    const result = buildRuleBasedAnalysis(makeConvWithToneDrop("after_first_date"));
    const toneDropSignal = result.signals.find((s) => s.signalKey === "tone_drop");
    expect(toneDropSignal).toBeDefined();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — 두 테스트 모두 같은 threshold를 쓰므로 결과가 동일함

- [ ] **Step 3: buildMetrics에 StageConfig 파라미터 추가**

`buildMetrics` 함수 시그니처와 내부 toneDrop/shortReply 계산을 수정한다.

현재 코드 (line ~57):
```typescript
function buildMetrics(conversation: StoredConversation): MessageMetrics {
```

변경 후:
```typescript
function buildMetrics(conversation: StoredConversation, stageConfig: StageConfig): MessageMetrics {
```

현재 shortReplyCount 계산 (buildMetrics 내부, line ~57 근처):
```typescript
const otherShortReplyCount = otherMessages.filter(
  (message) => message.messageText.trim().length <= 5,
).length;
```

변경 후:
```typescript
const otherShortReplyCount = otherMessages.filter(
  (message) => message.messageText.trim().length <= stageConfig.shortReplyMaxLength,
).length;
```

현재 toneDrop 계산 (buildMetrics 내부, line ~87):
```typescript
toneDrop = secondHalfAvg < firstHalfAvg * 0.6;
```

변경 후:
```typescript
toneDrop = secondHalfAvg < firstHalfAvg * stageConfig.toneDropThreshold;
```

- [ ] **Step 4: buildRuleBasedAnalysis에서 stageConfig 파생 후 buildMetrics에 전달**

`buildRuleBasedAnalysis` 함수 (line ~441) 첫 번째 줄을 수정:

현재:
```typescript
export function buildRuleBasedAnalysis(
  conversation: StoredConversation,
  options?: AnalysisBuildOptions,
): Omit<StoredAnalysis, "id" | "createdAt" | "completedAt"> {
  const metrics = buildMetrics(conversation);
```

변경 후:
```typescript
export function buildRuleBasedAnalysis(
  conversation: StoredConversation,
  options?: AnalysisBuildOptions,
): Omit<StoredAnalysis, "id" | "createdAt" | "completedAt"> {
  const stageConfig = STAGE_CONFIGS[stageFromRelationshipStage(conversation.relationshipStage)];
  const metrics = buildMetrics(conversation, stageConfig);
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts --reporter=verbose 2>&1 | tail -30
```

Expected: PASS (모든 테스트)

- [ ] **Step 6: 커밋**

```bash
git add landing-page-nextjs/lib/rule-based-analysis.ts landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts
git commit -m "feat: apply stage-aware thresholds for toneDrop and shortReply in rule engine"
```

---

## Task 3: question_balance 신호 타입 단계별 분기

**Files:**
- Modify: `landing-page-nextjs/lib/rule-based-analysis.ts`
- Test: `landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts`

### 현재 코드 (line ~556)

```typescript
if (metrics.otherQuestionCount === 0 && metrics.otherMessages > 0) {
  signalFactory.add(
    "ambiguous",
    "question_balance",
    ...
  );
}
```

`"ambiguous"`가 하드코딩되어 있다. 단계가 `after_few` / `established`이면 `"caution"`으로 올려야 한다.

- [ ] **Step 1: question_balance 타입 분기 테스트 작성**

`landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts` 하단에 추가:

```typescript
describe("stage-aware question_balance signal type", () => {
  function makeConvNoQuestions(stage: string): StoredConversation {
    return makeConversation(
      [
        { role: "self",  text: "오늘 어떻게 지냈어요?" },
        { role: "other", text: "바빴어요" },           // 질문 없음
        { role: "self",  text: "힘들었겠다" },
        { role: "other", text: "네 그랬어요" },         // 질문 없음
        { role: "self",  text: "이번 주말은요?" },
        { role: "other", text: "아직 모르겠어요" },     // 질문 없음
      ],
      { relationshipStage: stage },
    );
  }

  it("question_balance is ambiguous for before_meeting", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("before_meeting"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("ambiguous");
  });

  it("question_balance is ambiguous for after_first_date", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("after_first_date"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("ambiguous");
  });

  it("question_balance is caution for after_second_date", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("after_second_date"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("caution");
  });

  it("question_balance is caution for cooling_down", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("cooling_down"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("caution");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts --reporter=verbose 2>&1 | grep -E "FAIL|PASS|question_balance"
```

Expected: `after_second_date`와 `cooling_down` 테스트 FAIL

- [ ] **Step 3: question_balance 신호 생성 로직에 stageConfig 적용**

`buildRuleBasedAnalysis` 내부 `question_balance` 신호 생성 부분 수정.

`stageConfig`는 Task 2에서 이미 `buildRuleBasedAnalysis` 내부에 선언되어 있다.

현재 코드:
```typescript
if (metrics.otherQuestionCount === 0 && metrics.otherMessages > 0) {
  signalFactory.add(
    "ambiguous",
    "question_balance",
    "질문을 되돌려주는 비율은 낮아요",
    "응답은 하지만 대화를 주도적으로 확장하는 패턴은 아직 약합니다.",
    "상대 메시지에 되묻기 질문이 거의 없어서, 관심 표현이 적극적이라고 보긴 어렵습니다.",
    "medium",
  );
}
```

변경 후:
```typescript
if (metrics.otherQuestionCount === 0 && metrics.otherMessages > 0) {
  signalFactory.add(
    stageConfig.questionWarningType,
    "question_balance",
    "질문을 되돌려주는 비율은 낮아요",
    "응답은 하지만 대화를 주도적으로 확장하는 패턴은 아직 약합니다.",
    "상대 메시지에 되묻기 질문이 거의 없어서, 관심 표현이 적극적이라고 보긴 어렵습니다.",
    "medium",
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: PASS (모든 테스트)

- [ ] **Step 5: 커밋**

```bash
git add landing-page-nextjs/lib/rule-based-analysis.ts landing-page-nextjs/lib/__tests__/rule-based-analysis.test.ts
git commit -m "feat: stage-aware question_balance signal type (ambiguous vs caution)"
```

---

## Task 4: 프롬프트에 단계별 기준선 주입

**Files:**
- Modify: `landing-page-nextjs/lib/ai/prompts/index.ts`
- Create: `landing-page-nextjs/lib/ai/__tests__/prompts.test.ts`

- [ ] **Step 1: 테스트 파일 작성**

`landing-page-nextjs/lib/ai/__tests__/prompts.test.ts` 신규 파일 생성:

```typescript
import { describe, it, expect } from "vitest";
import {
  formatStageBaseline,
  buildSignalEnhancerUserPrompt,
  buildRecommendationUserPrompt,
} from "../prompts/index";

describe("formatStageBaseline", () => {
  it("returns baseline block for before_meeting", () => {
    const result = formatStageBaseline("before_meeting");
    expect(result).toContain("이 단계의 정상 패턴");
    expect(result).toContain("첫 만남 전");
  });

  it("returns baseline block for after_first_date", () => {
    const result = formatStageBaseline("after_first_date");
    expect(result).toContain("24시간");
  });

  it("returns baseline block for after_second_date", () => {
    const result = formatStageBaseline("after_second_date");
    expect(result).toContain("질문을 돌려주는");
  });

  it("returns baseline block for cooling_down", () => {
    const result = formatStageBaseline("cooling_down");
    expect(result).toContain("냉각");
  });

  it("falls back to before_meeting for unknown stage", () => {
    const result = formatStageBaseline("unknown");
    expect(result).toContain("이 단계의 정상 패턴");
  });
});

describe("buildSignalEnhancerUserPrompt", () => {
  it("includes stage baseline when relationshipStage is provided", () => {
    const prompt = buildSignalEnhancerUserPrompt({
      rawText: "나: 안녕\n상대: 안녕",
      relationshipStage: "after_second_date",
      meetingChannel: "blind_date",
      userGoal: "evaluate_interest",
      signals: [],
    });
    expect(prompt).toContain("이 단계의 정상 패턴");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/ai/__tests__/prompts.test.ts 2>&1 | tail -15
```

Expected: FAIL — `formatStageBaseline is not exported`

- [ ] **Step 3: STAGE_BASELINES 상수와 formatStageBaseline 함수 추가**

`landing-page-nextjs/lib/ai/prompts/index.ts` 파일에서 `SIGNAL_ENHANCER_SYSTEM_PROMPT` 상수 바로 위에 추가:

```typescript
// ── 단계별 기준선 ────────────────────────────────────────────────────────────

type PromptStageKey = "pre_meeting" | "after_first" | "after_few" | "established";

function stageKeyFromRelationshipStage(stage?: string): PromptStageKey {
  switch (stage) {
    case "after_first_date":  return "after_first";
    case "after_second_date": return "after_few";
    case "cooling_down":      return "established";
    default:                  return "pre_meeting";
  }
}

const STAGE_BASELINES: Record<PromptStageKey, string> = {
  pre_meeting: `이 단계의 정상 패턴 (첫 만남 전)
- 답장이 짧거나 질문을 돌려주지 않아도 아직 경계를 풀지 않은 것일 수 있습니다
- 만남 언급(만나자, 어디 가보자)이 있으면 명확한 긍정 신호입니다
- 답장 텀이 반나절 이내면 관심 있다고 볼 수 있습니다
- 회피 표현(바쁘다, 나중에, 애매하다)이 반복되면 주의 신호입니다`,

  after_first: `이 단계의 정상 패턴 (첫 만남 직후)
- 만남 당일~24시간 내 후속 연락이 오면 관심 신호입니다
- 질문 없이 짧은 호응만 반복된다면 애매하게 봐야 합니다
- "다음에 또"처럼 막연한 표현은 의례적일 수 있으니 약속의 구체성을 함께 봐야 합니다
- 상대가 먼저 장소나 날짜를 꺼내면 강한 긍정 신호입니다`,

  after_few: `이 단계의 정상 패턴 (2~3번 만남 후)
- 이 단계에서는 상대가 먼저 화제를 꺼내거나 질문을 돌려주는 게 자연스러운 흐름입니다
- 약속 제안 시 날짜·장소가 구체적이면 진지한 신호입니다
- 계속 "언제 한번"으로만 넘어가면 회피 패턴으로 볼 수 있습니다
- 대화 길이나 이모지가 줄었다면 온도 하락 신호입니다`,

  established: `이 단계의 정상 패턴 (식어가는 느낌 / 4번 이상 만남)
- 상대가 먼저 연락하지 않거나 주도성이 줄었다면 냉각 신호입니다
- 짧은 답장이 반복되는 것은 이 단계에서 명확한 주의 신호입니다
- 약속 잡기를 계속 미루거나 이유 없이 취소하면 거리두기 신호입니다
- 여전히 먼저 연락하고 일정을 구체적으로 잡는다면 좋은 신호입니다`,
};

export function formatStageBaseline(relationshipStage?: string): string {
  const key = stageKeyFromRelationshipStage(relationshipStage);
  return `\n## ${STAGE_BASELINES[key]}\n`;
}
```

- [ ] **Step 4: buildSignalEnhancerUserPrompt에 기준선 주입**

현재 `buildSignalEnhancerUserPrompt` 함수의 반환값에서 `## 관계 컨텍스트` 블록 바로 아래에 `formatStageBaseline` 삽입.

현재:
```typescript
export function buildSignalEnhancerUserPrompt(params: {
  rawText: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext?: string | null;
  signals: { ... }[];
}): string {
  ...
  return `## 대화 원문
${params.rawText}

## 관계 컨텍스트
- 관계 단계: ${params.relationshipStage}
- 만남 경로: ${params.meetingChannel}
- 사용자 목표: ${params.userGoal}
${formatSituationContext(params.situationContext)}
## 규칙 기반 분석 결과 ...`;
}
```

변경 후 (`formatSituationContext` 호출 다음 줄에 추가):
```typescript
  return `## 대화 원문
${params.rawText}

## 관계 컨텍스트
- 관계 단계: ${params.relationshipStage}
- 만남 경로: ${params.meetingChannel}
- 사용자 목표: ${params.userGoal}
${formatSituationContext(params.situationContext)}${formatStageBaseline(params.relationshipStage)}
## 규칙 기반 분석 결과 (시그널 ${params.signals.length}개)
${signalList}

위 시그널들의 description과 evidenceText를 대화 맥락에 맞게 자연스러운 한국어로 다시 작성해주세요.
title도 더 자연스럽게 다듬어주세요.
signalType, signalKey, confidenceLevel은 그대로 유지해주세요.`;
```

- [ ] **Step 5: buildRecommendationUserPrompt에도 동일하게 주입**

`buildRecommendationUserPrompt` 함수에서 같은 위치에 추가:

```typescript
  return `## 대화 원문
${params.rawText}

## 관계 컨텍스트
- 관계 단계: ${params.relationshipStage}
- 만남 경로: ${params.meetingChannel}
- 사용자 목표: ${params.userGoal}
${formatSituationContext(params.situationContext)}${formatStageBaseline(params.relationshipStage)}
## 분석 요약
...`;
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/ai/__tests__/prompts.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: PASS

- [ ] **Step 7: 전체 테스트 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run 2>&1 | tail -10
```

Expected: PASS (기존 테스트 포함 모두)

- [ ] **Step 8: 커밋**

```bash
git add landing-page-nextjs/lib/ai/prompts/index.ts landing-page-nextjs/lib/ai/__tests__/prompts.test.ts
git commit -m "feat: inject stage-aware baseline context into signal enhancer and recommendation prompts"
```

---

## 자체 검토 결과

**스펙 커버리지:**
- ✅ A: 규칙 엔진 단계별 임계값 — Task 1, 2, 3
- ✅ B: 프롬프트 기준선 주입 — Task 4
- ✅ 하위 호환 — 모든 함수 파라미터가 선택적이거나 기존 시그니처 유지

**수정된 스펙 불일치:**
- 스펙에서 `meetingCount` 사용 → 실제 코드에는 `relationshipStage` 사용 (수정 반영)
- 스펙에서 `"warning"` → 실제 코드 signal type은 `"caution"` (수정 반영)
- 스펙의 단계 이름 → 실제 프론트엔드 값 `"before_meeting"` / `"after_first_date"` / `"after_second_date"` / `"cooling_down"` (수정 반영)

**타입 일관성:**
- `stageFromRelationshipStage` — Task 1, 2, 3에서 동일 이름 사용
- `StageConfig.questionWarningType` — Task 1 정의, Task 3에서 사용
- `formatStageBaseline` — Task 4에서 정의 및 사용
