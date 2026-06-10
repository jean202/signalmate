# NLP/Signal Learning Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 마스킹된 실제 캡쳐를 SignalMate 엔진에 흘려보내며 NLP/시그널 추론을 학습하는 도구 일습(작업 공간 + trace/eval 스크립트 + 템플릿)을 구축한다.

**Architecture:** 기존 `landing-page-nextjs/lib/ai` 엔진을 "엔진"으로 재사용하고, 학습 산출물은 `landing-page-nextjs/learning/`에 분리한다. 학습 스파인(캡쳐 → 룰 시그널 → 메트릭)은 API 키·DB 없이 완전 오프라인으로 도는 `matchPatterns`/`calculateMetrics`를 사용한다. 임베딩·LLM 단계는 키가 있을 때만 도는 선택 태스크로 분리한다.

**Tech Stack:** TypeScript, Vitest(테스트), tsx(CLI 스크립트 실행). 엔진 모듈은 `@/` 경로 별칭으로 import(스크립트는 tsx가 tsconfig `paths`를 해석).

---

## File Structure

모든 경로는 `landing-page-nextjs/` 기준.

- `learning/README.md` — 학습 트랙 사용법 (Create)
- `learning/lib/capture.ts` — `Capture` 타입 + `captureToConversation()` 변환 (Create)
- `learning/lib/capture.test.ts` — 변환 로직 테스트 (Create)
- `learning/lib/format-trace.ts` — 순수 함수: trace 객체 → markdown (Create)
- `learning/lib/format-trace.test.ts` — 포맷터 테스트 (Create)
- `learning/lib/eval-core.ts` — 순수 함수: `deriveTemperature()` + `aggregateEval()` (Create)
- `learning/lib/eval-core.test.ts` — 평가 집계 테스트 (Create)
- `learning/scripts/trace.ts` — CLI: 캡쳐 1개 → trace markdown 출력 (Create)
- `learning/scripts/eval.ts` — CLI: dataset 전체 → 시스템 vs 내 라벨 비교 표 (Create)
- `learning/captures/example-0000.json` — 완전 합성 예시 캡쳐(안전, git 추적) (Create)
- `learning/templates/experiment-card.md` — Phase 3 실험 카드 템플릿 (Create)
- `package.json` — devDep `tsx` + `learn:trace`/`learn:eval` 스크립트 (Modify)
- `.gitignore` — 실데이터(`captures/`·`traces/`·`dataset.jsonl`) 제외, 합성 예시·템플릿은 추적 (Modify)

타입 계약(전 태스크 공통):

```ts
// learning/lib/capture.ts 에서 정의, 다른 파일이 import
export type CaptureMessage = { sender: "me" | "them"; text: string; sentAt?: string };
export type CaptureContext = Record<string, string>;
export type CaptureLabel = {
  temperature: "cold" | "neutral" | "warm" | "hot";
  topSignal: string;
  nextMove: string;
};
export type Capture = {
  id: string;
  source?: string;
  context?: CaptureContext;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  messages: CaptureMessage[];
  myLabel?: CaptureLabel;
};
```

---

## Task 1: 도구 설치 & 작업 공간 스캐폴딩

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Modify: `.gitignore`
- Create: `learning/captures/.gitkeep`, `learning/traces/.gitkeep`, `learning/experiments/cards/.gitkeep`

- [ ] **Step 1: tsx 설치**

Run (cwd = `landing-page-nextjs`): `npm install -D tsx`
Expected: `tsx` 가 devDependencies에 추가됨. tsx는 실행 시 tsconfig.json의 `paths`(`@/*`)를 해석한다.

- [ ] **Step 2: npm 스크립트 추가**

`package.json` 의 `"scripts"` 에 두 줄 추가:

```jsonc
"scripts": {
  "dev": "env -u ANTHROPIC_API_KEY next dev --port 3000",
  "build": "prisma generate && next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "learn:trace": "tsx learning/scripts/trace.ts",
  "learn:eval": "tsx learning/scripts/eval.ts"
}
```

- [ ] **Step 3: 디렉터리 스캐폴딩**

Run (cwd = `landing-page-nextjs`):
```bash
mkdir -p learning/lib learning/scripts learning/captures learning/traces learning/experiments/cards learning/templates
touch learning/captures/.gitkeep learning/traces/.gitkeep learning/experiments/cards/.gitkeep
```

