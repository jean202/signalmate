# Deep Analysis v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 사용자가 ₩3,900 결제(또는 구독) 후 유사 사례 비교 + 행동 시나리오 시뮬레이션 + 초안 메시지 검증(5회)을 담은 심화 리포트를 받는다.

**Architecture:** 결제 검증 후 단일 리포트 체인이 시드 코퍼스(ReferenceCase) RAG 검색과 구조화 LLM 호출 1회로 리포트를 만들고 DeepReport로 저장한다. 초안 검증은 별도 경량 체인. 기존 하이브리드 파이프라인의 anthropic-client 헬퍼·tool_use 구조화 출력·fallback·SSE 패턴을 그대로 재사용한다.

**Tech Stack:** Next.js 15 App Router, Prisma + pgvector, Anthropic SDK(tool_use), OpenAI 임베딩, Vitest, Toss Payments(기존).

**Spec:** `docs/superpowers/specs/2026-07-08-deep-analysis-v1-design.md`

## Global Constraints

- 사용자-facing copy는 한국어.
- 무료 결과(신호 카드·추천)는 절대 축소하지 않는다.
- 심화 기능은 DB 필수: `USE_DB=false`면 503을 반환한다(JSON 스토어 미지원).
- LLM 호출은 기존 fallback·견고한 JSON 파싱 흐름 유지. draft-check 실패 시 횟수 차감 없음.
- 테스트는 DB·외부 API 없이 mock으로 돌아가야 한다 (`npx vitest run`).
- 테스트/타입체크 전 `export PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH"` (vitest는 node 22 필요).
- 모든 명령은 `landing-page-nextjs/`에서 실행 (별도 표기 없으면).

## File Structure

- Modify: `prisma/schema.prisma` — `DeepReport`, `ReferenceCase` 모델 + User/Analysis 백레퍼런스.
- Create: `lib/deep-report.ts` — 리포트 콘텐츠 타입, 상수(`DRAFT_CHECK_LIMIT`), fallback 빌더.
- Create: `lib/__tests__/deep-report.test.ts`
- Create: `lib/ai/embeddings/reference-search.ts` — ReferenceCase pgvector 검색.
- Create: `lib/ai/embeddings/__tests__/reference-search.test.ts`
- Create: `lib/ai/schemas/deep-report-schema.ts` — `submitDeepReportTool`, `submitDraftCheckTool`.
- Create: `lib/ai/prompts/deep-report-prompt.ts` — 시스템/유저 프롬프트 빌더.
- Create: `lib/ai/chains/deep-report-generator.ts`
- Create: `lib/ai/chains/__tests__/deep-report-generator.test.ts`
- Create: `lib/ai/chains/draft-checker.ts`
- Create: `lib/ai/chains/__tests__/draft-checker.test.ts`
- Create: `lib/deep-report-store.ts` — DeepReport CRUD, 결제 검증(`hasDeepAccess`), 분석 소유권 claim.
- Create: `lib/__tests__/deep-report-store.test.ts`
- Modify: `lib/store.ts` — `isDbEnabled()` export 추가.
- Create: `app/api/v1/analyses/[analysisId]/deep-report/route.ts` — POST(SSE 생성)/GET(재열람).
- Create: `app/api/v1/analyses/[analysisId]/deep-report/__tests__/route.test.ts`
- Create: `app/api/v1/analyses/[analysisId]/deep-report/draft-check/route.ts`
- Create: `app/api/v1/analyses/[analysisId]/deep-report/draft-check/__tests__/route.test.ts`
- Modify: `app/api/v1/payments/checkout/route.ts` — 결제 전 분석 claim(소유권·saved 승격).
- Modify: `lib/db-store.ts` — `claimAnalysisForUser()` 추가.
- Modify: `components/payment-button.tsx` — successUrl에 analysisId 전달, 401 시 /login 유도.
- Modify: `app/payment/success/page.tsx` — analysisId 있으면 `/report/{analysisId}`로 이동.
- Modify: `components/analysis-experience.tsx` — 결제 영역을 심화 프리뷰 카드로 교체.
- Modify: `components/analysis-experience.module.css` — 프리뷰 카드 스타일.
- Create: `app/report/[analysisId]/page.tsx` + `report.module.css` — 리포트 뷰 + 초안 검증.
- Create: `learning/scripts/seed-gen.ts`, `learning/scripts/seed-embed.ts`, `learning/lib/seed-schema.ts`
- Create: `learning/lib/__tests__/seed-schema.test.ts`
- Modify: `package.json` — `learn:seed-gen`, `learn:seed-embed` 스크립트.
- Modify: `README.md` — 심화 분석 사용법.

Shared interfaces produced by Task 2 and consumed by later tasks:

```ts
// lib/deep-report.ts
export type DeepReportScenario = {
  actionLabel: string;      // 예: "가볍게 안부를 보낸다"
  expectedFlow: string;     // 예상 전개 2~3문장
  risk: string;             // 주요 리스크 1~2문장
  bestMessage: string;      // 이 경로를 택할 때 권장 메시지
  timing: string;           // 예: "지금 바로" | "1~2일 뒤"
  confidence: "low" | "medium" | "high";
};

export type DeepReportSimilarCase = {
  situationType: string;
  flowSummary: string;
  outcome: "progressed" | "stalled" | "ended";
  lesson: string;
};

export type DeepReportContent = {
  similarCases: {
    patternSummary: string;
    cases: DeepReportSimilarCase[];
  } | null;                 // 검색 결과 0건이면 null
  scenarios: DeepReportScenario[]; // 2~3개
};

export type DraftCheckResult = {
  predictedReaction: string;
  riskLevel: "low" | "medium" | "high";
  risks: string[];
  improvedDraft: string;
  rationale: string;
};

export const DRAFT_CHECK_LIMIT = 5;

// lib/ai/embeddings/reference-search.ts
export type ReferenceCaseHit = {
  id: string;
  summaryText: string;
  situationType: string;
  outcomeLabel: "progressed" | "stalled" | "ended";
  lesson: string;
  similarity: number;
};
export function findSimilarReferenceCases(queryText: string, limit?: number): Promise<ReferenceCaseHit[]>;

// lib/deep-report-store.ts
export type StoredDeepReport = {
  id: string;
  analysisId: string;
  userId: string;
  status: "generating" | "completed" | "failed";
  content: DeepReportContent | null;
  draftCheckCount: number;
  createdAt: string;
  completedAt: string | null;
};
export function getDeepReportByAnalysisId(analysisId: string): Promise<StoredDeepReport | null>;
export function upsertGeneratingDeepReport(analysisId: string, userId: string): Promise<StoredDeepReport>;
export function completeDeepReport(analysisId: string, content: DeepReportContent): Promise<void>;
export function failDeepReport(analysisId: string): Promise<void>;
export function incrementDraftCheckCount(analysisId: string): Promise<number>; // 증가 후 값 반환
export function hasDeepAccess(userId: string, analysisId: string): Promise<boolean>;
```

---

### Task 1: Prisma 스키마 — DeepReport / ReferenceCase

**Files:**
- Modify: `prisma/schema.prisma`

- [x] **Step 1: User/Analysis에 백레퍼런스 추가**

`model User` 안의 `payments       Payment[]` 줄 아래에 추가:

```prisma
  deepReports    DeepReport[]
```

`model Analysis` 안의 `payments                Payment[]` 줄 아래에 추가:

```prisma
  deepReport              DeepReport?
```

- [x] **Step 2: 새 모델 2개 추가**

`model Payment { ... }` 블록 뒤에 추가:

```prisma
// ─── Deep Analysis (유료 심화 리포트) ─────────────────────

model DeepReport {
  id              String    @id @default(uuid()) @db.Uuid
  analysisId      String    @unique @map("analysis_id") @db.Uuid
  userId          String    @map("user_id") @db.Uuid
  status          String    @default("generating") @db.Text
  contentJson     Json?     @map("content_json")
  draftCheckCount Int       @default(0) @map("draft_check_count")
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  completedAt     DateTime? @map("completed_at") @db.Timestamptz(6)
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  analysis        Analysis  @relation(fields: [analysisId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@map("deep_reports")
}

model ReferenceCase {
  id            String   @id @default(uuid()) @db.Uuid
  summaryText   String   @map("summary_text") @db.Text
  situationType String   @map("situation_type") @db.Text
  outcomeLabel  String   @map("outcome_label") @db.Text
  lesson        String   @db.Text
  embedding     Unsupported("vector(1536)")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@map("reference_cases")
}
```

- [x] **Step 3: 스키마 검증 + 마이그레이션**

```bash
npx prisma validate
docker compose -f ../docker-compose.yml up -d   # DB가 안 떠 있으면
npx prisma migrate dev --name add_deep_report_and_reference_cases
```

Expected: `prisma validate` 성공, 마이그레이션 폴더 생성. DB를 띄울 수 없는 환경이면 `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-schema-datasource prisma/schema.prisma` 대신 `npx prisma format && npx prisma validate`까지만 확인하고 마이그레이션 생성은 `--create-only`로 남긴다.

- [x] **Step 4: Commit**

```bash
git add prisma
git commit -m "feat: add deep report and reference case models"
```

---

### Task 2: 리포트 타입 + fallback 빌더 (`lib/deep-report.ts`)

**Files:**
- Create: `lib/deep-report.ts`
- Create: `lib/__tests__/deep-report.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

`lib/__tests__/deep-report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildFallbackDeepReport, DRAFT_CHECK_LIMIT } from "../deep-report";
import type { ReferenceCaseHit } from "../ai/embeddings/reference-search";

const hits: ReferenceCaseHit[] = [
  {
    id: "ref-1",
    summaryText: "소개팅 후 상대 답장이 느려졌지만 일주일 뒤 자연스럽게 재개된 사례",
    situationType: "after_first_date",
    outcomeLabel: "progressed",
    lesson: "답장 속도보다 내용의 온도를 보는 편이 정확했다",
    similarity: 0.83,
  },
];

describe("buildFallbackDeepReport", () => {
  it("builds a partial report from reference hits and recommended action", () => {
    const report = buildFallbackDeepReport({
      recommendedAction: "slow_down",
      recommendedActionReason: "만남 뒤 연락 온도가 약해 보입니다.",
      referenceCases: hits,
    });

    expect(report.similarCases?.cases).toHaveLength(1);
    expect(report.similarCases?.cases[0].outcome).toBe("progressed");
    expect(report.scenarios).toHaveLength(1);
    expect(report.scenarios[0].confidence).toBe("low");
    expect(report.scenarios[0].expectedFlow).toContain("만남 뒤 연락 온도가 약해 보입니다.");
  });

  it("returns null similarCases when there are no reference hits", () => {
    const report = buildFallbackDeepReport({
      recommendedAction: "keep_light",
      recommendedActionReason: "흐름이 나쁘지 않습니다.",
      referenceCases: [],
    });

    expect(report.similarCases).toBeNull();
    expect(report.scenarios).toHaveLength(1);
  });

  it("exports the draft check limit", () => {
    expect(DRAFT_CHECK_LIMIT).toBe(5);
  });
});
```

- [x] **Step 2: 실패 확인**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH"
npx vitest run lib/__tests__/deep-report.test.ts
```

Expected: FAIL — `../deep-report` 없음.

- [x] **Step 3: `lib/deep-report.ts` 작성**

