# Label-First Signal Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small label-first evaluation loop so masked real-chat captures can compare the user's blind temperature label against SignalMate's relationship signal judgment, including how far disagreements are.

**Architecture:** Reuse the existing `landing-page-nextjs/learning/` track and keep all work local to learning files. The pure evaluation logic lives in `learning/lib/eval-core.ts`, the CLI only formats and prints results, and documentation/examples teach the no-image-storage workflow. No production API, DB, image storage, or model training path is added.

**Tech Stack:** Next.js monorepo, TypeScript, Vitest, `tsx`-based learning scripts, existing `matchPatterns()` rule engine.

## Global Constraints

- Data use scope: personal local experiment only.
- Image handling: do not store original screenshots in repo, DB, logs, or learning folders.
- Input method: use only text extracted through the existing screenshot extraction API/UI, then mask/generalize it before saving.
- First improvement target: attraction temperature and relationship signal judgment.
- Success metric: compare the user's blind label with the program judgment, then reduce repeated disagreement cases.
- Do not add production user-data collection, DB storage, image persistence, or model fine-tuning.
- Keep real data ignored by git; only synthetic examples and aggregate notes may be tracked.

---

## File Structure

All implementation paths below are under `landing-page-nextjs/` unless the path starts with `docs/`.

- Modify: `learning/lib/eval-core.ts`  
  Responsibility: pure temperature band mapping, temperature distance calculation, eval row construction, and aggregate summary.

- Modify: `learning/lib/eval-core.test.ts`  
  Responsibility: unit tests for temperature band boundaries, distance calculation, and aggregate disagreement counts.

- Modify: `learning/scripts/eval.ts`  
  Responsibility: CLI that runs each capture through `matchPatterns()`, builds `EvalRow` objects, and prints exact match plus distance summary.

- Modify: `learning/captures/example-0000.json`  
  Responsibility: tracked synthetic capture showing the full capture shape, including `myLabel`.

- Modify: `learning/README.md`  
  Responsibility: user-facing local workflow for screenshot text extraction, masking, blind labels, eval, and single-variable improvement.

Shared interface produced by Task 1 and consumed by Task 2:

```ts
export type Temperature = CaptureLabel["temperature"];
export type TemperatureDistance = 0 | 1 | 2 | 3;

export type EvalRow = {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
  tempDistance: TemperatureDistance;
};

export type EvalSummary = {
  total: number;
  agreements: number;
  agreementRate: number;
  oneStepDisagreements: number;
  majorDisagreements: number;
  disagreements: EvalRow[];
};

export function temperatureDistance(
  myTemp: Temperature,
  systemTemp: Temperature,
): TemperatureDistance;

export function createEvalRow(params: {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
}): EvalRow;
```

---

### Task 1: Temperature Distance Core

**Files:**
- Modify: `landing-page-nextjs/learning/lib/eval-core.ts`
- Modify: `landing-page-nextjs/learning/lib/eval-core.test.ts`

**Interfaces:**
- Consumes: `CaptureLabel["temperature"]` from `learning/lib/capture.ts`
- Produces: `TemperatureDistance`, `temperatureDistance()`, `createEvalRow()`, expanded `EvalRow`, expanded `EvalSummary`

- [ ] **Step 1: Write the failing tests**

