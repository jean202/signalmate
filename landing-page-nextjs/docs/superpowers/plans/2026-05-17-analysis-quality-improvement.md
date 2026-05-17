# Analysis Quality Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 이모지/리액션 신호 2개 신설(`emoji_engagement`, `emoji_drop`)과 기존 7개 신호의 문구를 개선한다.

**Architecture:** `lib/rule-based-analysis.ts` 단일 파일을 수정한다. `MessageMetrics` 타입에 필드 2개를 추가하고, `buildMetrics()`에 계산 로직을 추가하며, `buildRuleBasedAnalysis()`에 신호 2개를 삽입한다. 문구 변경은 기존 `signalFactory.add()` 호출의 인자만 수정한다.

**Tech Stack:** TypeScript, Vitest

---

## 파일 구조

- Modify: `lib/rule-based-analysis.ts`
  - `MessageMetrics` 타입에 `otherWarmDensity: number`, `otherWarmDropDetected: boolean` 추가
  - `buildMetrics()` 반환 전에 두 필드 계산 추가
  - `buildRuleBasedAnalysis()` 내 기존 신호 뒤에 `emoji_engagement`, `emoji_drop` 삽입
  - 기존 7개 신호 문구 수정
- Modify: `lib/__tests__/rule-based-analysis.test.ts`
  - `emoji_engagement` 신호 테스트 2개 추가
  - `emoji_drop` 신호 테스트 2개 추가

---

## Task 1: `emoji_engagement` 신호 — TDD

**Files:**
- Modify: `lib/__tests__/rule-based-analysis.test.ts`
- Modify: `lib/rule-based-analysis.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/__tests__/rule-based-analysis.test.ts` 파일 맨 끝(닫는 `}` 이전)에 아래 `describe` 블록을 추가한다.

```ts
describe("emoji_engagement signal", () => {
  it("fires positive signal when warm expression density >= 50% with >= 3 other messages", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕!" },
      { role: "other", text: "안녕 ㅎㅎ" },           // warm: ㅎ ✓
      { role: "self",  text: "오늘 어땠어?" },
      { role: "other", text: "좋았어! 너무 재밌었음" }, // warm: ! ✓
      { role: "self",  text: "나도" },
      { role: "other", text: "ㅋㅋ 진짜로?" },          // warm: ㅋ ✓
      { role: "self",  text: "응응" },
      { role: "other", text: "다음에 또 가자" },         // no warm ✗
    ]);
    // other 4개, warm 포함 3개 → 75% ≥ 50%
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_engagement");
    expect(signal).toBeDefined();
    expect(signal?.signalType).toBe("positive");
  });

  it("does NOT fire when warm density < 50%", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕" },
      { role: "other", text: "응" },
      { role: "self",  text: "오늘 어때?" },
      { role: "other", text: "그냥 그래" },
      { role: "self",  text: "뭐 했어?" },
      { role: "other", text: "집에 있었어" },
      { role: "self",  text: "그렇구나" },
      { role: "other", text: "응 뭐" },
    ]);
    // other 4개, warm 0개 → 0% < 50%
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_engagement");
    expect(signal).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: `emoji_engagement` 관련 2개 테스트 FAIL ("signal is undefined" 등)

- [ ] **Step 3: `MessageMetrics` 타입에 필드 추가**

`lib/rule-based-analysis.ts`의 `MessageMetrics` 타입(line ~24)에 두 줄을 추가한다.

```ts
type MessageMetrics = {
  // ... 기존 필드들 ...
  toneDrop: boolean;
  averageOtherResponseDelayMinutes: number | null;
  otherInitiativeScore: number;
  responseCadenceScore: number;
  questionReciprocityScore: number;
  schedulingCommitmentScore: number;
  baselineScore: number;
  otherWarmDensity: number;          // ← 추가
  otherWarmDropDetected: boolean;    // ← 추가
};
```

- [ ] **Step 4: `buildMetrics()`에 계산 로직 추가**

`buildMetrics()` 내 `return { ...partialMetrics, ... }` 직전(baselineScore 계산 직후)에 아래 코드를 추가한다.

```ts
const otherWarmDensity =
  otherMessages.length > 0 ? partialMetrics.otherWarmCount / otherMessages.length : 0;