```ts
import type { ReferenceCaseHit } from "@/lib/ai/embeddings/reference-search";

export type DeepReportScenario = {
  actionLabel: string;
  expectedFlow: string;
  risk: string;
  bestMessage: string;
  timing: string;
  confidence: "low" | "medium" | "high";
};

export type DeepReportSimilarCase = {
  situationType: string;
  flowSummary: string;
  outcome: "progressed" | "stalled" | "ended";
  lesson: string;
};

export type DeepReportContent = {
  similarCases: {
    patternSummary: string;
    cases: DeepReportSimilarCase[];
  } | null;
  scenarios: DeepReportScenario[];
};

export type DraftCheckResult = {
  predictedReaction: string;
  riskLevel: "low" | "medium" | "high";
  risks: string[];
  improvedDraft: string;
  rationale: string;
};

export const DRAFT_CHECK_LIMIT = 5;

const ACTION_LABELS: Record<string, string> = {
  keep_light: "부담 없는 톤으로 연결을 유지한다",
  suggest_date: "가볍게 다음 만남을 제안한다",
  slow_down: "한 템포 낮추고 반응을 지켜본다",
  wait_for_response: "추가 메시지 없이 반응을 기다린다",
  consider_stopping: "투자를 줄이고 거리를 조절한다",
};

function toOutcome(label: string): DeepReportSimilarCase["outcome"] {
  return label === "progressed" || label === "stalled" || label === "ended"
    ? label
    : "stalled";
}

/**
 * LLM 실패 시 부분 리포트. 유사 사례는 검색 원자료를 그대로 요약하고,
 * 시나리오는 규칙 기반 추천 행동 1개를 골격으로 만든다.
 */
export function buildFallbackDeepReport(params: {
  recommendedAction: string;
  recommendedActionReason: string;
  referenceCases: ReferenceCaseHit[];
}): DeepReportContent {
  const cases = params.referenceCases.slice(0, 3).map((hit) => ({
    situationType: hit.situationType,
    flowSummary: hit.summaryText,
    outcome: toOutcome(hit.outcomeLabel),
    lesson: hit.lesson,
  }));

  return {
    similarCases:
      cases.length > 0
        ? {
            patternSummary:
              "비슷한 상황의 기록을 찾았어요. 아래 사례 흐름을 참고하되, 세부 상황은 다를 수 있어요.",
            cases,
          }
        : null,
    scenarios: [
      {
        actionLabel: ACTION_LABELS[params.recommendedAction] ?? "현재 흐름을 유지한다",
        expectedFlow: `기본 분석 기준으로는 이 경로가 안전해 보여요. ${params.recommendedActionReason}`,
        risk: "지금은 상세 시뮬레이션을 만들지 못했어요. 아래 초안 검증으로 개별 메시지를 점검해 보세요.",
        bestMessage: "",
        timing: "상황에 맞게",
        confidence: "low",
      },
    ],
  };
}
```

- [x] **Step 4: 테스트 통과 확인**

```bash
npx vitest run lib/__tests__/deep-report.test.ts
```

Expected: PASS. (reference-search가 아직 없어 타입 import가 실패하면 Task 3을 먼저 진행하지 말고, 이 시점에는 `lib/ai/embeddings/reference-search.ts`에 타입만 미리 만든다 — Task 3 Step 3의 파일에서 타입 부분만 먼저 작성해도 된다.)

- [x] **Step 5: Commit**

```bash
git add lib/deep-report.ts lib/__tests__/deep-report.test.ts
git commit -m "feat: add deep report types and fallback builder"
```

---

### Task 3: ReferenceCase 검색 (`reference-search.ts`)

**Files:**
- Create: `lib/ai/embeddings/reference-search.ts`
- Create: `lib/ai/embeddings/__tests__/reference-search.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

`lib/ai/embeddings/__tests__/reference-search.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const embeddingsCreateMock = vi.fn();
const queryRawMock = vi.fn();

vi.mock("@/lib/ai/embeddings/openai-client", () => ({
  isOpenAIAvailable: () => true,
  getOpenAIClient: () => ({ embeddings: { create: embeddingsCreateMock } }),
  EMBEDDING_MODEL: "text-embedding-3-small",
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRawUnsafe: queryRawMock },
}));

import { findSimilarReferenceCases } from "../reference-search";

describe("findSimilarReferenceCases", () => {
  beforeEach(() => {
    embeddingsCreateMock.mockReset();
    queryRawMock.mockReset();
    embeddingsCreateMock.mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] });
  });

  it("maps rows into reference case hits", async () => {
    queryRawMock.mockResolvedValue([
      {
        id: "ref-1",
        summary_text: "소개팅 후 답장이 느려진 사례",
        situation_type: "after_first_date",
        outcome_label: "progressed",
        lesson: "온도를 보는 편이 정확했다",
        similarity: 0.8342,
      },
    ]);

    const hits = await findSimilarReferenceCases("요약 텍스트", 3);

    expect(hits).toEqual([
      {
        id: "ref-1",
        summaryText: "소개팅 후 답장이 느려진 사례",
        situationType: "after_first_date",
        outcomeLabel: "progressed",
        lesson: "온도를 보는 편이 정확했다",
        similarity: 0.834,
      },
    ]);
    expect(queryRawMock).toHaveBeenCalledWith(
      expect.stringContaining("FROM reference_cases"),
      "[0.1,0.2]",
      3,
    );
  });

  it("returns empty array when the query fails", async () => {
    queryRawMock.mockRejectedValue(new Error("db down"));

    await expect(findSimilarReferenceCases("텍스트")).resolves.toEqual([]);
  });
});
```

- [x] **Step 2: 실패 확인**

```bash
npx vitest run lib/ai/embeddings/__tests__/reference-search.test.ts
```

Expected: FAIL — 모듈 없음(또는 Task 2에서 타입만 만든 경우 함수 없음).

- [x] **Step 3: `lib/ai/embeddings/reference-search.ts` 작성**

기존 `similarity-search.ts`와 같은 패턴:

```ts
import {
  getOpenAIClient,
  isOpenAIAvailable,
  EMBEDDING_MODEL,
} from "@/lib/ai/embeddings/openai-client";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger("ai.reference_search");

export type ReferenceCaseHit = {
  id: string;
  summaryText: string;
  situationType: string;
  outcomeLabel: "progressed" | "stalled" | "ended";
  lesson: string;
  similarity: number;
};

function toOutcomeLabel(value: string | null): ReferenceCaseHit["outcomeLabel"] {
  return value === "progressed" || value === "stalled" || value === "ended"
    ? value
    : "stalled";
}

/**
 * 시드 코퍼스(reference_cases)에서 현재 상황과 유사한 사례를 검색합니다.
 * 실패·미설정 시 빈 배열(유사 사례 섹션 생략 폴백).
 */
export async function findSimilarReferenceCases(
  queryText: string,
  limit = 5,
): Promise<ReferenceCaseHit[]> {
  if (!isOpenAIAvailable()) {
    return [];
  }

  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: queryText,
    });

    const vectorStr = `[${response.data[0].embedding.join(",")}]`;

    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        summary_text: string;
        situation_type: string;
        outcome_label: string | null;
        lesson: string;
        similarity: number;
      }[]
    >(
      `SELECT
         id,
         summary_text,
         situation_type,
         outcome_label,
         lesson,
         1 - (embedding <=> $1::vector) AS similarity
       FROM reference_cases
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      vectorStr,
      limit,
    );

    return rows.map((row) => ({
      id: row.id,
      summaryText: row.summary_text,
      situationType: row.situation_type,
      outcomeLabel: toOutcomeLabel(row.outcome_label),
      lesson: row.lesson,
      similarity: Math.round(Number(row.similarity) * 1000) / 1000,
    }));
  } catch (error) {
    logger.error("failed", { limit, error });
    return [];
  }
}
```

- [x] **Step 4: 테스트 통과 확인 + Commit**

```bash
npx vitest run lib/ai/embeddings/__tests__/reference-search.test.ts lib/__tests__/deep-report.test.ts
git add lib/ai/embeddings/reference-search.ts lib/ai/embeddings/__tests__/reference-search.test.ts
git commit -m "feat: add reference case similarity search"
```

---

### Task 4: 도구 스키마 + 프롬프트

**Files:**
- Create: `lib/ai/schemas/deep-report-schema.ts`
- Create: `lib/ai/prompts/deep-report-prompt.ts`

테스트는 Task 5·6의 체인 테스트가 커버하므로 이 태스크는 구현만 한다.

- [x] **Step 1: `lib/ai/schemas/deep-report-schema.ts` 작성**

기존 `analysis-schema.ts`의 `Tool` 패턴을 따른다:

```ts
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
```

- [x] **Step 2: `lib/ai/prompts/deep-report-prompt.ts` 작성**

```ts
import type { ReferenceCaseHit } from "@/lib/ai/embeddings/reference-search";

export const DEEP_REPORT_SYSTEM_PROMPT = `당신은 소개팅·썸 초기 관계 코치입니다. 사용자의 상황 분석 결과와 유사 사례를 바탕으로 심화 리포트를 만듭니다.

원칙:
- 상대 마음을 단정하지 않습니다. 관찰된 신호와 사례 패턴만 근거로 씁니다.
- 시나리오는 서로 실제로 다른 행동 경로여야 합니다 (같은 행동의 톤 차이 금지).
- 사용자를 압박하거나 상대를 조종하는 전략은 제안하지 않습니다.
- 유사 사례는 제공된 목록만 사용하고, 개인을 특정할 수 있는 표현 없이 각색합니다.
- 모든 출력은 한국어입니다.`;

export const DRAFT_CHECK_SYSTEM_PROMPT = `당신은 소개팅·썸 초기 관계 코치입니다. 사용자가 보내려는 메시지 초안을 상황 분석 결과에 비추어 점검합니다.

원칙:
- 상대 반응을 단정하지 말고 "~할 가능성" 수준으로 서술합니다.
- 개선안은 원문 의도와 말투를 유지하면서 리스크만 줄입니다.
- 압박·추궁·확인 요구형 문장은 리스크로 지적합니다.
- 모든 출력은 한국어입니다.`;

export function formatReferenceCases(referenceCases: ReferenceCaseHit[]): string {
  if (referenceCases.length === 0) {
    return "## 유사 사례\n(검색된 유사 사례 없음 — cases는 빈 배열로 제출)";
  }

  const lines = referenceCases.map(
    (hit, index) =>
      `${index + 1}. [${hit.situationType} / ${hit.outcomeLabel}] ${hit.summaryText} (교훈: ${hit.lesson})`,
  );
  return `## 유사 사례 (이 목록만 사용)\n${lines.join("\n")}`;
}

export function buildDeepReportUserPrompt(params: {
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext: string | null;
  overallSummary: string;
  recommendedAction: string;
  recommendedActionReason: string;
  signalLines: string[]; // "positive/reply_continuity: 제목 — 근거" 형식
  referenceCases: ReferenceCaseHit[];
}): string {
  return `## 상황 정보
관계 단계: ${params.relationshipStage} / 만난 경로: ${params.meetingChannel} / 사용자 목표: ${params.userGoal}
상황 맥락: ${params.situationContext ?? "(없음)"}

## 기본 분석 결과
요약: ${params.overallSummary}
추천 행동: ${params.recommendedAction} — ${params.recommendedActionReason}

## 신호 목록
${params.signalLines.join("\n")}

${formatReferenceCases(params.referenceCases)}

위 정보를 바탕으로 submit_deep_report 도구로 심화 리포트를 제출하세요.
- 시나리오는 추천 행동을 포함해 서로 다른 행동 경로 2~3개.
- 각 시나리오의 expectedFlow는 신호와 사례 패턴을 근거로 작성.`;
}