Replace `learning/lib/eval-core.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import {
  aggregateEval,
  createEvalRow,
  deriveTemperature,
  temperatureDistance,
  type EvalRow,
} from "./eval-core";

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

describe("temperatureDistance", () => {
  it("returns 0 for exact matches", () => {
    expect(temperatureDistance("cold", "cold")).toBe(0);
    expect(temperatureDistance("hot", "hot")).toBe(0);
  });

  it("returns absolute band distance for disagreements", () => {
    expect(temperatureDistance("warm", "hot")).toBe(1);
    expect(temperatureDistance("cold", "warm")).toBe(2);
    expect(temperatureDistance("hot", "cold")).toBe(3);
  });
});

describe("createEvalRow", () => {
  it("stores the derived temperature distance on each row", () => {
    expect(
      createEvalRow({ captureId: "case-1", myTemp: "hot", systemTemp: "neutral" }),
    ).toEqual({
      captureId: "case-1",
      myTemp: "hot",
      systemTemp: "neutral",
      tempDistance: 2,
    });
  });
});

describe("aggregateEval", () => {
  it("counts agreements and groups disagreement distances", () => {
    const rows: EvalRow[] = [
      createEvalRow({ captureId: "a", myTemp: "warm", systemTemp: "warm" }),
      createEvalRow({ captureId: "b", myTemp: "hot", systemTemp: "warm" }),
      createEvalRow({ captureId: "c", myTemp: "cold", systemTemp: "hot" }),
    ];

    const result = aggregateEval(rows);

    expect(result.total).toBe(3);
    expect(result.agreements).toBe(1);
    expect(result.agreementRate).toBeCloseTo(1 / 3, 5);
    expect(result.oneStepDisagreements).toBe(1);
    expect(result.majorDisagreements).toBe(1);
    expect(result.disagreements).toEqual([
      { captureId: "b", myTemp: "hot", systemTemp: "warm", tempDistance: 1 },
      { captureId: "c", myTemp: "cold", systemTemp: "hot", tempDistance: 3 },
    ]);
  });

  it("returns 0 agreementRate and 0 distance counts for an empty dataset", () => {
    const result = aggregateEval([]);

    expect(result.total).toBe(0);
    expect(result.agreementRate).toBe(0);
    expect(result.oneStepDisagreements).toBe(0);
    expect(result.majorDisagreements).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `landing-page-nextjs/`:

```bash
npx vitest run learning/lib/eval-core.test.ts
```

Expected: FAIL with TypeScript/runtime errors for missing `temperatureDistance`, missing `createEvalRow`, and missing summary fields.

- [ ] **Step 3: Write the minimal implementation**

Replace `learning/lib/eval-core.ts` with:

```ts
import type { CaptureLabel } from "./capture";

/**
 * 온도 밴드: "cold" | "neutral" | "warm" | "hot"
 */
export type Temperature = CaptureLabel["temperature"];
export type TemperatureDistance = 0 | 1 | 2 | 3;

const TEMPERATURE_ORDER: Record<Temperature, number> = {
  cold: 0,
  neutral: 1,
  warm: 2,
  hot: 3,
};

/**
 * 평가 행: 캡처 ID와 학습자 레이블(myTemp) vs 규칙 엔진(systemTemp) 온도 비교 데이터.
 */
export type EvalRow = {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
  tempDistance: TemperatureDistance;
};

/**
 * 평가 요약: 전체, 합의 건수, 합의율(0~1), 거리별 불일치 카운트, 불일치 목록.
 */
export type EvalSummary = {
  total: number;
  agreements: number;
  agreementRate: number;
  oneStepDisagreements: number;
  majorDisagreements: number;
  disagreements: EvalRow[];
};

/**
 * 룰 엔진 overall(0~100)을 거친 temperature 밴드로 매핑.
 *
 * 의도적으로 거친 매핑이며, 불일치가 학습 재료가 된다.
 * 경계: <40 cold, <60 neutral, <75 warm, 이상 hot.
 *
 * @param overall - 규칙 엔진의 overall 스코어 (0~100)
 * @returns 온도 밴드
 */
export function deriveTemperature(overall: number): Temperature {
  if (overall < 40) return "cold";
  if (overall < 60) return "neutral";
  if (overall < 75) return "warm";
  return "hot";
}

/**
 * 두 temperature 밴드가 몇 단계 떨어져 있는지 계산.
 */
export function temperatureDistance(
  myTemp: Temperature,
  systemTemp: Temperature,
): TemperatureDistance {
  return Math.abs(TEMPERATURE_ORDER[myTemp] - TEMPERATURE_ORDER[systemTemp]) as TemperatureDistance;
}

/**
 * 평가 행 생성 시 distance를 함께 고정해 CLI와 집계가 같은 값을 사용하게 한다.
 */
export function createEvalRow(params: {
  captureId: string;
  myTemp: Temperature;
  systemTemp: Temperature;
}): EvalRow {
  return {
    ...params,
    tempDistance: temperatureDistance(params.myTemp, params.systemTemp),
  };
}

/**
 * 평가 행 배열을 집계하여 학습자 vs 시스템 합의도 계산.
 *
 * myTemp와 systemTemp가 일치하는 행을 합의로 계산,
 * 불일치하는 행을 disagreements 배열에 수집.
 * 빈 배열은 agreementRate 0으로 처리(divide-by-zero 방지).
 *
 * @param rows - 평가 행 배열
 * @returns 집계 요약
 */