- [ ] **Step 4: .gitignore 갱신 — 실데이터 제외, 합성 예시·템플릿은 추적**

`.gitignore` 끝에 추가:

```gitignore
# 학습 트랙: 실데이터(마스킹했어도 제3자 데이터)는 커밋하지 않음
learning/captures/*
!learning/captures/.gitkeep
!learning/captures/example-*.json
learning/traces/*
!learning/traces/.gitkeep
learning/experiments/dataset.jsonl
```

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json .gitignore learning/captures/.gitkeep learning/traces/.gitkeep learning/experiments/cards/.gitkeep
git commit -m "chore(learning): scaffold learning workspace + tsx runner"
```

---

## Task 2: Capture 타입 & StoredConversation 변환

**Files:**
- Create: `learning/lib/capture.ts`
- Test: `learning/lib/capture.test.ts`

변환은 기존 테스트 헬퍼 `makeConversationFixture`(`test/helpers/make-conversation.ts`)를 재사용한다(DRY). `context` 블록은 `situationContext` 문자열로 접어 넣어 LLM 단계까지 흐르게 한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`learning/lib/capture.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { captureToConversation, type Capture } from "./capture";

const baseCapture: Capture = {
  id: "0001",
  source: "데이팅앱 A",
  context: { job: "대기업 / 사무직", residence: "수도권 번화가" },
  relationshipStage: "after_first_date",
  messages: [
    { sender: "them", text: "나 [직장] 근처 카페 자주 가ㅋㅋ" },
    { sender: "me", text: "오 거기 좋은 데 있어?" },
  ],
};