export function buildDraftCheckUserPrompt(params: {
  draftText: string;
  overallSummary: string;
  recommendedAction: string;
  situationContext: string | null;
}): string {
  return `## 상황 요약
${params.overallSummary}
추천 행동: ${params.recommendedAction}
상황 맥락: ${params.situationContext ?? "(없음)"}

## 사용자가 보내려는 초안
"""
${params.draftText}
"""

submit_draft_check 도구로 검증 결과를 제출하세요.`;
}
```

- [x] **Step 3: 타입체크 + Commit**

```bash
npx tsc --noEmit
git add lib/ai/schemas/deep-report-schema.ts lib/ai/prompts/deep-report-prompt.ts
git commit -m "feat: add deep report tool schemas and prompts"
```

---

### Task 5: deep-report-generator 체인

**Files:**
- Create: `lib/ai/chains/deep-report-generator.ts`
- Create: `lib/ai/chains/__tests__/deep-report-generator.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

`lib/ai/chains/__tests__/deep-report-generator.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreateMock = vi.fn();

vi.mock("@/lib/ai/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic-client")>();
  return {
    ...actual,
    getAnthropicClient: () => ({ messages: { create: messagesCreateMock } }),
    getModelName: () => "claude-test",
    getInferenceTimeoutMs: () => 5_000,
  };
});

vi.mock("@/lib/ai/token-tracker", () => ({ trackUsage: vi.fn() }));

import { generateDeepReport } from "../deep-report-generator";

function toolResponse(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "submit_deep_report", input }],
    stop_reason: "tool_use",
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

const baseParams = {
  relationshipStage: "after_first_date",
  meetingChannel: "blind_date",
  userGoal: "continue_chat",
  situationContext: "만남 뒤 답장이 짧아졌습니다.",
  overallSummary: "신호가 엇갈리는 상태입니다.",
  recommendedAction: "slow_down",
  recommendedActionReason: "연락 온도가 약합니다.",
  signalLines: ["caution/post_meeting_followup_caution: 연락 온도 주의 — 답장이 짧아짐"],
  referenceCases: [],
};

describe("generateDeepReport", () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
  });

  it("returns validated report content from the tool response", async () => {
    messagesCreateMock.mockResolvedValue(
      toolResponse({
        patternSummary: "",
        cases: [],
        scenarios: [
          {
            actionLabel: "한 템포 쉬기",
            expectedFlow: "무리하지 않으면 부담이 줄어듭니다.",
            risk: "흐름이 자연 소멸할 수 있습니다.",
            bestMessage: "요즘 바쁘죠? 편할 때 얘기해요.",
            timing: "2~3일 뒤",
            confidence: "medium",
          },
          {
            actionLabel: "가볍게 안부 보내기",
            expectedFlow: "짧은 안부는 반응 온도를 확인하게 해줍니다.",
            risk: "짧은 답장만 돌아올 수 있습니다.",
            bestMessage: "오늘 날씨 좋던데 잘 지내요?",
            timing: "지금 바로",
            confidence: "medium",
          },
        ],
      }),
    );

    const report = await generateDeepReport(baseParams);

    expect(report.similarCases).toBeNull();
    expect(report.scenarios).toHaveLength(2);
    expect(report.scenarios[0].actionLabel).toBe("한 템포 쉬기");
  });

  it("throws when scenarios are missing so the caller can fall back", async () => {
    messagesCreateMock.mockResolvedValue(
      toolResponse({ patternSummary: "", cases: [], scenarios: [] }),
    );

    await expect(generateDeepReport(baseParams)).rejects.toThrow();
  });
});
```

- [x] **Step 2: 실패 확인**

```bash
npx vitest run lib/ai/chains/__tests__/deep-report-generator.test.ts
```

Expected: FAIL — 모듈 없음.

- [x] **Step 3: `lib/ai/chains/deep-report-generator.ts` 작성**

`signal-enhancer.ts`와 같은 호출 구조(single call + tool_choice 강제):

```ts
import {
  NonRetryableLLMResponseError,
  buildInferenceOptions,
  callWithRetry,
  extractToolInput,
  getAnthropicClient,
  getInferenceTimeoutMs,
  getModelName,
  resolveMaxTokens,
} from "@/lib/ai/anthropic-client";
import {
  DEEP_REPORT_SYSTEM_PROMPT,
  buildDeepReportUserPrompt,
} from "@/lib/ai/prompts/deep-report-prompt";
import { submitDeepReportTool } from "@/lib/ai/schemas/deep-report-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import { createLogger } from "@/lib/logger";
import type { ReferenceCaseHit } from "@/lib/ai/embeddings/reference-search";
import type { DeepReportContent, DeepReportScenario, DeepReportSimilarCase } from "@/lib/deep-report";

const logger = createLogger("ai.deep_report_generator");

type RawDeepReport = {
  patternSummary?: unknown;
  cases?: unknown;
  scenarios?: unknown;
};

const OUTCOMES = new Set(["progressed", "stalled", "ended"]);
const CONFIDENCES = new Set(["low", "medium", "high"]);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateReport(input: RawDeepReport): DeepReportContent {
  const rawScenarios = Array.isArray(input.scenarios) ? input.scenarios : [];
  const scenarios: DeepReportScenario[] = rawScenarios
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        actionLabel: asString(item.actionLabel),
        expectedFlow: asString(item.expectedFlow),
        risk: asString(item.risk),
        bestMessage: asString(item.bestMessage),
        timing: asString(item.timing),
        confidence: CONFIDENCES.has(item.confidence as string)
          ? (item.confidence as DeepReportScenario["confidence"])
          : "low",
      };
    })
    .filter((scenario) => scenario.actionLabel && scenario.expectedFlow)
    .slice(0, 3);

  if (scenarios.length < 1) {
    throw new NonRetryableLLMResponseError("deep report has no usable scenarios");
  }

  const rawCases = Array.isArray(input.cases) ? input.cases : [];
  const cases: DeepReportSimilarCase[] = rawCases
    .map((raw) => {
      const item = raw as Record<string, unknown>;
      return {
        situationType: asString(item.situationType),
        flowSummary: asString(item.flowSummary),
        outcome: OUTCOMES.has(item.outcome as string)
          ? (item.outcome as DeepReportSimilarCase["outcome"])
          : "stalled",
        lesson: asString(item.lesson),
      };
    })
    .filter((item) => item.flowSummary)
    .slice(0, 3);

  const patternSummary = asString(input.patternSummary);

  return {
    similarCases:
      cases.length > 0 && patternSummary
        ? { patternSummary, cases }
        : null,
    scenarios,
  };
}

export async function generateDeepReport(params: {
  analysisId?: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  situationContext: string | null;
  overallSummary: string;
  recommendedAction: string;
  recommendedActionReason: string;
  signalLines: string[];
  referenceCases: ReferenceCaseHit[];
}): Promise<DeepReportContent> {
  const client = getAnthropicClient();
  const model = getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("deep_report");

  const userPrompt = buildDeepReportUserPrompt(params);

  const { response, result } = await callWithRetry(
    async (requestOptions) => {
      const response = await client.messages.create(
        {
          ...buildInferenceOptions(model, "deep_report"),
          model,
          max_tokens: resolveMaxTokens(3000, "deep_report", model),
          system: [{ type: "text", text: DEEP_REPORT_SYSTEM_PROMPT }],
          tools: [submitDeepReportTool],
          tool_choice: { type: "tool", name: "submit_deep_report" },
          messages: [{ role: "user", content: userPrompt }],
        },
        requestOptions,
      );

      const input = extractToolInput<RawDeepReport>(
        response,
        "submit_deep_report",
        "deep report generation",
      );
      return { response, result: validateReport(input) };
    },
    { label: "deep_report_generator", extraRetries: 1, timeoutMs },
  );

  trackUsage({
    analysisId: params.analysisId,
    stepName: "deep_report_generator",
    modelName: model,
    usage: response.usage,
    latencyMs: Date.now() - startTime,
  });

  logger.info("completed", {
    analysisId: params.analysisId,
    scenarioCount: result.scenarios.length,
    hasSimilarCases: result.similarCases !== null,
  });

  return result;
}
```

주의: `getInferenceTimeoutMs`·`buildInferenceOptions`·`resolveMaxTokens`·`trackUsage`의 실제 시그니처는 구현 시 `lib/ai/anthropic-client.ts`·`lib/ai/token-tracker.ts`에서 확인하고 기존 체인(signal-enhancer)의 호출 방식을 그대로 따른다. 단계 이름 파라미터가 union 타입이면 `"deep_report"`를 그 타입에 추가한다.

- [x] **Step 4: 테스트 통과 확인 + Commit**

```bash
npx vitest run lib/ai/chains/__tests__/deep-report-generator.test.ts
npx tsc --noEmit
git add lib/ai/chains/deep-report-generator.ts lib/ai/chains/__tests__/deep-report-generator.test.ts lib/ai/anthropic-client.ts lib/ai/token-tracker.ts
git commit -m "feat: add deep report generator chain"
```

---

### Task 6: draft-checker 체인

**Files:**
- Create: `lib/ai/chains/draft-checker.ts`
- Create: `lib/ai/chains/__tests__/draft-checker.test.ts`

- [x] **Step 1: 실패하는 테스트 작성**

`lib/ai/chains/__tests__/draft-checker.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreateMock = vi.fn();

vi.mock("@/lib/ai/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic-client")>();
  return {
    ...actual,
    getAnthropicClient: () => ({ messages: { create: messagesCreateMock } }),
    getModelName: () => "claude-test",
    getInferenceTimeoutMs: () => 5_000,
  };
});

vi.mock("@/lib/ai/token-tracker", () => ({ trackUsage: vi.fn() }));

import { checkDraft } from "../draft-checker";

describe("checkDraft", () => {
  beforeEach(() => {
    messagesCreateMock.mockReset();
  });

  it("returns validated draft check result", async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_draft_check",
          input: {
            predictedReaction: "짧은 답장이 돌아올 가능성이 있어요.",
            riskLevel: "medium",
            risks: ["확인 요구형 문장이 부담을 줄 수 있어요."],
            improvedDraft: "요즘 바쁘죠? 편할 때 얘기해요.",
            rationale: "부담을 줄이면서 대화 여지를 남깁니다.",
          },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    const result = await checkDraft({
      draftText: "왜 요즘 답장이 늦어요?",
      overallSummary: "신호가 엇갈리는 상태입니다.",
      recommendedAction: "slow_down",
      situationContext: null,
    });

    expect(result.riskLevel).toBe("medium");
    expect(result.improvedDraft).toContain("편할 때");
  });

  it("rejects invalid risk level payloads", async () => {
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_draft_check",
          input: { predictedReaction: "", riskLevel: "extreme", risks: [], improvedDraft: "", rationale: "" },
        },
      ],
      stop_reason: "tool_use",
      usage: { input_tokens: 5, output_tokens: 5 },
    });

    await expect(
      checkDraft({
        draftText: "안녕",
        overallSummary: "요약",
        recommendedAction: "keep_light",
        situationContext: null,
      }),
    ).rejects.toThrow();
  });
});
```