let otherWarmDropDetected = false;
if (otherMessages.length >= 4) {
  const half = Math.floor(otherMessages.length / 2);
  const firstHalfMsgs = otherMessages.slice(0, half);
  const secondHalfMsgs = otherMessages.slice(half);
  const firstHalfWarmDensity =
    firstHalfMsgs.filter((m) => warmPattern.test(m.messageText)).length / firstHalfMsgs.length;
  const secondHalfWarmDensity =
    secondHalfMsgs.filter((m) => warmPattern.test(m.messageText)).length / secondHalfMsgs.length;
  otherWarmDropDetected =
    firstHalfWarmDensity >= 0.3 && secondHalfWarmDensity < firstHalfWarmDensity * 0.6;
}
```

그리고 `return` 문에 두 필드를 추가한다.

```ts
return {
  ...partialMetrics,
  otherResponsePairs,
  otherInitiativeScore,
  responseCadenceScore,
  questionReciprocityScore,
  schedulingCommitmentScore,
  baselineScore,
  otherWarmDensity,        // ← 추가
  otherWarmDropDetected,   // ← 추가
};
```

- [ ] **Step 5: `emoji_engagement` 신호 추가**

`buildRuleBasedAnalysis()` 내에서 `length_balance` 신호 블록(line ~677) 바로 뒤에 아래 코드를 삽입한다.

```ts
// ── emoji_engagement: 이모지/리액션 밀도 높음 ──
if (metrics.otherWarmDensity >= 0.5 && metrics.otherMessages >= 3) {
  const warmMessageCount = Math.round(metrics.otherWarmDensity * metrics.otherMessages);
  const warmRatioPct = Math.round(metrics.otherWarmDensity * 100);
  signalFactory.add(
    "positive",
    "emoji_engagement",
    "감정 표현을 자주 섞어서 답해요",
    "상대가 이모지나 감탄 표현을 메시지마다 꽤 자주 쓰고 있어서, 딱딱하게 닫힌 톤은 아닙니다.",
    `상대 메시지 ${metrics.otherMessages}개 중 감정 표현이 포함된 답장이 ${warmMessageCount}개(${warmRatioPct}%)입니다.`,
    metrics.otherWarmDensity >= 0.7 ? "high" : "medium",
  );
}
```

- [ ] **Step 6: 테스트 실행 — 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 7: 커밋**

```bash
cd landing-page-nextjs && git add lib/rule-based-analysis.ts lib/__tests__/rule-based-analysis.test.ts
git commit -m "feat: add emoji_engagement positive signal with warm density metric"
```

---

## Task 2: `emoji_drop` 신호 — TDD

**Files:**
- Modify: `lib/__tests__/rule-based-analysis.test.ts`
- Modify: `lib/rule-based-analysis.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

Task 1에서 추가한 `describe("emoji_engagement signal", ...)` 블록 바로 뒤에 아래 블록을 추가한다.

```ts
describe("emoji_drop signal", () => {
  it("fires caution signal when warm density drops sharply from first to second half", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕!" },
      { role: "other", text: "안녕 ㅎㅎ" },     // firstHalf warm ✓
      { role: "self",  text: "어때?" },
      { role: "other", text: "좋아 ㅋㅋ" },     // firstHalf warm ✓
      { role: "self",  text: "뭐 해?" },
      { role: "other", text: "그냥 있어" },      // secondHalf no warm ✗
      { role: "self",  text: "심심하겠다" },
      { role: "other", text: "뭐 그래" },        // secondHalf no warm ✗
    ]);
    // firstHalf density: 2/2 = 1.0 (≥ 0.3)
    // secondHalf density: 0/2 = 0.0 (< 1.0 × 0.6 = 0.6) → fires
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_drop");
    expect(signal).toBeDefined();
    expect(signal?.signalType).toBe("caution");
  });

  it("does NOT fire when firstHalf warm density < 0.3", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕" },
      { role: "other", text: "응" },       // firstHalf no warm ✗
      { role: "self",  text: "어때?" },
      { role: "other", text: "그냥" },     // firstHalf no warm ✗
      { role: "self",  text: "뭐해?" },
      { role: "other", text: "집" },       // secondHalf no warm ✗
      { role: "self",  text: "그래" },
      { role: "other", text: "응" },       // secondHalf no warm ✗
    ]);
    // firstHalf density: 0/2 = 0.0 (< 0.3) → no fire
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_drop");
    expect(signal).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: `emoji_drop` 관련 2개 테스트 FAIL

- [ ] **Step 3: `emoji_drop` 신호 추가**

`buildRuleBasedAnalysis()` 내에서 `tone_drop` 신호 블록(line ~803) 바로 뒤에 아래 코드를 삽입한다.

```ts
// ── emoji_drop: 이모지/리액션 밀도 급감 ──
if (metrics.otherWarmDropDetected) {
  signalFactory.add(
    "caution",
    "emoji_drop",
    "대화 후반으로 갈수록 반응 표현이 줄고 있어요",
    "처음엔 이모지나 감탄 표현이 있었는데 후반부에서 눈에 띄게 줄었어요. 피로도가 올라가거나 관심이 옅어지는 구간일 수 있어요.",
    "대화 전반부에 비해 후반부에서 감정 표현이 크게 줄었습니다.",
    "medium",
  );
}
```

- [ ] **Step 4: 테스트 실행 — 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run lib/__tests__/rule-based-analysis.test.ts
```