describe("captureToConversation", () => {
  it("maps sender me/them to self/other and preserves order", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.messages.map((m) => m.senderRole)).toEqual(["other", "self"]);
    expect(convo.messages.map((m) => m.messageText)).toEqual([
      "나 [직장] 근처 카페 자주 가ㅋㅋ",
      "오 거기 좋은 데 있어?",
    ]);
    expect(convo.messages.map((m) => m.sequenceNo)).toEqual([1, 2]);
  });

  it("folds context block into situationContext", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.situationContext).toContain("job: 대기업 / 사무직");
    expect(convo.situationContext).toContain("residence: 수도권 번화가");
  });

  it("uses relationshipStage from capture and defaults the rest", () => {
    const convo = captureToConversation(baseCapture);
    expect(convo.relationshipStage).toBe("after_first_date");
    expect(convo.meetingChannel).toBe("dating_app");
    expect(convo.userGoal).toBe("build_rapport");
  });

  it("leaves situationContext null when no context provided", () => {
    const convo = captureToConversation({ id: "x", relationshipStage: "unknown", messages: [] });
    expect(convo.situationContext).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run learning/lib/capture.test.ts`
Expected: FAIL — `captureToConversation` / `capture` 모듈 없음.

- [ ] **Step 3: 최소 구현**

`learning/lib/capture.ts`:

```ts
import type { StoredConversation } from "@/lib/analysis-store";
import { makeConversationFixture } from "@/test/helpers/make-conversation";

export type CaptureMessage = { sender: "me" | "them"; text: string; sentAt?: string };
export type CaptureContext = Record<string, string>;
export type CaptureLabel = {
  temperature: "cold" | "neutral" | "warm" | "hot";
  topSignal: string;
  nextMove: string;
};
export type Capture = {
  id: string;
  source?: string;
  context?: CaptureContext;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  messages: CaptureMessage[];
  myLabel?: CaptureLabel;
};

export function captureToConversation(capture: Capture): StoredConversation {
  const situationContext = capture.context
    ? Object.entries(capture.context)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ")
    : null;

  return makeConversationFixture({
    relationshipStage: capture.relationshipStage ?? "unknown",
    meetingChannel: capture.meetingChannel ?? "dating_app",
    userGoal: capture.userGoal ?? "build_rapport",
    situationContext,
    messages: capture.messages.map((message) => ({
      senderRole: message.sender === "me" ? "self" : "other",
      messageText: message.text,
      sentAt: message.sentAt ?? null,
    })),
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run learning/lib/capture.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add learning/lib/capture.ts learning/lib/capture.test.ts
git commit -m "feat(learning): add Capture type and StoredConversation converter"
```

---

## Task 3: 합성 예시 캡쳐

**Files:**
- Create: `learning/captures/example-0000.json`

실데이터가 아닌 **완전 합성** 예시 — git에 추적되어 도구 동작 검증과 포맷 문서 역할을 한다.

- [ ] **Step 1: 예시 캡쳐 작성**

`learning/captures/example-0000.json`:

```json
{
  "id": "example-0000",
  "source": "합성 예시 (실데이터 아님)",
  "context": {
    "job": "대기업 / 사무직",
    "residence": "수도권 번화가",
    "age_band": "20대 후반"
  },
  "relationshipStage": "after_first_date",
  "meetingChannel": "dating_app",
  "userGoal": "build_rapport",
  "messages": [
    { "sender": "me", "text": "어제 즐거웠어요 ㅎㅎ 잘 들어갔어요?" },
    { "sender": "them", "text": "네 덕분에 잘 들어갔어요! 저도 재밌었어요 ㅋㅋ" },
    { "sender": "me", "text": "다음에 [지명] 쪽 전시 같이 보러 갈래요?" },
    { "sender": "them", "text": "오 좋아요 언제 시간 돼요?" }
  ]
}
```

- [ ] **Step 2: 변환이 도는지 빠른 검증**

Run: `npx vitest run learning/lib/capture.test.ts`
Expected: PASS (기존 테스트 여전히 통과 — 예시는 데이터일 뿐 회귀 없음).

- [ ] **Step 3: 커밋**

```bash
git add learning/captures/example-0000.json
git commit -m "docs(learning): add synthetic example capture"
```

---

## Task 4: Trace 포맷터 (순수 함수)

**Files:**
- Create: `learning/lib/format-trace.ts`
- Test: `learning/lib/format-trace.test.ts`

`PatternMatchResult`(엔진의 `lib/ai/agent/tools/pattern-matcher.ts` 에서 export)를 입력으로 받는다. 포맷터는 순수 함수라 테스트가 쉽다.

- [ ] **Step 1: 실패하는 테스트 작성**

`learning/lib/format-trace.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatTrace, type TraceResult } from "./format-trace";

const trace: TraceResult = {
  captureId: "example-0000",
  parsed: { messageCount: 4, selfCount: 2, otherCount: 2 },
  ruleSignals: {
    signals: [
      {
        signalType: "positive",
        signalKey: "warm_tone",
        title: "따뜻한 톤",
        description: "이모지와 호응이 이어집니다.",
        confidenceLevel: "medium",
      },
    ],
    baselineScores: {
      otherInitiative: 60,
      responseCadence: 70,
      questionReciprocity: 55,
      schedulingCommitment: 80,
      overall: 66,
    },
    recommendedAction: "suggest_date",
    recommendedActionReason: "약속 흐름이 살아있습니다.",
    confidenceLevel: "medium",
    summary: "1개 시그널 감지",
  },
};

describe("formatTrace", () => {
  it("renders capture id, parse stats, and each signal", () => {
    const md = formatTrace(trace);
    expect(md).toContain("# Trace: example-0000");
    expect(md).toContain("메시지 4개 (나: 2, 상대: 2)");
    expect(md).toContain("warm_tone");
    expect(md).toContain("따뜻한 톤");
    expect(md).toContain("overall: 66");
    expect(md).toContain("suggest_date");
  });

  it("leaves a blank '내 코멘트' line per stage for the learner to fill", () => {
    const md = formatTrace(trace);
    expect(md).toContain("내 코멘트:");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run learning/lib/format-trace.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`learning/lib/format-trace.ts`:

```ts
import type { PatternMatchResult } from "@/lib/ai/agent/tools/pattern-matcher";

export type TraceResult = {
  captureId: string;
  parsed: { messageCount: number; selfCount: number; otherCount: number };
  ruleSignals: PatternMatchResult;
};

export function formatTrace(trace: TraceResult): string {
  const { captureId, parsed, ruleSignals } = trace;
  const lines: string[] = [];

  lines.push(`# Trace: ${captureId}`, "");

  lines.push("## 단계 1 — 파싱/정규화");
  lines.push(`- 메시지 ${parsed.messageCount}개 (나: ${parsed.selfCount}, 상대: ${parsed.otherCount})`);
  lines.push("- 내 코멘트:", "");

  lines.push("## 단계 2 — 룰 시그널 (오프라인)");
  for (const signal of ruleSignals.signals) {
    lines.push(`- [${signal.signalType}] ${signal.signalKey}: ${signal.title}`);
    lines.push(`  - ${signal.description} (confidence: ${signal.confidenceLevel})`);
  }
  const s = ruleSignals.baselineScores;
  lines.push(
    `- baselineScores → otherInitiative: ${s.otherInitiative}, responseCadence: ${s.responseCadence}, questionReciprocity: ${s.questionReciprocity}, schedulingCommitment: ${s.schedulingCommitment}, overall: ${s.overall}`,
  );
  lines.push(`- recommendedAction: ${ruleSignals.recommendedAction} — ${ruleSignals.recommendedActionReason}`);
  lines.push("- 내 코멘트:", "");

  lines.push("## 단계 3~5 — 임베딩/LLM (선택, API 키 필요)");
  lines.push("- (Task 9에서 키 있을 때 채워짐)");
  lines.push("- 내 코멘트:", "");

  return lines.join("\n");
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run learning/lib/format-trace.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: 커밋**

```bash
git add learning/lib/format-trace.ts learning/lib/format-trace.test.ts
git commit -m "feat(learning): add pure trace markdown formatter"
```

---

## Task 5: trace.ts CLI (오프라인 단계)

**Files:**
- Create: `learning/scripts/trace.ts`

캡쳐 파일을 읽어 변환 → `matchPatterns`(오프라인) → `formatTrace` → `learning/traces/<id>.trace.md` 로 저장. 인자 없으면 사용법 출력.

- [ ] **Step 1: 스크립트 작성**

`learning/scripts/trace.ts`:

```ts
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { matchPatterns } from "@/lib/ai/agent/tools/pattern-matcher";
import { captureToConversation, type Capture } from "../lib/capture";
import { formatTrace } from "../lib/format-trace";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run learn:trace -- <capture-path>");
    console.error("Example: npm run learn:trace -- learning/captures/example-0000.json");
    process.exit(1);
  }

  const capturePath = path.resolve(process.cwd(), arg);
  const capture = JSON.parse(await readFile(capturePath, "utf8")) as Capture;

  const conversation = captureToConversation(capture);
  const ruleSignals = matchPatterns(conversation);

  const selfCount = conversation.messages.filter((m) => m.senderRole === "self").length;
  const otherCount = conversation.messages.filter((m) => m.senderRole === "other").length;

  const md = formatTrace({
    captureId: capture.id,
    parsed: { messageCount: conversation.messages.length, selfCount, otherCount },
    ruleSignals,
  });

  const outPath = path.resolve(process.cwd(), "learning/traces", `${capture.id}.trace.md`);
  await writeFile(outPath, md, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(md);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: 합성 예시로 실행**

Run (cwd = `landing-page-nextjs`): `npm run learn:trace -- learning/captures/example-0000.json`
Expected: `learning/traces/example-0000.trace.md` 생성 + 콘솔에 markdown 출력. 룰 시그널/baselineScores가 채워져 있어야 함(오프라인, 키 불필요).

- [ ] **Step 3: 생성물 확인 후 커밋(생성된 trace는 .gitignore라 스크립트만 커밋)**

```bash
git add learning/scripts/trace.ts
git commit -m "feat(learning): add offline trace CLI"
```

---

## Task 6: 평가 코어 (순수 함수) — 시스템 vs 내 라벨

**Files:**
- Create: `learning/lib/eval-core.ts`
- Test: `learning/lib/eval-core.test.ts`

Phase 2의 핵심: 룰 엔진의 `baselineScores.overall`(0~100)을 거친 `temperature`로 매핑하고, 내 라벨과 비교한다. **이 매핑이 거칠다는 걸 보는 것 자체가 학습 목표** — 어디서 갈리는지가 Phase 3 개선 대상이 된다.

- [ ] **Step 1: 실패하는 테스트 작성**

`learning/lib/eval-core.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { aggregateEval, deriveTemperature, type EvalRow } from "./eval-core";

describe("deriveTemperature", () => {
  it("maps overall score to coarse temperature bands", () => {
    expect(deriveTemperature(20)).toBe("cold");
    expect(deriveTemperature(50)).toBe("neutral");
    expect(deriveTemperature(68)).toBe("warm");
    expect(deriveTemperature(85)).toBe("hot");
  });

  it("uses boundaries: <40 cold, <60 neutral, <75 warm, else hot", () => {
    expect(deriveTemperature(39)).toBe("cold");
    expect(deriveTemperature(40)).toBe("neutral");
    expect(deriveTemperature(59)).toBe("neutral");
    expect(deriveTemperature(60)).toBe("warm");
    expect(deriveTemperature(74)).toBe("warm");
    expect(deriveTemperature(75)).toBe("hot");
  });
});

describe("aggregateEval", () => {
  it("counts agreements and collects disagreements", () => {
    const rows: EvalRow[] = [
      { captureId: "a", myTemp: "warm", systemTemp: "warm" },
      { captureId: "b", myTemp: "hot", systemTemp: "warm" },
      { captureId: "c", myTemp: "cold", systemTemp: "cold" },
    ];
    const result = aggregateEval(rows);
    expect(result.total).toBe(3);
    expect(result.agreements).toBe(2);
    expect(result.agreementRate).toBeCloseTo(2 / 3, 5);
    expect(result.disagreements).toEqual([
      { captureId: "b", myTemp: "hot", systemTemp: "warm" },
    ]);
  });

  it("returns 0 agreementRate for an empty dataset (no divide-by-zero)", () => {
    const result = aggregateEval([]);
    expect(result.total).toBe(0);
    expect(result.agreementRate).toBe(0);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run learning/lib/eval-core.test.ts`
Expected: FAIL — 모듈 없음.

- [ ] **Step 3: 최소 구현**

`learning/lib/eval-core.ts`:

```ts
import type { CaptureLabel } from "./capture";

export type Temperature = CaptureLabel["temperature"];

export type EvalRow = {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
};

export type EvalSummary = {
  total: number;
  agreements: number;
  agreementRate: number;
  disagreements: EvalRow[];
};

export function deriveTemperature(overall: number): Temperature {
  if (overall < 40) return "cold";
  if (overall < 60) return "neutral";
  if (overall < 75) return "warm";
  return "hot";
}

export function aggregateEval(rows: EvalRow[]): EvalSummary {
  const disagreements = rows.filter((row) => row.myTemp !== row.systemTemp);
  const agreements = rows.length - disagreements.length;
  return {
    total: rows.length,
    agreements,
    agreementRate: rows.length === 0 ? 0 : agreements / rows.length,
    disagreements,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run learning/lib/eval-core.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: 커밋**

```bash
git add learning/lib/eval-core.ts learning/lib/eval-core.test.ts
git commit -m "feat(learning): add eval core (temperature derivation + aggregation)"
```

---

## Task 7: eval.ts CLI — dataset 전체 비교

**Files:**
- Create: `learning/scripts/eval.ts`

`learning/experiments/dataset.jsonl`(한 줄 = 하나의 `Capture` with `myLabel`)을 읽어 각 캡쳐를 룰 엔진에 돌리고, 시스템 temperature vs 내 라벨을 비교한 표 + 불일치 목록을 출력한다. dataset.jsonl은 실데이터라 .gitignore.

- [ ] **Step 1: 스크립트 작성**

`learning/scripts/eval.ts`:

```ts
import { readFile } from "node:fs/promises";
import path from "node:path";
import { matchPatterns } from "@/lib/ai/agent/tools/pattern-matcher";
import { captureToConversation, type Capture } from "../lib/capture";
import { aggregateEval, deriveTemperature, type EvalRow } from "../lib/eval-core";

async function main() {
  const arg = process.argv[2] ?? "learning/experiments/dataset.jsonl";
  const datasetPath = path.resolve(process.cwd(), arg);
  const raw = await readFile(datasetPath, "utf8");

  const captures = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Capture);

  const rows: EvalRow[] = [];
  for (const capture of captures) {
    if (!capture.myLabel) {
      console.warn(`skip ${capture.id}: no myLabel`);
      continue;
    }
    const result = matchPatterns(captureToConversation(capture));
    const systemTemp = deriveTemperature(result.baselineScores.overall);
    rows.push({ captureId: capture.id, myTemp: capture.myLabel.temperature, systemTemp });
  }

  console.log("captureId | 내 라벨 | 시스템 | 일치");
  console.log("----------|---------|--------|-----");
  for (const row of rows) {
    const match = row.myTemp === row.systemTemp ? "O" : "X";
    console.log(`${row.captureId} | ${row.myTemp} | ${row.systemTemp} | ${match}`);
  }

  const summary = aggregateEval(rows);
  console.log("");
  console.log(`일치율: ${summary.agreements}/${summary.total} = ${(summary.agreementRate * 100).toFixed(1)}%`);
  if (summary.disagreements.length > 0) {
    console.log("불일치(→ Phase 3 개선 후보):");
    for (const d of summary.disagreements) {
      console.log(`  - ${d.captureId}: 나=${d.myTemp} / 시스템=${d.systemTemp}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: 임시 dataset로 스모크 테스트**

Run (cwd = `landing-page-nextjs`):
```bash
cat learning/captures/example-0000.json | tr -d '\n' | sed 's/}$/,"myLabel":{"temperature":"hot","topSignal":"약속 흐름","nextMove":"날짜 제안"}}/' > /tmp/smoke.jsonl
npm run learn:eval -- /tmp/smoke.jsonl
```
Expected: 1행 표 + 일치율 출력. (합성 예시의 시스템 temperature가 hot이 아니면 불일치 1건 — 정상, Phase 2가 잡으려는 바로 그 현상.)

- [ ] **Step 3: 커밋(생성 dataset 아닌 스크립트만)**

```bash
git add learning/scripts/eval.ts
git commit -m "feat(learning): add eval CLI comparing system temp vs my label"
```

---

## Task 8: README + 실험 카드 템플릿 (Phase 1~3 운영 문서)

**Files:**
- Create: `learning/README.md`
- Create: `learning/templates/experiment-card.md`

코드가 아니라 **학습 루프를 사람이 굴리는 절차**를 문서화한다. Phase 2/3의 라벨링·가설 수립은 사람이 하는 활동이고, 도구(trace/eval)가 이를 받쳐준다.

- [ ] **Step 1: 실험 카드 템플릿 작성**

`learning/templates/experiment-card.md`:

```markdown
# 실험 카드 #NNN

- **대상 불일치:** (Phase2 eval 불일치 케이스 id들)
- **가설:** (왜 갈렸나 — 룰이 거칠다 / 임베딩이 엉뚱 / 프롬프트 사각지대 / 내 라벨 오류)
- **변경(딱 하나):** (룰 임계값 / 프롬프트 문구 / few-shot 예시 중 하나만)
- **측정:** `npm run learn:eval` 일치율  (before __% → after __%)
- **결론:** (효과 있음/없음 + 과적합 의심 여부, 표본 수)
```

- [ ] **Step 2: README 작성**

`learning/README.md`:

```markdown
# Learning Track — 실제 캡쳐로 NLP/시그널 추론 이해하기

상용화가 아닌 개인 학습용. 마스킹된 캡쳐를 기존 엔진(`../lib/ai`)에 흘려보내며 추론을 이해한다.

## 캡쳐 등록 (서있는 원칙)
1. 이미지 원본 저장 금지 — 텍스트로 옮겨 `captures/NNNN.json`.
2. **마스킹 = 일반화.** 식별어는 본문에서 `[직장]`·`[지명]` 토큰으로, 사회적 범주는 `context` 블록에 넓게 기록. 범주를 좁혀 재식별 가능하게 만들지 말 것.
3. `captures/`·`traces/`·`dataset.jsonl` 은 .gitignore. git에는 집계 노트만.
4. 포맷은 `captures/example-0000.json`(합성 예시) 참고.

## Phase 1 — 해부
- `npm run learn:trace -- captures/NNNN.json` → `traces/NNNN.trace.md` 생성.
- 각 단계 "내 코멘트:" 줄을 직접 채운다. 특히 임베딩(Task 9 활성화 시) 이웃이 진짜 비슷한지 눈으로 검증.

## Phase 2 — 실험노트
1. 캡쳐를 **블라인드 라벨링**(시스템 출력 보기 전 `myLabel` 작성: temperature/topSignal/nextMove).
2. 라벨 단 캡쳐들을 `experiments/dataset.jsonl`(한 줄 = 캡쳐 1개)에 모은다.
3. `npm run learn:eval` → 시스템 temperature vs 내 라벨 표 + 불일치 목록.
4. 불일치마다 왜 갈렸는지 기록 → Phase 3 후보.

## Phase 3 — 개선루프
1. 불일치 하나 선택 → `templates/experiment-card.md` 복사해 `experiments/cards/NNN.md`.
2. **딱 한 변수만** 바꾼다(룰 임계값/프롬프트/few-shot 중 하나).
3. 같은 dataset으로 `npm run learn:eval` 재측정 → before/after 기록.
4. 가설이 틀려도 카드에 남긴다. 작은 표본 과적합을 경계.
```

- [ ] **Step 3: 전체 테스트 재확인(회귀 없음)**

Run: `npm run test`
Expected: 기존 테스트 + 새 학습 테스트 모두 PASS.

- [ ] **Step 4: 커밋**

```bash
git add learning/README.md learning/templates/experiment-card.md
git commit -m "docs(learning): add README and experiment-card template"
```

---

## Task 9 (선택): 임베딩 + LLM trace 단계 활성화

> 키(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`)와 pgvector DB가 있을 때만. 없으면 건너뛴다 — Phase 1~3 학습 루프는 오프라인 룰 단계만으로 완결된다.

**Files:**
- Modify: `learning/scripts/trace.ts`
- Modify: `learning/lib/format-trace.ts`

엔진 시그니처(참고):
- `enhanceSignals({ rawText, relationshipStage, meetingChannel, userGoal, situationContext?, signals })` → 보정된 시그널.
- `findSimilarConversations(queryText, limit?, excludeConversationId?)` → 유사 대화(키 없으면 `[]` 반환, DB 필요).

- [ ] **Step 1: trace.ts에 키 가드 분기 추가**

`learning/scripts/trace.ts` 의 `matchPatterns` 호출 다음에 추가:

```ts
// 선택 단계: 키가 있을 때만
if (process.env.ANTHROPIC_API_KEY) {
  const { enhanceSignals } = await import("@/lib/ai/chains/signal-enhancer");
  const enhanced = await enhanceSignals({
    rawText: conversation.rawText,
    relationshipStage: conversation.relationshipStage,
    meetingChannel: conversation.meetingChannel,
    userGoal: conversation.userGoal,
    situationContext: conversation.situationContext,
    signals: ruleSignals.signals.map((s, index) => ({
      id: s.signalKey,
      signalType: s.signalType as "positive" | "ambiguous" | "caution",
      signalKey: s.signalKey,
      title: s.title,
      description: s.description,
      evidenceText: "",
      confidenceLevel: s.confidenceLevel as "low" | "medium" | "high",
      displayOrder: index,
    })),
  });
  console.log("LLM enhanced signals:", JSON.stringify(enhanced, null, 2));
}
```

> `enhanceSignals` 의 `signals` 인자는 `StoredSignal[]`(필드: id, signalType, signalKey, title, description, evidenceText, confidenceLevel, displayOrder)이다. 위 매핑이 이 전부를 채운다. 학습 목적상 콘솔 출력으로 충분하므로 trace markdown 통합은 선택.

- [ ] **Step 2: 키 있을 때만 실행 확인**

Run: `npm run learn:trace -- learning/captures/example-0000.json`
Expected: 키 없으면 오프라인 출력만(에러 없음). 키 있으면 추가로 LLM enhanced signals 출력.

- [ ] **Step 3: 커밋**

```bash
git add learning/scripts/trace.ts learning/lib/format-trace.ts
git commit -m "feat(learning): optional LLM-enhanced trace stage behind key guard"
```

---

## 완료 기준

- `npm run test` 통과(기존 + 신규 학습 테스트).
- `npm run learn:trace -- learning/captures/example-0000.json` 가 키 없이 오프라인 trace 생성.
- `npm run learn:eval -- <dataset>` 가 일치율 + 불일치 목록 출력.
- 실데이터(`captures/`·`traces/`·`dataset.jsonl`)는 git에 올라가지 않음; 합성 예시·템플릿·스크립트만 추적됨.
- README가 Phase 1~3 학습 루프 운영법을 담고 있음.