export function aggregateEval(rows: EvalRow[]): EvalSummary {
  const disagreements = rows.filter((row) => row.tempDistance > 0);
  const agreements = rows.length - disagreements.length;
  return {
    total: rows.length,
    agreements,
    agreementRate: rows.length === 0 ? 0 : agreements / rows.length,
    oneStepDisagreements: disagreements.filter((row) => row.tempDistance === 1).length,
    majorDisagreements: disagreements.filter((row) => row.tempDistance >= 2).length,
    disagreements,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `landing-page-nextjs/`:

```bash
npx vitest run learning/lib/eval-core.test.ts
```

Expected: PASS for `deriveTemperature`, `temperatureDistance`, `createEvalRow`, and `aggregateEval`.

- [ ] **Step 5: Commit**

```bash
git add learning/lib/eval-core.ts learning/lib/eval-core.test.ts
git commit -m "feat(learning): measure temperature disagreement distance"
```

---

### Task 2: Eval CLI Distance Output

**Files:**
- Modify: `landing-page-nextjs/learning/scripts/eval.ts`

**Interfaces:**
- Consumes: `createEvalRow()`, `deriveTemperature()`, `aggregateEval()`, `TemperatureDistance`
- Produces: CLI output with `거리`, one-step count, and two-or-more-step count

- [ ] **Step 1: Update the CLI to use `createEvalRow()` and print distance**

Replace `learning/scripts/eval.ts` with:

```ts
/**
 * Phase 2 실험노트용 CLI — dataset.jsonl의 캡쳐들을 룰 엔진에 돌려 시스템 temperature vs 내 라벨을 비교.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { matchPatterns } from "@/lib/ai/agent/tools/pattern-matcher";
import { captureToConversation, type Capture } from "../lib/capture";
import {
  aggregateEval,
  createEvalRow,
  deriveTemperature,
  type EvalRow,
  type TemperatureDistance,
} from "../lib/eval-core";

async function main() {
  const arg = process.argv[2] ?? "learning/experiments/dataset.jsonl";
  const datasetPath = path.resolve(process.cwd(), arg);
  const raw = await readFile(datasetPath, "utf8");

  const captures = raw
    .split("\n")
    .map((line, index) => ({ line: line.trim(), lineNo: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .flatMap(({ line, lineNo }) => {
      try {
        return [JSON.parse(line) as Capture];
      } catch (error) {
        console.warn(`skip line ${lineNo}: JSON parse error — ${(error as Error).message}`);
        return [];
      }
    });

  const rows: EvalRow[] = [];
  const seenIds = new Set<string>();
  for (const capture of captures) {
    if (!capture.id || !Array.isArray(capture.messages)) {
      console.warn(`skip invalid capture (id/messages missing)`);
      continue;
    }
    if (!capture.myLabel) {
      console.warn(`skip ${capture.id}: no myLabel`);
      continue;
    }
    if (seenIds.has(capture.id)) {
      console.warn(`warn: duplicate captureId "${capture.id}"`);
    }
    seenIds.add(capture.id);
    const result = matchPatterns(captureToConversation(capture));
    const systemTemp = deriveTemperature(result.baselineScores.overall);
    rows.push(
      createEvalRow({
        captureId: capture.id,
        myTemp: capture.myLabel.temperature,
        systemTemp,
      }),
    );
  }

  console.log("captureId | 내 라벨 | 시스템 | 거리 | 일치");
  console.log("----------|---------|--------|------|-----");
  for (const row of rows) {
    const match = row.tempDistance === 0 ? "O" : "X";
    console.log(
      `${row.captureId} | ${row.myTemp} | ${row.systemTemp} | ${formatDistance(row.tempDistance)} | ${match}`,
    );
  }

  const summary = aggregateEval(rows);
  console.log("");
  console.log(`일치율: ${summary.agreements}/${summary.total} = ${(summary.agreementRate * 100).toFixed(1)}%`);
  console.log(
    `거리 요약: 한 단계 차이 ${summary.oneStepDisagreements}건, 두 단계 이상 차이 ${summary.majorDisagreements}건`,
  );
  if (summary.disagreements.length > 0) {
    console.log("불일치(→ Phase 3 개선 후보):");
    for (const d of summary.disagreements) {
      console.log(
        `  - ${d.captureId}: 나=${d.myTemp} / 시스템=${d.systemTemp} / 거리=${formatDistance(d.tempDistance)}`,
      );
    }
  }
}

function formatDistance(distance: TemperatureDistance): string {
  return distance === 0 ? "0" : `${distance}단계`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 2: Run focused tests**

Run from `landing-page-nextjs/`:

```bash
npx vitest run learning/lib/eval-core.test.ts learning/lib/capture.test.ts
```

Expected: PASS for both learning test files.

- [ ] **Step 3: Run a CLI smoke test with the synthetic capture**

Run from `landing-page-nextjs/`:

```bash
node -e 'const fs=require("node:fs"); const c=require("./learning/captures/example-0000.json"); fs.writeFileSync("/tmp/signalmate-example-dataset.jsonl", JSON.stringify(c)+"\n");'
npm run learn:eval -- /tmp/signalmate-example-dataset.jsonl
```

Expected: command exits 0 and output includes these lines:

```text
captureId | 내 라벨 | 시스템 | 거리 | 일치
거리 요약: 한 단계 차이
```

- [ ] **Step 4: Commit**

```bash
git add learning/scripts/eval.ts
git commit -m "feat(learning): show temperature distance in eval CLI"
```

---

### Task 3: Synthetic Capture Label Example

**Files:**
- Modify: `landing-page-nextjs/learning/captures/example-0000.json`

**Interfaces:**
- Consumes: `Capture` and `CaptureLabel` shape from `learning/lib/capture.ts`
- Produces: a tracked synthetic example that demonstrates `myLabel`

- [ ] **Step 1: Add a blind-label example to the synthetic capture**

Replace `learning/captures/example-0000.json` with:

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
  ],
  "myLabel": {
    "temperature": "hot",
    "topSignal": "상대가 다음 약속 제안에 긍정하고 구체적인 시간 조율로 이어갔다",
    "nextMove": "가능한 날짜 후보를 2개 정도 제안하며 약속을 확정한다"
  }
}
```

- [ ] **Step 2: Validate JSON parses**

Run from `landing-page-nextjs/`:

```bash
node -e 'const c=require("./learning/captures/example-0000.json"); if (!c.myLabel || c.myLabel.temperature !== "hot") process.exit(1);'
```

Expected: exits 0 with no output.

- [ ] **Step 3: Run eval smoke test again**

Run from `landing-page-nextjs/`:

```bash
node -e 'const fs=require("node:fs"); const c=require("./learning/captures/example-0000.json"); fs.writeFileSync("/tmp/signalmate-example-dataset.jsonl", JSON.stringify(c)+"\n");'
npm run learn:eval -- /tmp/signalmate-example-dataset.jsonl
```

Expected: exits 0 and does not print `skip example-0000: no myLabel`.

- [ ] **Step 4: Commit**

```bash
git add learning/captures/example-0000.json
git commit -m "docs(learning): include blind label in synthetic capture"
```

---

### Task 4: Label-First Workflow Documentation

**Files:**
- Modify: `landing-page-nextjs/learning/README.md`

**Interfaces:**
- Consumes: existing `learn:eval` script, existing `captures/NNNN.json` convention, Task 1 distance summary, Task 3 example capture
- Produces: clear local workflow for the user to run the label-first loop without storing original screenshots

- [ ] **Step 1: Update README with the label-first loop**

Replace `learning/README.md` with:

```md
# Learning Track — 실제 캡쳐로 NLP/시그널 추론 이해하기

상용화가 아닌 개인 학습용. 마스킹된 캡쳐를 기존 엔진(`../lib/ai`)에 흘려보내며 추론을 이해한다.

## 캡쳐 등록 (서있는 원칙)

1. 이미지 원본 저장 금지 — 기존 캡쳐 추출 API/UI로 텍스트만 얻고, 원본 이미지는 repo·DB·로그·학습 폴더에 남기지 않는다.
2. **마스킹 = 일반화.** 식별어는 본문에서 `[직장]`·`[지명]` 토큰으로, 사회적 범주는 `context` 블록에 넓게 기록. 범주를 좁혀 재식별 가능하게 만들지 말 것.
3. `captures/`·`traces/`·`experiments/*.jsonl` 은 .gitignore. git에는 집계 노트(실험 카드)만. **주의:** `example-0000.json`만 예외로 추적되므로 실데이터 파일명에 `example-` 접두사를 쓰지 말 것.
4. 포맷은 `captures/example-0000.json`(합성 예시) 참고.

## 빠른 루프 — 라벨 우선 평가

1. 앱에서 실제 캡쳐를 읽어 추출 텍스트를 얻는다. 원본 이미지는 저장하지 않는다.
2. 추출 텍스트를 직접 검수하고, 식별정보를 넓은 범주로 마스킹해 `captures/NNNN.json`을 만든다.
3. 시스템 결과를 보기 전에 `myLabel.temperature`, `myLabel.topSignal`, `myLabel.nextMove`를 먼저 적는다.
4. 라벨을 단 캡쳐를 한 줄 JSON으로 `experiments/dataset.jsonl`에 추가한다.
5. `npm run learn:eval`을 실행해 내 라벨과 시스템 temperature를 비교한다.
6. `거리`가 `1단계`인 케이스와 `2단계` 이상인 케이스를 나눠 본다. 먼저 `2단계` 이상 불일치부터 개선 후보로 삼는다.
7. 반복되는 불일치 패턴 하나를 골라 실험 카드에 기록한다.
8. 룰, 프롬프트, few-shot 중 하나만 바꾸고 같은 dataset으로 다시 측정한다.

## Phase 1 — 해부

- `npm run learn:trace -- learning/captures/NNNN.json` → `traces/NNNN.trace.md` 생성.
- 각 단계 "내 코멘트:" 줄을 직접 채운다. 특히 임베딩(LLM 단계 활성화 시) 이웃이 진짜 비슷한지 눈으로 검증.

## Phase 2 — 실험노트

1. 캡쳐를 **블라인드 라벨링**(시스템 출력 보기 전 `myLabel` 작성: temperature/topSignal/nextMove).
2. 라벨 단 캡쳐들을 `experiments/dataset.jsonl`(한 줄 = 캡쳐 1개)에 모은다.
3. `npm run learn:eval` → 시스템 temperature vs 내 라벨 표 + distance + 불일치 목록.
4. 불일치마다 왜 갈렸는지 기록 → Phase 3 후보.

## Phase 3 — 개선루프

1. 불일치 하나 선택 → `templates/experiment-card.md` 복사해 `experiments/cards/NNN.md`.
2. **딱 한 변수만** 바꾼다(룰 임계값/프롬프트/few-shot 중 하나).
3. 같은 dataset으로 `npm run learn:eval` 재측정 → before/after 기록.
4. 가설이 틀려도 카드에 남긴다. 작은 표본 과적합을 경계.
```

- [ ] **Step 2: Verify README references existing paths and commands**

Run from repo root:

```bash
rg -n "learn:eval|example-0000|dataset.jsonl|learn:trace" landing-page-nextjs/learning/README.md landing-page-nextjs/package.json
```

Expected: output includes `learn:eval` in both `README.md` and `package.json`, and includes `example-0000`, `dataset.jsonl`, and `learn:trace` in `README.md`.

- [ ] **Step 3: Commit**

```bash
git add learning/README.md
git commit -m "docs(learning): document label-first eval loop"
```

---

### Task 5: Full Verification

**Files:**
- Verify only; no source changes expected

**Interfaces:**
- Consumes: all changes from Tasks 1-4
- Produces: final evidence that the learning loop compiles, tests pass, and the CLI runs on the synthetic capture

- [ ] **Step 1: Run focused learning tests**

Run from `landing-page-nextjs/`:

```bash
npx vitest run learning/lib/eval-core.test.ts learning/lib/capture.test.ts
```

Expected: PASS for both test files.

- [ ] **Step 2: Run full test suite**

Run from `landing-page-nextjs/`:

```bash
npm test
```

Expected: PASS. If unrelated existing tests fail, capture the failing test names and error messages before deciding whether they are in scope.

- [ ] **Step 3: Run eval CLI against the synthetic capture**

Run from `landing-page-nextjs/`:

```bash
node -e 'const fs=require("node:fs"); const c=require("./learning/captures/example-0000.json"); fs.writeFileSync("/tmp/signalmate-example-dataset.jsonl", JSON.stringify(c)+"\n");'
npm run learn:eval -- /tmp/signalmate-example-dataset.jsonl
```

Expected: exits 0 and prints a table with these columns:

```text
captureId | 내 라벨 | 시스템 | 거리 | 일치
```

Expected: output also prints:

```text
일치율:
거리 요약:
```

- [ ] **Step 4: Check git only tracks safe files**

Run from repo root:

```bash
git status --short
git check-ignore -v landing-page-nextjs/learning/captures/0001.json landing-page-nextjs/learning/traces/0001.trace.md landing-page-nextjs/learning/experiments/dataset.jsonl
```

Expected: `git status --short` shows only intended tracked source/docs changes if anything remains uncommitted. `git check-ignore -v` shows ignore rules for real capture JSON, trace markdown, and dataset JSONL.

- [ ] **Step 5: Confirm implementation commits are complete**

Run from repo root:

```bash
git log --oneline -4
git status --short
```

Expected: the four task commits appear at the top of `git log --oneline -4`. `git status --short` shows no uncommitted changes from this implementation plan; pre-existing unrelated files may still appear if they were already present before execution.