- [x] **Step 2: 실패 확인**

```bash
npx vitest run lib/ai/chains/__tests__/draft-checker.test.ts
```

Expected: FAIL — 모듈 없음.

- [x] **Step 3: `lib/ai/chains/draft-checker.ts` 작성**

```ts
import {
  NonRetryableLLMResponseError,
  buildInferenceOptions,
  callWithRetry,
  extractToolInput,
  getAnthropicClient,
  getInferenceTimeoutMs,
  getModelName,
  resolveMaxTokens,
} from "@/lib/ai/anthropic-client";
import {
  DRAFT_CHECK_SYSTEM_PROMPT,
  buildDraftCheckUserPrompt,
} from "@/lib/ai/prompts/deep-report-prompt";
import { submitDraftCheckTool } from "@/lib/ai/schemas/deep-report-schema";
import { trackUsage } from "@/lib/ai/token-tracker";
import { createLogger } from "@/lib/logger";
import type { DraftCheckResult } from "@/lib/deep-report";

const logger = createLogger("ai.draft_checker");

const RISK_LEVELS = new Set(["low", "medium", "high"]);

function validateDraftCheck(input: Record<string, unknown>): DraftCheckResult {
  const riskLevel = input.riskLevel as string;
  const predictedReaction =
    typeof input.predictedReaction === "string" ? input.predictedReaction.trim() : "";
  const improvedDraft =
    typeof input.improvedDraft === "string" ? input.improvedDraft.trim() : "";

  if (!RISK_LEVELS.has(riskLevel) || !predictedReaction || !improvedDraft) {
    throw new NonRetryableLLMResponseError("draft check payload is incomplete");
  }

  return {
    predictedReaction,
    riskLevel: riskLevel as DraftCheckResult["riskLevel"],
    risks: Array.isArray(input.risks)
      ? input.risks.filter((risk): risk is string => typeof risk === "string").slice(0, 3)
      : [],
    improvedDraft,
    rationale: typeof input.rationale === "string" ? input.rationale.trim() : "",
  };
}

export async function checkDraft(params: {
  analysisId?: string;
  draftText: string;
  overallSummary: string;
  recommendedAction: string;
  situationContext: string | null;
}): Promise<DraftCheckResult> {
  const client = getAnthropicClient();
  const model = getModelName();
  const startTime = Date.now();
  const timeoutMs = getInferenceTimeoutMs("draft_check");

  const { response, result } = await callWithRetry(
    async (requestOptions) => {
      const response = await client.messages.create(
        {
          ...buildInferenceOptions(model, "draft_check"),
          model,
          max_tokens: resolveMaxTokens(1200, "draft_check", model),
          system: [{ type: "text", text: DRAFT_CHECK_SYSTEM_PROMPT }],
          tools: [submitDraftCheckTool],
          tool_choice: { type: "tool", name: "submit_draft_check" },
          messages: [{ role: "user", content: buildDraftCheckUserPrompt(params) }],
        },
        requestOptions,
      );

      const input = extractToolInput<Record<string, unknown>>(
        response,
        "submit_draft_check",
        "draft check",
      );
      return { response, result: validateDraftCheck(input) };
    },
    { label: "draft_checker", extraRetries: 1, timeoutMs },
  );

  trackUsage({
    analysisId: params.analysisId,
    stepName: "draft_checker",
    modelName: model,
    usage: response.usage,
    latencyMs: Date.now() - startTime,
  });

  logger.info("completed", { analysisId: params.analysisId, riskLevel: result.riskLevel });
  return result;
}
```

Task 5와 같은 주의: 헬퍼 시그니처는 기존 체인 기준으로 맞추고, 단계 이름 union이 있으면 `"draft_check"`를 추가한다.

- [x] **Step 4: 테스트 통과 확인 + Commit**

```bash
npx vitest run lib/ai/chains/__tests__/draft-checker.test.ts
npx tsc --noEmit
git add lib/ai/chains/draft-checker.ts lib/ai/chains/__tests__/draft-checker.test.ts
git commit -m "feat: add draft checker chain"
```

---

### Task 7: deep-report-store (저장 + 결제 검증 + claim)

**Files:**
- Create: `lib/deep-report-store.ts`
- Create: `lib/__tests__/deep-report-store.test.ts`
- Modify: `lib/db-store.ts` — `claimAnalysisForUser()` 추가
- Modify: `lib/store.ts` — `isDbEnabled()` export 추가

- [ ] **Step 1: 실패하는 테스트 작성**

`lib/__tests__/deep-report-store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = {
  deepReport: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  payment: { findFirst: vi.fn() },
  subscription: { findFirst: vi.fn() },
};

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  getDeepReportByAnalysisId,
  hasDeepAccess,
  incrementDraftCheckCount,
} from "../deep-report-store";

describe("deep-report-store", () => {
  beforeEach(() => {
    Object.values(prismaMock.deepReport).forEach((fn) => fn.mockReset());
    prismaMock.payment.findFirst.mockReset();
    prismaMock.subscription.findFirst.mockReset();
  });

  it("maps prisma rows to stored deep reports", async () => {
    prismaMock.deepReport.findUnique.mockResolvedValue({
      id: "dr-1",
      analysisId: "an-1",
      userId: "user-1",
      status: "completed",
      contentJson: { similarCases: null, scenarios: [] },
      draftCheckCount: 2,
      createdAt: new Date("2026-07-08T00:00:00Z"),
      completedAt: new Date("2026-07-08T00:01:00Z"),
    });

    const report = await getDeepReportByAnalysisId("an-1");

    expect(report).toMatchObject({
      analysisId: "an-1",
      status: "completed",
      draftCheckCount: 2,
      content: { similarCases: null, scenarios: [] },
    });
  });

  it("grants access with a paid single payment for the analysis", async () => {
    prismaMock.payment.findFirst.mockResolvedValue({ id: "pay-1" });

    await expect(hasDeepAccess("user-1", "an-1")).resolves.toBe(true);
    expect(prismaMock.payment.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", analysisId: "an-1", paymentStatus: "paid" },
    });
  });

  it("grants access with an active subscription", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findFirst.mockResolvedValue({ id: "sub-1" });

    await expect(hasDeepAccess("user-1", "an-1")).resolves.toBe(true);
  });

  it("denies access without payment or subscription", async () => {
    prismaMock.payment.findFirst.mockResolvedValue(null);
    prismaMock.subscription.findFirst.mockResolvedValue(null);

    await expect(hasDeepAccess("user-1", "an-1")).resolves.toBe(false);
  });

  it("increments draft check count atomically and returns the new value", async () => {
    prismaMock.deepReport.update.mockResolvedValue({ draftCheckCount: 3 });

    await expect(incrementDraftCheckCount("an-1")).resolves.toBe(3);
    expect(prismaMock.deepReport.update).toHaveBeenCalledWith({
      where: { analysisId: "an-1" },
      data: { draftCheckCount: { increment: 1 } },
      select: { draftCheckCount: true },
    });
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run lib/__tests__/deep-report-store.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `lib/deep-report-store.ts` 작성**

```ts
import { prisma } from "@/lib/prisma";
import type { DeepReportContent } from "@/lib/deep-report";

export type StoredDeepReport = {
  id: string;
  analysisId: string;
  userId: string;
  status: "generating" | "completed" | "failed";
  content: DeepReportContent | null;
  draftCheckCount: number;
  createdAt: string;
  completedAt: string | null;
};

type DeepReportRow = {
  id: string;
  analysisId: string;
  userId: string;
  status: string;
  contentJson: unknown;
  draftCheckCount: number;
  createdAt: Date;
  completedAt: Date | null;
};

function toStored(row: DeepReportRow): StoredDeepReport {
  return {
    id: row.id,
    analysisId: row.analysisId,
    userId: row.userId,
    status:
      row.status === "completed" || row.status === "failed" ? row.status : "generating",
    content: (row.contentJson as DeepReportContent | null) ?? null,
    draftCheckCount: row.draftCheckCount,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

export async function getDeepReportByAnalysisId(
  analysisId: string,
): Promise<StoredDeepReport | null> {
  const row = await prisma.deepReport.findUnique({ where: { analysisId } });
  return row ? toStored(row as DeepReportRow) : null;
}

/** 생성 시작 상태로 만들거나(없으면), 실패했던 리포트를 다시 generating으로 되돌린다. */
export async function upsertGeneratingDeepReport(
  analysisId: string,
  userId: string,
): Promise<StoredDeepReport> {
  const row = await prisma.deepReport.upsert({
    where: { analysisId },
    create: { analysisId, userId, status: "generating" },
    update: { status: "generating", completedAt: null },
  });
  return toStored(row as DeepReportRow);
}

export async function completeDeepReport(
  analysisId: string,
  content: DeepReportContent,
): Promise<void> {
  await prisma.deepReport.update({
    where: { analysisId },
    data: {
      status: "completed",
      contentJson: content as object,
      completedAt: new Date(),
    },
  });
}

export async function failDeepReport(analysisId: string): Promise<void> {
  await prisma.deepReport.update({
    where: { analysisId },
    data: { status: "failed" },
  });
}

/** 증가 후 새 카운트를 반환. 호출 전에 한도 검사는 호출자가 한다. */
export async function incrementDraftCheckCount(analysisId: string): Promise<number> {
  const row = await prisma.deepReport.update({
    where: { analysisId },
    data: { draftCheckCount: { increment: 1 } },
    select: { draftCheckCount: true },
  });
  return row.draftCheckCount;
}

/** 단건 결제(해당 분석) 또는 활성 구독이 있으면 심화 접근 허용. */
export async function hasDeepAccess(userId: string, analysisId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { userId, analysisId, paymentStatus: "paid" },
  });
  if (payment) return true;

  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "active", currentPeriodEnd: { gt: new Date() } },
  });
  return subscription !== null;
}
```

- [ ] **Step 4: `lib/db-store.ts`에 claim 함수 추가**

`getUserPayments` 함수 뒤에 추가:

```ts
/**
 * 결제 전에 익명(temporary) 분석을 로그인 사용자 소유로 승격합니다.
 * - 분석 userId가 비어 있으면 현재 사용자로 claim + 대화 saveMode=saved
 * - 이미 본인 소유면 아무것도 안 함
 * - 타인 소유면 forbidden
 */