Expected: 모든 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
cd landing-page-nextjs && git add lib/rule-based-analysis.ts lib/__tests__/rule-based-analysis.test.ts
git commit -m "feat: add emoji_drop caution signal with warm density drop detection"
```

---

## Task 3: 기존 신호 문구 개선

**Files:**
- Modify: `lib/rule-based-analysis.ts`

7개 신호의 `description` 또는 `evidenceText`를 수정한다. 각 변경은 해당 `signalFactory.add()` 호출의 인자만 바꾼다. 신호 키, 타입, confidenceLevel은 건드리지 않는다.

- [ ] **Step 1: `short_replies` 수정**

현재 description:
```
`${stageConfig.shortReplyMaxLength}자 이하의 단답이 절반 이상이라서, 대화에 깊이 참여하고 있다고 보기 어렵습니다.`
```

새 description:
```ts
`${stageConfig.shortReplyMaxLength}자 이하 단답이 절반 이상이에요. 바쁜 상황일 수도 있고, 대화 참여도를 판단하려면 더 많은 대화가 필요해요.`
```

- [ ] **Step 2: `question_balance` 수정**

`otherQuestionCount === 0` 분기의 evidenceText 현재:
```
"상대 메시지에 되묻기 질문이 거의 없어서, 관심 표현이 적극적이라고 보긴 어렵습니다."
```

새 description + evidenceText:
```ts
// description
"응답은 하지만 질문을 되돌려주는 패턴은 아직 약한 편이에요. 대화 스타일이 수동적일 수 있어요."
// evidenceText
`상대 메시지 ${metrics.otherMessages}개 중 질문이 ${metrics.otherQuestionCount}개 확인됐습니다.`
```

- [ ] **Step 3: `one_sided_conversation` 수정**

현재 description:
```
"내가 보낸 메시지 수가 상대보다 훨씬 많아서, 대화 주도권이 한쪽에 치우쳐 있습니다."
```

새 description:
```ts
"내가 보낸 메시지 수가 상대보다 훨씬 많은 편이에요. 내가 대화를 이끌고 있는 구간일 수 있어요."
```

- [ ] **Step 4: `date_specificity` 수정**

현재 description:
```
"일정 관련 반응은 있으나, 시간이나 날짜 수준의 확정은 나오지 않았습니다."
```

새 description:
```ts
"일정 관련 반응은 나왔지만, 시간이나 날짜까지 확정하는 단계는 아직 아니에요."
```

- [ ] **Step 5: `hedged_replies` 수정**

현재 description:
```
"거절은 아니지만, 분명한 확답보다는 여지를 남기는 문장이 반복됩니다."
```

새 description:
```ts
"거절은 아니지만, 확답보다는 여지를 남기는 표현이 반복되는 편이에요."
```

- [ ] **Step 6: `slow_response_cadence` 수정**

현재 description:
```
"상대가 응답은 하고 있지만 평균 답장 간격이 하루를 넘어, 즉각적인 관심 신호로 보기는 어렵습니다."
```

새 description:
```ts
"상대가 응답은 하고 있지만 평균 답장 간격이 하루를 넘어, 적극적인 관심 신호로 읽기엔 아직 이른 편이에요."
```

- [ ] **Step 7: `tone_drop` 수정**

현재 description:
```
"상대 메시지 길이가 전반부 대비 후반부에서 크게 줄었습니다. 흥미가 줄었을 가능성이 있습니다."
```

새 description:
```ts
"상대 메시지 길이가 전반부 대비 후반부에서 눈에 띄게 줄었어요. 흥미가 다소 옅어졌을 수도 있어요."
```

- [ ] **Step 8: 전체 테스트 실행 — 통과 확인**

```bash
cd landing-page-nextjs && npx vitest run
```

Expected: 100개+ 테스트 모두 PASS (기존 96개 + 신규 4개)

- [ ] **Step 9: 커밋**

```bash
cd landing-page-nextjs && git add lib/rule-based-analysis.ts
git commit -m "refine: soften caution/ambiguous signal text and improve evidence specificity"
```