export async function claimAnalysisForUser(
  userId: string,
  analysisId: string,
): Promise<"claimed" | "owned" | "forbidden" | "not_found"> {
  const analysis = await prisma.analysis.findUnique({
    where: { id: analysisId },
    select: { id: true, userId: true, conversationId: true },
  });

  if (!analysis) return "not_found";
  if (analysis.userId === userId) return "owned";
  if (analysis.userId && analysis.userId !== userId) return "forbidden";

  await prisma.$transaction([
    prisma.analysis.update({ where: { id: analysisId }, data: { userId } }),
    prisma.conversation.update({
      where: { id: analysis.conversationId },
      data: { userId, saveMode: "saved" },
    }),
  ]);
  return "claimed";
}
```

- [ ] **Step 5: `lib/store.ts`에 `isDbEnabled` export 추가**

`function useDb(): boolean { ... }` 아래에 추가:

```ts
/** 심화 분석 등 DB 전용 기능에서 사용. */
export function isDbEnabled(): boolean {
  return useDb();
}
```

- [ ] **Step 6: 테스트 통과 확인 + Commit**

```bash
npx vitest run lib/__tests__/deep-report-store.test.ts
npx tsc --noEmit
git add lib/deep-report-store.ts lib/__tests__/deep-report-store.test.ts lib/db-store.ts lib/store.ts
git commit -m "feat: add deep report store and payment access checks"
```

---

### Task 8: 리포트 생성·조회 라우트 (SSE)

**Files:**
- Create: `app/api/v1/analyses/[analysisId]/deep-report/route.ts`
- Create: `app/api/v1/analyses/[analysisId]/deep-report/__tests__/route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`app/api/v1/analyses/[analysisId]/deep-report/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const getAnalysisMock = vi.fn();
const getConversationMock = vi.fn();
const hasDeepAccessMock = vi.fn();
const getReportMock = vi.fn();
const upsertGeneratingMock = vi.fn();
const completeMock = vi.fn();
const failMock = vi.fn();
const generateMock = vi.fn();
const findReferenceMock = vi.fn();

vi.mock("@/lib/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/store", () => ({
  isDbEnabled: () => true,
  getAnalysis: getAnalysisMock,
  getConversation: getConversationMock,
}));
vi.mock("@/lib/deep-report-store", () => ({
  hasDeepAccess: hasDeepAccessMock,
  getDeepReportByAnalysisId: getReportMock,
  upsertGeneratingDeepReport: upsertGeneratingMock,
  completeDeepReport: completeMock,
  failDeepReport: failMock,
}));
vi.mock("@/lib/ai/chains/deep-report-generator", () => ({
  generateDeepReport: generateMock,
}));
vi.mock("@/lib/ai/embeddings/reference-search", () => ({
  findSimilarReferenceCases: findReferenceMock,
}));

const sampleAnalysis = {
  id: "an-1",
  conversationId: "conv-1",
  overallSummary: "요약",
  recommendedAction: "slow_down",
  recommendedActionReason: "이유",
  signals: [
    {
      signalType: "caution",
      signalKey: "post_meeting_followup_caution",
      title: "연락 온도 주의",
      evidenceText: "답장이 짧아짐",
    },
  ],
};

const sampleConversation = {
  id: "conv-1",
  relationshipStage: "after_first_date",
  meetingChannel: "blind_date",
  userGoal: "continue_chat",
  situationContext: "만남 뒤 답장이 짧아졌습니다.",
  rawText: "",
  messages: [],
};

const sampleContent = {
  similarCases: null,
  scenarios: [
    {
      actionLabel: "한 템포 쉬기",
      expectedFlow: "전개",
      risk: "리스크",
      bestMessage: "메시지",
      timing: "지금",
      confidence: "medium",
    },
  ],
};

function makeContext(analysisId = "an-1") {
  return { params: Promise.resolve({ analysisId }) };
}

async function readSse(response: Response): Promise<string> {
  return await response.text();
}

describe("deep-report route", () => {
  beforeEach(() => {
    [
      requireAuthMock, getAnalysisMock, getConversationMock, hasDeepAccessMock,
      getReportMock, upsertGeneratingMock, completeMock, failMock,
      generateMock, findReferenceMock,
    ].forEach((fn) => fn.mockReset());

    requireAuthMock.mockResolvedValue({ userId: "user-1" });
    getAnalysisMock.mockResolvedValue(sampleAnalysis);
    getConversationMock.mockResolvedValue(sampleConversation);
    hasDeepAccessMock.mockResolvedValue(true);
    getReportMock.mockResolvedValue(null);
    upsertGeneratingMock.mockResolvedValue({ analysisId: "an-1", status: "generating", draftCheckCount: 0 });
    findReferenceMock.mockResolvedValue([]);
    generateMock.mockResolvedValue(sampleContent);
  });

  it("returns 401 when not authenticated", async () => {
    requireAuthMock.mockResolvedValue({
      error: Response.json({ success: false }, { status: 401 }),
    });
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    expect(response.status).toBe(401);
  });

  it("returns 402 without payment or subscription", async () => {
    hasDeepAccessMock.mockResolvedValue(false);
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    expect(response.status).toBe(402);
  });

  it("streams a complete event and stores the report", async () => {
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    expect(response.status).toBe(200);

    const body = await readSse(response);
    expect(body).toContain('"type":"complete"');
    expect(completeMock).toHaveBeenCalledWith("an-1", sampleContent);
  });

  it("returns the stored report without regenerating when completed", async () => {
    getReportMock.mockResolvedValue({
      analysisId: "an-1",
      userId: "user-1",
      status: "completed",
      content: sampleContent,
      draftCheckCount: 1,
    });
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    const body = await readSse(response);

    expect(body).toContain('"type":"complete"');
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("falls back and still completes when the LLM chain throws", async () => {
    generateMock.mockRejectedValue(new Error("llm down"));
    const { POST } = await import("../route");

    const response = await POST(new Request("http://t", { method: "POST" }), makeContext());
    const body = await readSse(response);

    expect(body).toContain('"type":"complete"');
    expect(body).toContain('"fallback":true');
    expect(completeMock).toHaveBeenCalled();
  });

  it("GET returns 404 when the report does not exist", async () => {
    getReportMock.mockResolvedValue(null);
    const { GET } = await import("../route");

    const response = await GET(new Request("http://t"), makeContext());
    expect(response.status).toBe(404);
  });

  it("GET returns 403 for another user's report", async () => {
    getReportMock.mockResolvedValue({
      analysisId: "an-1",
      userId: "someone-else",
      status: "completed",
      content: sampleContent,
      draftCheckCount: 0,
    });
    const { GET } = await import("../route");

    const response = await GET(new Request("http://t"), makeContext());
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run "app/api/v1/analyses/[analysisId]/deep-report/__tests__/route.test.ts"
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `app/api/v1/analyses/[analysisId]/deep-report/route.ts` 작성**

```ts
import { requireAuth } from "@/lib/auth-helpers";
import { errorResponse, successResponse } from "@/lib/api-response";
import { getAnalysis, getConversation, isDbEnabled } from "@/lib/store";
import {
  completeDeepReport,
  failDeepReport,
  getDeepReportByAnalysisId,
  hasDeepAccess,
  upsertGeneratingDeepReport,
} from "@/lib/deep-report-store";
import { generateDeepReport } from "@/lib/ai/chains/deep-report-generator";
import { findSimilarReferenceCases } from "@/lib/ai/embeddings/reference-search";
import { buildFallbackDeepReport } from "@/lib/deep-report";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logger = createLogger("api.deep_report");

type RouteContext = {
  params: Promise<{ analysisId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const userId = auth.userId;

  if (!isDbEnabled()) {
    return errorResponse(503, "DB_REQUIRED", "심화 분석은 DB 모드에서만 사용할 수 있어요.");
  }

  const { analysisId } = await context.params;
  const analysis = await getAnalysis(analysisId);
  if (!analysis) {
    return errorResponse(404, "NOT_FOUND", "분석을 찾을 수 없어요.");
  }

  if (!(await hasDeepAccess(userId, analysisId))) {
    return errorResponse(402, "PAYMENT_REQUIRED", "심화 분석 결제 후 이용할 수 있어요.");
  }

  const conversation = await getConversation(analysis.conversationId);
  if (!conversation) {
    return errorResponse(404, "NOT_FOUND", "대화를 찾을 수 없어요.");
  }

  // 멱등: 이미 완료된 리포트는 그대로 스트리밍 반환
  const existing = await getDeepReportByAnalysisId(analysisId);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        if (existing?.status === "completed" && existing.content) {
          emit({ type: "complete", content: existing.content, fallback: false, cached: true });
          controller.close();
          return;
        }

        await upsertGeneratingDeepReport(analysisId, userId);
        emit({ type: "started" });

        const queryText = [
          conversation.situationContext,
          analysis.overallSummary,
        ]
          .filter(Boolean)
          .join("\n");
        const referenceCases = await findSimilarReferenceCases(queryText, 5);
        emit({ type: "similar_cases_searched", count: referenceCases.length });

        const signalLines = analysis.signals.map(
          (signal) =>
            `${signal.signalType}/${signal.signalKey}: ${signal.title} — ${signal.evidenceText}`,
        );

        let content;
        let fallback = false;
        try {
          content = await generateDeepReport({
            analysisId,
            relationshipStage: conversation.relationshipStage,
            meetingChannel: conversation.meetingChannel,
            userGoal: conversation.userGoal,
            situationContext: conversation.situationContext ?? null,
            overallSummary: analysis.overallSummary,
            recommendedAction: analysis.recommendedAction,
            recommendedActionReason: analysis.recommendedActionReason,
            signalLines,
            referenceCases,
          });
        } catch (error) {
          logger.error("generator_failed_falling_back", { analysisId, error });
          fallback = true;
          content = buildFallbackDeepReport({
            recommendedAction: analysis.recommendedAction,
            recommendedActionReason: analysis.recommendedActionReason,
            referenceCases,
          });
        }

        await completeDeepReport(analysisId, content);
        emit({ type: "complete", content, fallback, cached: false });
      } catch (error) {
        logger.error("stream_failed", { analysisId, error });
        await failDeepReport(analysisId).catch(() => undefined);
        emit({ type: "error", message: "리포트 생성에 실패했어요. 다시 시도해 주세요." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!isDbEnabled()) {
    return errorResponse(503, "DB_REQUIRED", "심화 분석은 DB 모드에서만 사용할 수 있어요.");
  }

  const { analysisId } = await context.params;
  const report = await getDeepReportByAnalysisId(analysisId);

  if (!report) {
    return errorResponse(404, "NOT_FOUND", "심화 리포트가 아직 없어요.");
  }
  if (report.userId !== auth.userId) {
    return errorResponse(403, "FORBIDDEN", "본인 리포트만 볼 수 있어요.");
  }

  return successResponse({ report });
}
```

주의: `getAnalysis`/`getConversation`이 `lib/store.ts`에서 export되는지 확인하고, 없으면 store.ts의 기존 re-export 패턴에 맞춰 추가한다.

- [ ] **Step 4: 테스트 통과 확인 + Commit**

```bash
npx vitest run "app/api/v1/analyses/[analysisId]/deep-report/__tests__/route.test.ts"
npx tsc --noEmit
git add "app/api/v1/analyses/[analysisId]/deep-report/route.ts" "app/api/v1/analyses/[analysisId]/deep-report/__tests__/route.test.ts" lib/store.ts
git commit -m "feat: add deep report generate and view routes"
```

---

### Task 9: draft-check 라우트 (5회 제한)

**Files:**
- Create: `app/api/v1/analyses/[analysisId]/deep-report/draft-check/route.ts`
- Create: `app/api/v1/analyses/[analysisId]/deep-report/draft-check/__tests__/route.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`.../draft-check/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuthMock = vi.fn();
const getReportMock = vi.fn();
const incrementMock = vi.fn();
const checkDraftMock = vi.fn();
const getAnalysisMock = vi.fn();
const getConversationMock = vi.fn();

vi.mock("@/lib/auth-helpers", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/store", () => ({
  isDbEnabled: () => true,
  getAnalysis: getAnalysisMock,
  getConversation: getConversationMock,
}));
vi.mock("@/lib/deep-report-store", () => ({
  getDeepReportByAnalysisId: getReportMock,
  incrementDraftCheckCount: incrementMock,
}));
vi.mock("@/lib/ai/chains/draft-checker", () => ({ checkDraft: checkDraftMock }));

function makeContext() {
  return { params: Promise.resolve({ analysisId: "an-1" }) };
}

function request(body: unknown) {
  return new Request("http://t", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const completedReport = {
  analysisId: "an-1",
  userId: "user-1",
  status: "completed",
  content: { similarCases: null, scenarios: [] },
  draftCheckCount: 0,
};

const checkResult = {
  predictedReaction: "짧은 답장 가능성",
  riskLevel: "medium",
  risks: [],
  improvedDraft: "개선안",
  rationale: "근거",
};

describe("draft-check route", () => {
  beforeEach(() => {
    [requireAuthMock, getReportMock, incrementMock, checkDraftMock, getAnalysisMock, getConversationMock]
      .forEach((fn) => fn.mockReset());

    requireAuthMock.mockResolvedValue({ userId: "user-1" });
    getReportMock.mockResolvedValue(completedReport);
    getAnalysisMock.mockResolvedValue({
      id: "an-1",
      conversationId: "conv-1",
      overallSummary: "요약",
      recommendedAction: "slow_down",
    });
    getConversationMock.mockResolvedValue({ id: "conv-1", situationContext: null });
    checkDraftMock.mockResolvedValue(checkResult);
    incrementMock.mockResolvedValue(1);
  });

  it("returns the check result and remaining count", async () => {
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "왜 답장 안 해요?" }), makeContext());
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.data.result.riskLevel).toBe("medium");
    expect(payload.data.remaining).toBe(4);
    expect(incrementMock).toHaveBeenCalledTimes(1);
  });

  it("rejects empty drafts", async () => {
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "  " }), makeContext());
    expect(response.status).toBe(400);
    expect(checkDraftMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the limit is exhausted without calling the LLM", async () => {
    getReportMock.mockResolvedValue({ ...completedReport, draftCheckCount: 5 });
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "초안" }), makeContext());
    expect(response.status).toBe(429);
    expect(checkDraftMock).not.toHaveBeenCalled();
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it("does not consume a count when the LLM fails", async () => {
    checkDraftMock.mockRejectedValue(new Error("llm down"));
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "초안" }), makeContext());
    expect(response.status).toBe(502);
    expect(incrementMock).not.toHaveBeenCalled();
  });

  it("returns 403 for another user's report", async () => {
    getReportMock.mockResolvedValue({ ...completedReport, userId: "someone-else" });
    const { POST } = await import("../route");

    const response = await POST(request({ draftText: "초안" }), makeContext());
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run "app/api/v1/analyses/[analysisId]/deep-report/draft-check/__tests__/route.test.ts"
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `.../draft-check/route.ts` 작성**

```ts
import { requireAuth } from "@/lib/auth-helpers";
import { errorResponse, successResponse } from "@/lib/api-response";
import { getAnalysis, getConversation, isDbEnabled } from "@/lib/store";
import {
  getDeepReportByAnalysisId,
  incrementDraftCheckCount,
} from "@/lib/deep-report-store";
import { checkDraft } from "@/lib/ai/chains/draft-checker";
import { DRAFT_CHECK_LIMIT } from "@/lib/deep-report";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const logger = createLogger("api.draft_check");

type RouteContext = {
  params: Promise<{ analysisId: string }>;
};

const MAX_DRAFT_LENGTH = 500;

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  if (!isDbEnabled()) {
    return errorResponse(503, "DB_REQUIRED", "심화 분석은 DB 모드에서만 사용할 수 있어요.");
  }

  const { analysisId } = await context.params;

  let body: { draftText?: string };
  try {
    body = (await request.json()) as { draftText?: string };
  } catch {
    return errorResponse(400, "INVALID_JSON", "요청 본문이 올바른 JSON이 아닙니다.");
  }

  const draftText = body.draftText?.trim() ?? "";
  if (!draftText) {
    return errorResponse(400, "VALIDATION_ERROR", "검증할 초안을 입력해 주세요.");
  }
  if (draftText.length > MAX_DRAFT_LENGTH) {
    return errorResponse(400, "VALIDATION_ERROR", `초안은 ${MAX_DRAFT_LENGTH}자 이하로 입력해 주세요.`);
  }

  const report = await getDeepReportByAnalysisId(analysisId);
  if (!report || report.status !== "completed") {
    return errorResponse(404, "NOT_FOUND", "완료된 심화 리포트가 있어야 초안 검증을 쓸 수 있어요.");
  }
  if (report.userId !== auth.userId) {
    return errorResponse(403, "FORBIDDEN", "본인 리포트에서만 사용할 수 있어요.");
  }
  if (report.draftCheckCount >= DRAFT_CHECK_LIMIT) {
    return errorResponse(429, "LIMIT_EXCEEDED", "초안 검증 횟수를 모두 사용했어요.");
  }

  const analysis = await getAnalysis(analysisId);
  const conversation = analysis ? await getConversation(analysis.conversationId) : null;
  if (!analysis || !conversation) {
    return errorResponse(404, "NOT_FOUND", "분석을 찾을 수 없어요.");
  }

  let result;
  try {
    result = await checkDraft({
      analysisId,
      draftText,
      overallSummary: analysis.overallSummary,
      recommendedAction: analysis.recommendedAction,
      situationContext: conversation.situationContext ?? null,
    });
  } catch (error) {
    // LLM 실패 시 횟수 차감 없음
    logger.error("draft_check_failed", { analysisId, error });
    return errorResponse(502, "LLM_ERROR", "검증에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }

  const newCount = await incrementDraftCheckCount(analysisId);

  return successResponse({
    result,
    remaining: Math.max(0, DRAFT_CHECK_LIMIT - newCount),
  });
}
```

- [ ] **Step 4: 테스트 통과 확인 + Commit**

```bash
npx vitest run "app/api/v1/analyses/[analysisId]/deep-report/draft-check/__tests__/route.test.ts"
npx tsc --noEmit
git add "app/api/v1/analyses/[analysisId]/deep-report/draft-check"
git commit -m "feat: add draft check route with usage limit"
```

---

### Task 10: 결제 연결 (checkout claim + successUrl + success 리다이렉트)

**Files:**
- Modify: `app/api/v1/payments/checkout/route.ts`
- Modify: `components/payment-button.tsx`
- Modify: `app/payment/success/page.tsx`

- [ ] **Step 1: checkout에 claim 추가**

`app/api/v1/payments/checkout/route.ts`에서 import에 `claimAnalysisForUser` 추가:

```ts
import { createPendingPayment, claimAnalysisForUser } from "@/lib/db-store";
```

`const plan = PLANS[purchaseType];` 바로 앞에 추가:

```ts
  // 단건 결제 전, 익명 분석을 결제자 소유로 승격 (temporary → saved)
  if (purchaseType === "single_analysis") {
    if (!analysisId) {
      return errorResponse(400, "VALIDATION_ERROR", "단건 결제에는 analysisId가 필요합니다.");
    }
    const claimResult = await claimAnalysisForUser(auth.userId, analysisId);
    if (claimResult === "not_found") {
      return errorResponse(404, "NOT_FOUND", "분석을 찾을 수 없어요.");
    }
    if (claimResult === "forbidden") {
      return errorResponse(403, "FORBIDDEN", "다른 사용자의 분석에는 결제할 수 없어요.");
    }
  }
```

- [ ] **Step 2: checkout 라우트 기존 테스트 갱신**

`app/api/v1/payments/__tests__/payment-routes.test.ts`를 열어 checkout 테스트의 mock에 `claimAnalysisForUser: vi.fn(async () => "claimed")`를 추가하고(모듈 mock `@/lib/db-store`에 함수 추가), single_analysis 케이스에 analysisId가 없으면 400이 되는 테스트를 1개 추가한다:

```ts
  it("rejects single_analysis checkout without analysisId", async () => {
    const { POST } = await import("../checkout/route");
    const response = await POST(
      new Request("http://t", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchaseType: "single_analysis" }),
      }),
    );
    expect(response.status).toBe(400);
  });
```

(기존 테스트가 single_analysis를 analysisId 없이 호출하고 있다면 analysisId를 추가해 통과시킨다.)

- [ ] **Step 3: PaymentButton — successUrl에 analysisId, 401 로그인 유도**

`components/payment-button.tsx`의 `handleClick` 안에서:

`const json = await res.json();` 뒤의 에러 분기를 다음으로 교체:

```ts
      if (!json.success) {
        if (res.status === 401) {
          window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setError(json.error?.message ?? "결제 초기화에 실패했습니다.");
        setLoading(false);
        return;
      }
```

`successUrl` 줄을 다음으로 교체:

```ts
        successUrl: `${origin}/payment/success${analysisId ? `?analysisId=${analysisId}` : ""}`,
```

- [ ] **Step 4: success 페이지 — 리포트로 리다이렉트**

`app/payment/success/page.tsx`의 `SuccessContent`에서 `const params = useSearchParams();` 아래에 추가:

```ts
  const analysisId = params.get("analysisId");
```

성공 화면의 버튼 블록을 다음으로 교체:

```tsx
      <button
        style={styles.button}
        onClick={() => router.push(analysisId ? `/report/${analysisId}` : "/analyze")}
      >
        {analysisId ? "심화 리포트 보기" : "분석 결과 보기"}
      </button>
```

- [ ] **Step 5: 테스트 + Commit**

```bash
npx vitest run app/api/v1/payments
npx tsc --noEmit
git add app/api/v1/payments components/payment-button.tsx app/payment/success/page.tsx
git commit -m "feat: wire single payment to deep report flow"
```

---

### Task 11: 결과 페이지 잠금 프리뷰 카드

**Files:**
- Modify: `components/analysis-experience.tsx`
- Modify: `components/analysis-experience.module.css`

- [ ] **Step 1: 프리뷰 카드 마크업 추가**

`components/analysis-experience.tsx`에서 액션 버튼 블록(`{/* ── 액션 버튼 ... */}` 주석이 있는 `<div className={styles.actions}>`) 바로 위에 추가:

```tsx
            {/* ── 심화 분석 프리뷰 (유료) ───────────────────────────── */}
            {streamingState.analysisId ? (
              <div className={styles.deepPreviewCard}>
                <p className={styles.kicker}>심화 분석</p>
                <h3>여기서 한 단계 더 깊게 볼 수 있어요</h3>
                <ul className={styles.deepPreviewList}>
                  <li>
                    <strong>유사 사례 비교</strong> — 비슷한 상황들이 실제로 어떻게 흘러갔는지
                  </li>
                  <li>
                    <strong>행동 시나리오 시뮬레이션</strong> — 보내기/기다리기/제안하기 경로별 예상 전개와 리스크
                  </li>
                  <li>
                    <strong>초안 메시지 검증 5회</strong> — 보내기 전에 예상 반응과 개선안 확인
                  </li>
                </ul>
                <p className={styles.deepPreviewNote}>
                  심화 리포트는 로그인 후 이용할 수 있고, 결제한 분석은 저장되어 다시 볼 수 있어요.
                </p>
                <PaymentButton
                  purchaseType="single_analysis"
                  analysisId={streamingState.analysisId}
                />
              </div>
            ) : null}
```

그리고 기존 `actions` div 안의 `<PaymentButton ... />` 블록(3줄)은 제거한다 (프리뷰 카드로 이동했으므로).

- [ ] **Step 2: 스타일 추가**

`components/analysis-experience.module.css` 끝에 추가:

```css
/* ── 심화 분석 프리뷰 카드 ───────────────────────────── */

.deepPreviewCard {
  margin-top: 24px;
  padding: 24px;
  border-radius: 16px;
  border: 1px solid rgba(99, 102, 241, 0.35);
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.06));
}

.deepPreviewCard h3 {
  margin: 4px 0 12px;
  font-size: 18px;
}

.deepPreviewList {
  margin: 0 0 12px;
  padding-left: 18px;
  display: grid;
  gap: 6px;
  font-size: 14px;
}

.deepPreviewNote {
  margin: 0 0 16px;
  font-size: 13px;
  color: var(--muted, #6b7280);
}
```

- [ ] **Step 3: 검증 + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add components/analysis-experience.tsx components/analysis-experience.module.css
git commit -m "feat: add deep analysis preview card"
```

브라우저 확인은 Task 13 E2E에서 일괄 수행.

---

### Task 12: /report/[analysisId] 페이지

**Files:**
- Create: `app/report/[analysisId]/page.tsx`
- Create: `app/report/[analysisId]/report.module.css`

- [ ] **Step 1: 페이지 작성**

`app/report/[analysisId]/page.tsx`:

```tsx
"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DeepReportContent, DraftCheckResult } from "@/lib/deep-report";
import { DRAFT_CHECK_LIMIT } from "@/lib/deep-report";
import styles from "./report.module.css";

type PageProps = {
  params: Promise<{ analysisId: string }>;
};

type LoadState =
  | { phase: "loading" | "generating" }
  | { phase: "error"; message: string }
  | { phase: "ready"; content: DeepReportContent; fallback: boolean; draftCheckCount: number };

const OUTCOME_LABELS: Record<string, string> = {
  progressed: "진전됨",
  stalled: "정체됨",
  ended: "종료됨",
};

export default function DeepReportPage({ params }: PageProps) {
  const { analysisId } = use(params);
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const startedRef = useRef(false);

  const generate = useCallback(async () => {
    setState({ phase: "generating" });

    const response = await fetch(`/api/v1/analyses/${analysisId}/deep-report`, {
      method: "POST",
    });

    if (response.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(`/report/${analysisId}`)}`;
      return;
    }
    if (!response.ok || !response.body) {
      const json = await response.json().catch(() => null);
      setState({
        phase: "error",
        message: json?.error?.message ?? "리포트를 불러오지 못했어요.",
      });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const chunk of events) {
        const line = chunk.trim();
        if (!line.startsWith("data: ")) continue;
        const event = JSON.parse(line.slice(6)) as Record<string, unknown>;

        if (event.type === "complete") {
          setState({
            phase: "ready",
            content: event.content as DeepReportContent,
            fallback: Boolean(event.fallback),
            draftCheckCount: 0,
          });
        } else if (event.type === "error") {
          setState({ phase: "error", message: String(event.message) });
        }
      }
    }
  }, [analysisId]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      // 이미 완료된 리포트가 있으면 GET으로 즉시 로드
      const res = await fetch(`/api/v1/analyses/${analysisId}/deep-report`);
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent(`/report/${analysisId}`)}`;
        return;
      }
      if (res.ok) {
        const json = await res.json();
        const report = json.data.report;
        if (report.status === "completed" && report.content) {
          setState({
            phase: "ready",
            content: report.content,
            fallback: false,
            draftCheckCount: report.draftCheckCount,
          });
          return;
        }
      }
      await generate();
    })();
  }, [analysisId, generate]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1>심화 분석 리포트</h1>
        <Link href="/analyze" className={styles.backLink}>
          새 분석 하러 가기
        </Link>
      </header>

      {state.phase === "loading" || state.phase === "generating" ? (
        <section className={styles.card}>
          <p>{state.phase === "generating" ? "리포트를 만드는 중이에요…" : "불러오는 중…"}</p>
        </section>
      ) : null}

      {state.phase === "error" ? (
        <section className={styles.card}>
          <p>{state.message}</p>
          <button type="button" className={styles.primaryButton} onClick={generate}>
            다시 시도
          </button>
        </section>
      ) : null}

      {state.phase === "ready" ? (
        <ReportBody
          analysisId={analysisId}
          content={state.content}
          fallback={state.fallback}
          initialUsed={state.draftCheckCount}
        />
      ) : null}
    </main>
  );
}

function ReportBody({
  analysisId,
  content,
  fallback,
  initialUsed,
}: {
  analysisId: string;
  content: DeepReportContent;
  fallback: boolean;
  initialUsed: number;
}) {
  const [draft, setDraft] = useState("");
  const [remaining, setRemaining] = useState(Math.max(0, DRAFT_CHECK_LIMIT - initialUsed));
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<DraftCheckResult | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  async function handleCheck() {
    setChecking(true);
    setCheckError(null);

    const response = await fetch(`/api/v1/analyses/${analysisId}/deep-report/draft-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftText: draft }),
    });
    const json = await response.json().catch(() => null);

    if (!response.ok || !json?.success) {
      setCheckError(json?.error?.message ?? "검증에 실패했어요.");
    } else {
      setCheckResult(json.data.result);
      setRemaining(json.data.remaining);
    }
    setChecking(false);
  }

  return (
    <>
      {fallback ? (
        <p className={styles.fallbackNote}>
          일부 심화 결과를 만들지 못해 기본 분석 기반으로 보여드려요. 다시 생성하면 전체 리포트를 받을 수 있어요.
        </p>
      ) : null}

      {content.similarCases ? (
        <section className={styles.card}>
          <h2>비슷한 상황들은 이렇게 흘러갔어요</h2>
          <p className={styles.patternSummary}>{content.similarCases.patternSummary}</p>
          <div className={styles.caseGrid}>
            {content.similarCases.cases.map((item, index) => (
              <article key={index} className={styles.caseCard}>
                <span className={styles.outcomeBadge} data-outcome={item.outcome}>
                  {OUTCOME_LABELS[item.outcome] ?? item.outcome}
                </span>
                <p>{item.flowSummary}</p>
                <p className={styles.lesson}>{item.lesson}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.card}>
        <h2>행동 시나리오 시뮬레이션</h2>
        <div className={styles.scenarioGrid}>
          {content.scenarios.map((scenario, index) => (
            <article key={index} className={styles.scenarioCard}>
              <header>
                <h3>{scenario.actionLabel}</h3>
                <span className={styles.confidence}>{scenario.confidence}</span>
              </header>
              <p>{scenario.expectedFlow}</p>
              <p className={styles.risk}>리스크: {scenario.risk}</p>
              {scenario.bestMessage ? (
                <p className={styles.bestMessage}>추천 메시지: {scenario.bestMessage}</p>
              ) : null}
              <p className={styles.timing}>타이밍: {scenario.timing}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <h2>보내기 전에 초안 검증하기</h2>
        <p className={styles.remaining}>남은 횟수: {remaining}회</p>
        <textarea
          className={styles.draftInput}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="보내려는 메시지를 붙여넣어 보세요"
          maxLength={500}
          rows={3}
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={handleCheck}
          disabled={checking || remaining <= 0 || draft.trim().length === 0}
        >
          {checking ? "검증 중…" : remaining <= 0 ? "횟수를 모두 사용했어요" : "검증하기"}
        </button>
        {checkError ? <p className={styles.error}>{checkError}</p> : null}
        {checkResult ? (
          <div className={styles.checkResult}>
            <p>
              <strong>예상 반응</strong> — {checkResult.predictedReaction}
            </p>
            <p>
              <strong>리스크</strong> — {checkResult.riskLevel}
              {checkResult.risks.length > 0 ? ` (${checkResult.risks.join(" / ")})` : ""}
            </p>
            <p>
              <strong>개선안</strong> — {checkResult.improvedDraft}
            </p>
            <p className={styles.rationale}>{checkResult.rationale}</p>
          </div>
        ) : null}
      </section>
    </>
  );
}
```

- [ ] **Step 2: `report.module.css` 작성**

```css
.page {
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 20px 80px;
  display: grid;
  gap: 20px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header h1 {
  font-size: 24px;
}

.backLink {
  font-size: 14px;
  color: #6366f1;
}

.card {
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 16px;
  padding: 24px;
  display: grid;
  gap: 12px;
  background: #fff;
}

.card h2 {
  font-size: 18px;
}

.fallbackNote {
  padding: 12px 16px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  font-size: 14px;
}

.patternSummary {
  font-size: 14px;
  color: #4b5563;
}

.caseGrid,
.scenarioGrid {
  display: grid;
  gap: 12px;
}

.caseCard,
.scenarioCard {
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 16px;
  display: grid;
  gap: 8px;
  font-size: 14px;
}

.scenarioCard header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.outcomeBadge {
  justify-self: start;
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(99, 102, 241, 0.12);
}

.outcomeBadge[data-outcome="progressed"] {
  background: rgba(16, 185, 129, 0.15);
}

.outcomeBadge[data-outcome="ended"] {
  background: rgba(239, 68, 68, 0.12);
}

.lesson,
.rationale {
  font-size: 13px;
  color: #6b7280;
}

.confidence {
  font-size: 12px;
  color: #6b7280;
}

.risk {
  color: #b45309;
}

.bestMessage {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(99, 102, 241, 0.08);
}

.timing {
  font-size: 13px;
  color: #6b7280;
}

.remaining {
  font-size: 13px;
  color: #6b7280;
}

.draftInput {
  width: 100%;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 10px;
  padding: 12px;
  font-size: 14px;
  resize: vertical;
}

.primaryButton {
  justify-self: start;
  background: #6366f1;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.primaryButton:disabled {
  background: #a5b4fc;
  cursor: not-allowed;
}

.error {
  color: #ef4444;
  font-size: 13px;
}

.checkResult {
  border-top: 1px dashed rgba(0, 0, 0, 0.12);
  padding-top: 12px;
  display: grid;
  gap: 6px;
  font-size: 14px;
}
```

- [ ] **Step 3: 검증 + Commit**

```bash
npx tsc --noEmit
npx vitest run
git add "app/report"
git commit -m "feat: add deep report page with draft check"
```

---

### Task 13: 시드 코퍼스 스크립트

**Files:**
- Create: `learning/lib/seed-schema.ts`
- Create: `learning/lib/__tests__/seed-schema.test.ts`
- Create: `learning/scripts/seed-gen.ts`
- Create: `learning/scripts/seed-embed.ts`
- Modify: `package.json`

- [ ] **Step 1: 실패하는 스키마 테스트 작성**

`learning/lib/__tests__/seed-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validateSeedCase } from "../seed-schema";

const valid = {
  summaryText: "소개팅 후 상대 답장이 느려졌지만 일주일 뒤 자연스럽게 재개된 사례",
  situationType: "after_first_date",
  outcomeLabel: "progressed",
  lesson: "답장 속도보다 내용의 온도를 보는 편이 정확했다",
};

describe("validateSeedCase", () => {
  it("accepts a valid seed case", () => {
    expect(validateSeedCase(valid)).toEqual({ ok: true, value: valid });
  });

  it("rejects unknown outcome labels", () => {
    const result = validateSeedCase({ ...valid, outcomeLabel: "unknown" });
    expect(result.ok).toBe(false);
  });

  it("rejects short summaries", () => {
    const result = validateSeedCase({ ...valid, summaryText: "짧음" });
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: 실패 확인**

```bash
npx vitest run learning/lib/__tests__/seed-schema.test.ts
```

Expected: FAIL — 모듈 없음.

- [ ] **Step 3: `learning/lib/seed-schema.ts` 작성**

```ts
export type SeedCase = {
  summaryText: string;
  situationType: string;
  outcomeLabel: "progressed" | "stalled" | "ended";
  lesson: string;
};

const OUTCOMES = new Set(["progressed", "stalled", "ended"]);
const SITUATION_TYPES = new Set([
  "before_meeting",
  "after_first_date",
  "after_second_date",
  "cooling_down",
]);
const MIN_SUMMARY_LENGTH = 20;

export function validateSeedCase(
  input: unknown,
): { ok: true; value: SeedCase } | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "not an object" };
  }
  const record = input as Record<string, unknown>;

  const summaryText = typeof record.summaryText === "string" ? record.summaryText.trim() : "";
  if (summaryText.length < MIN_SUMMARY_LENGTH) {
    return { ok: false, reason: `summaryText must be >= ${MIN_SUMMARY_LENGTH} chars` };
  }

  const situationType =
    typeof record.situationType === "string" ? record.situationType.trim() : "";
  if (!SITUATION_TYPES.has(situationType)) {
    return { ok: false, reason: `unknown situationType: ${situationType}` };
  }

  const outcomeLabel = record.outcomeLabel as string;
  if (!OUTCOMES.has(outcomeLabel)) {
    return { ok: false, reason: `unknown outcomeLabel: ${outcomeLabel}` };
  }

  const lesson = typeof record.lesson === "string" ? record.lesson.trim() : "";
  if (lesson.length === 0) {
    return { ok: false, reason: "lesson is required" };
  }

  return {
    ok: true,
    value: {
      summaryText,
      situationType,
      outcomeLabel: outcomeLabel as SeedCase["outcomeLabel"],
      lesson,
    },
  };
}
```

- [ ] **Step 4: `learning/scripts/seed-gen.ts` 작성**

Anthropic SDK를 직접 사용해 유형×결말 조합별 사례 초안을 생성하고 `learning/seeds/drafts/`에 저장:

```ts
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { validateSeedCase, type SeedCase } from "../lib/seed-schema";

const SITUATION_TYPES = [
  "before_meeting",
  "after_first_date",
  "after_second_date",
  "cooling_down",
] as const;
const OUTCOMES = ["progressed", "stalled", "ended"] as const;
const CASES_PER_COMBO = Number(process.env.SEED_CASES_PER_COMBO ?? 5);

const PROMPT = (situationType: string, outcome: string, count: number) => `당신은 연애 상담 사례 작가입니다. 소개팅·썸 초기 상황의 익명 사례를 만듭니다.

조건:
- 상황 유형: ${situationType}
- 결말: ${outcome} (progressed=관계 진전 / stalled=흐지부지 정체 / ended=자연 종료·정리)
- ${count}개의 서로 다른 사례를 만드세요.
- 각 사례는 특정 개인을 식별할 수 없는 일반적인 패턴이어야 합니다.
- summaryText: 상황과 흐름 요약 2~3문장 (40~120자, 한국어)
- lesson: 이 사례에서 배울 점 1문장 (한국어)

JSON 배열만 출력하세요. 형식:
[{"summaryText": "...", "situationType": "${situationType}", "outcomeLabel": "${outcome}", "lesson": "..."}]`;

async function main() {
  const apiKey = process.env.SEED_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY(또는 SEED_ANTHROPIC_API_KEY)가 필요합니다.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey });
  const outDir = join(process.cwd(), "learning", "seeds", "drafts");
  mkdirSync(outDir, { recursive: true });

  for (const situationType of SITUATION_TYPES) {
    for (const outcome of OUTCOMES) {
      const response = await client.messages.create({
        model: process.env.SEED_MODEL ?? "claude-sonnet-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: PROMPT(situationType, outcome, CASES_PER_COMBO) }],
      });

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error(`[${situationType}/${outcome}] JSON 배열을 찾지 못했습니다. 건너뜁니다.`);
        continue;
      }

      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      const cases: SeedCase[] = [];
      for (const item of parsed) {
        const result = validateSeedCase(item);
        if (result.ok) {
          cases.push(result.value);
        } else {
          console.warn(`  invalid case skipped: ${result.reason}`);
        }
      }

      const file = join(outDir, `${situationType}-${outcome}.json`);
      writeFileSync(file, JSON.stringify(cases, null, 2) + "\n", "utf8");
      console.log(`[${situationType}/${outcome}] ${cases.length}건 → ${file}`);
    }
  }

  console.log("\n생성 완료. learning/seeds/drafts/를 수동 검수한 뒤 승인본을 learning/seeds/approved/로 옮기고 npm run learn:seed-embed를 실행하세요.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: `learning/scripts/seed-embed.ts` 작성**

승인본을 임베딩해 reference_cases에 업서트:

```ts
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateSeedCase, type SeedCase } from "../lib/seed-schema";

const EMBEDDING_MODEL = "text-embedding-3-small";

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY가 필요합니다.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 필요합니다.");
    process.exit(1);
  }

  const approvedDir = join(process.cwd(), "learning", "seeds", "approved");
  let files: string[];
  try {
    files = readdirSync(approvedDir).filter((name) => name.endsWith(".json"));
  } catch {
    console.error(`승인 폴더가 없습니다: ${approvedDir}`);
    process.exit(1);
  }

  const cases: SeedCase[] = [];
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(approvedDir, file), "utf8")) as unknown[];
    for (const item of raw) {
      const result = validateSeedCase(item);
      if (result.ok) {
        cases.push(result.value);
      } else {
        console.warn(`${file}: invalid case skipped (${result.reason})`);
      }
    }
  }

  if (cases.length === 0) {
    console.error("업서트할 승인 사례가 없습니다.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const openai = new OpenAI();

  // 시드는 전체 교체 방식: 기존 시드를 지우고 다시 넣는다.
  await prisma.$executeRawUnsafe(`DELETE FROM reference_cases`);

  for (const seedCase of cases) {
    const embedding = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: `${seedCase.situationType} ${seedCase.summaryText}`,
    });
    const vectorStr = `[${embedding.data[0].embedding.join(",")}]`;

    await prisma.$executeRawUnsafe(
      `INSERT INTO reference_cases (id, summary_text, situation_type, outcome_label, lesson, embedding)
       VALUES ($1::uuid, $2, $3, $4, $5, $6::vector)`,
      randomUUID(),
      seedCase.summaryText,
      seedCase.situationType,
      seedCase.outcomeLabel,
      seedCase.lesson,
      vectorStr,
    );
  }

  console.log(`reference_cases 업서트 완료: ${cases.length}건`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 6: package.json 스크립트 추가**

`"learn:label"` 줄 뒤에 추가:

```json
    "learn:seed-gen": "tsx learning/scripts/seed-gen.ts",
    "learn:seed-embed": "tsx learning/scripts/seed-embed.ts",
```

- [ ] **Step 7: 테스트 + Commit**

```bash
npx vitest run learning/lib/__tests__/seed-schema.test.ts
npx tsc --noEmit
git add learning/lib/seed-schema.ts learning/lib/__tests__/seed-schema.test.ts learning/scripts/seed-gen.ts learning/scripts/seed-embed.ts package.json
git commit -m "feat: add seed corpus generation and embedding scripts"
```

시드 실제 생성·업서트(`npm run learn:seed-gen` → 수동 검수 → `npm run learn:seed-embed`)는 API 키가 필요한 수동 단계로, Task 14의 E2E 전에 사용자가 실행한다.

---

### Task 14: E2E 검증 + 문서

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-08-deep-analysis-v1-design.md`

- [ ] **Step 1: 전체 테스트·타입체크**

```bash
export PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH"
npx vitest run
npx tsc --noEmit
```

Expected: 전부 PASS, exit 0.

- [ ] **Step 2: README에 심화 분석 섹션 추가**

`README.md`의 "상황 중심 분석" 섹션 뒤에 추가:

````md
### 심화 분석 (유료)

로그인 + 단건 결제(₩3,900) 또는 구독 후 이용. 유사 사례 비교, 행동 시나리오 시뮬레이션, 초안 검증 5회를 제공합니다. DB 모드(`USE_DB=true`) 전용.

```bash
# 시드 코퍼스 준비 (1회)
npm run learn:seed-gen      # LLM으로 사례 초안 생성 → learning/seeds/drafts/
# drafts/를 검수해 learning/seeds/approved/로 복사
npm run learn:seed-embed    # 임베딩 + reference_cases 업서트

# 리포트 생성 (결제 후)
curl -X POST http://localhost:3000/api/v1/analyses/{analysisId}/deep-report
# 초안 검증
curl -X POST http://localhost:3000/api/v1/analyses/{analysisId}/deep-report/draft-check \
  -H 'Content-Type: application/json' -d '{"draftText": "보내려는 메시지"}'
```
````

- [ ] **Step 3: 수동 E2E 스모크 (USE_DB=true 필요)**

```bash
docker compose -f ../docker-compose.yml up -d
# .env.local에 USE_DB=true, DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY 확인
npm run dev
```

체크리스트:
1. `/analyze`에서 분석 실행 → 결과 하단에 심화 프리뷰 카드 표시.
2. 비로그인 상태에서 결제 버튼 클릭 → `/login`으로 이동.
3. 로그인 → 결제(Toss 테스트 키) → `/payment/success?analysisId=...` → "심화 리포트 보기" → `/report/{analysisId}`.
4. 리포트 생성 스트리밍 표시 → 유사 사례(시드 있을 때) + 시나리오 2~3개 렌더링.
5. 초안 검증 입력 → 결과 + 남은 횟수 감소. 5회 소진 시 버튼 비활성.
6. 새로고침 → 저장된 리포트 즉시 재열람.
7. `ANTHROPIC_API_KEY` 제거 후 새 분석·결제로 재시도 → fallback 리포트 + 안내 문구.

- [ ] **Step 4: 스펙 상태 갱신 + Commit**

`docs/superpowers/specs/2026-07-08-deep-analysis-v1-design.md`의 `상태:` 줄을 `상태: 구현 완료 (2026-07-08 플랜 실행)`으로 바꾼다.

```bash
git add README.md docs/superpowers/specs/2026-07-08-deep-analysis-v1-design.md
git commit -m "docs: document deep analysis usage"
```

---

## Final Verification

`landing-page-nextjs/`에서:

```bash
npx vitest run
npx tsc --noEmit
```

레포 루트에서:

```bash
git status --short --branch
```

Expected: 전체 테스트 통과, 타입체크 통과, 워킹 트리 클린.

## Execution Notes

- Task 5·6의 anthropic-client 헬퍼 시그니처는 반드시 기존 signal-enhancer 호출부와 대조해 맞춘다 (단계 이름 union 타입에 `"deep_report"`, `"draft_check"` 추가 필요 가능).
- Task 8의 `getAnalysis`/`getConversation`이 store.ts에서 re-export되지 않으면 기존 패턴대로 추가한다.
- 캡처 원본 이미지는 어디에도 저장하지 않는다. 시드 사례는 실사용자 데이터가 아닌 창작 사례만 쓴다.
- 사용자-facing copy는 전부 한국어 유지.
