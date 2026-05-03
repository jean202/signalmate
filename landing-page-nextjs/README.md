# SignalMate — AI Chat Signal Analyzer

> 연애 초기 채팅에서 관계 신호를 다각도로 분석하고, 다음 메시지 전략을 추천하는 AI 파이프라인

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Claude API](https://img.shields.io/badge/Claude_API-Anthropic-orange)](https://docs.anthropic.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)](https://www.postgresql.org/)
[![pgvector](https://img.shields.io/badge/pgvector-cosine_similarity-green)](https://github.com/pgvector/pgvector)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-black?logo=vercel)](https://landing-page-nextjs-rust-six.vercel.app/analyze)

**🔗 Live Demo: [https://landing-page-nextjs-rust-six.vercel.app/analyze](https://landing-page-nextjs-rust-six.vercel.app/analyze)**

---

## Why This Project?

사람들은 소개팅 후 카톡을 캡처해서 친구에게 "이 사람 나한테 관심 있는 거야?"라고 물어봅니다.
SignalMate는 이 행동을 **AI 파이프라인**으로 체계화한 프로젝트입니다.

**포커스**: 호감도 예측이 아니라, 채팅 속 **관찰 가능한 패턴**(응답 연속성, 톤 변화, 미래 언급 등)을 구조화하고 증거 기반 추천을 제공합니다.

---

## Architecture Overview

```mermaid
flowchart TB
    subgraph Client["Client (React 19)"]
        UI["AnalysisExperience<br/>streaming state machine"]
    end

    subgraph API["API Layer"]
        CONV["POST /conversations"]
        STREAM["POST /conversations/:id/analyses/stream<br/>← SSE endpoint"]
        ANAL["POST /conversations/:id/analyses<br/>(non-streaming)"]
    end

    subgraph Engine["Analysis Engine"]
        direction TB
        RULE["① Rule-Based<br/>16 pattern rules · ~5ms"]
        RAG["② RAG (optional)<br/>pgvector similarity"]
        ENHANCE["③ Signal Enhancer<br/>Claude tool_use"]
        RECOM["④ Recommendation Generator<br/>Claude tool_use"]
    end

    subgraph SSE["SSE Events (stream endpoint)"]
        E1["rule_complete → signals 즉시 표시"]
        E2["signals_enhanced → 카드 내용 업데이트"]
        E3["recommendations_ready → 추천 카드 등장"]
        E4["complete → 버튼 활성화"]
    end

    subgraph Data["Data Layer"]
        PG["PostgreSQL 16"]
        VEC["pgvector · 1536-dim"]
        EMBED["OpenAI text-embedding-3-small"]
    end

    UI --> CONV --> PG
    UI -->|"fetch() + ReadableStream"| STREAM
    STREAM --> RULE --> E1 --> UI
    RULE --> RAG --> VEC
    STREAM --> ENHANCE --> E2 --> UI
    STREAM --> RECOM --> E3 --> UI
    STREAM --> PG --> E4 --> UI
    PG -.->|"background"| EMBED --> VEC

    style STREAM fill:#e8f4f8,stroke:#2196F3
    style E1 fill:#e8f5e9,stroke:#4CAF50
    style E2 fill:#e8f5e9,stroke:#4CAF50
    style E3 fill:#e8f5e9,stroke:#4CAF50
    style E4 fill:#e8f5e9,stroke:#4CAF50
```

---

## Streaming UX

분석 결과를 한 번에 기다리지 않고, 4단계 이벤트를 SSE로 스트리밍합니다.

```
사용자 클릭
   │
   ├─ POST /conversations          (대화 저장)
   │
   └─ POST /analyses/stream        (SSE 연결)
         │
         ├─ event: rule_complete    ~200ms   → 신호 카드 stagger 등장
         │                                      규칙 기반 내용 즉시 표시
         │                                      "AI 강화 중..." 배지 + 펄스
         │
         ├─ event: signals_enhanced ~3-5s   → 신호 카드 내용 업데이트
         │                                      Claude 강화 텍스트로 교체
         │                                      펄스 종료, 텍스트 fade-in
         │
         ├─ event: recommendations_ready     → 추천 카드 순차 등장
         │                                      skeleton → 실제 카드
         │
         └─ event: complete                  → 결제/재분석 버튼 활성화
                                               conversationId, analysisId 확정
```

**구현 방식**

- 서버: `ReadableStream` + `text/event-stream` 헤더. Next.js App Router의 `nodejs` 런타임 사용
- 클라이언트: `fetch()` + `response.body.getReader()` — `EventSource` 대신 POST body 전달 가능
- 상태: `StreamPhase` (`idle → rules_visible → enhancing → complete`) 로 UI 전환 구동
- Fallback: Claude API 키 없으면 `rule_complete` 직후 `complete`로 즉시 완료

---

## AI Pipeline — 4 Phases

이 프로젝트의 핵심은 **단계적으로 발전하는 AI 파이프라인**입니다.

### Phase 1: Prompt Chaining

```mermaid
sequenceDiagram
    participant R as Rule Engine (16 rules)
    participant S as Signal Enhancer
    participant G as Recommendation Generator
    participant DB as PostgreSQL

    R->>R: 패턴 매칭 (응답연속성, 톤, 미래언급...)
    R->>S: 규칙 시그널 + 대화 원문
    Note over S: Claude tool_use<br/>시그널 설명 강화 + 증거 추출
    S->>G: 강화된 시그널 + 요약
    Note over G: Claude tool_use<br/>추천 메시지 3개 생성
    G->>DB: 최종 분석 저장
```

- **tool_use 기반 structured output** — JSON 스키마로 필드별 제약 (한국어만, 글자수 제한, 문장 완결)
- **Few-shot examples** — Anthropic tool_use 메시지 포맷에 맞춘 4-turn 예제
- **Fallback** — Claude 실패 시 규칙 기반 결과로 자동 전환

### Phase 2: Evaluation Pipeline

```
Rule-Based Result  ─┬─→  10+ Comparison Metrics  ─→  Quality Score (0-100)
Hybrid Result      ─┘
                         signal_overlap (30%)
                         type_agreement (20%)
                         action_match (20%)
                         description_improvement (15%)
                         recommendation_completeness (15%)
```

- `?eval=true` 쿼리 파라미터로 A/B 비교 활성화
- 규칙 기반 vs 하이브리드 품질 점수 자동 산출

### Phase 3: RAG with Embeddings

```mermaid
flowchart LR
    A["대화 분석 완료"] -->|background| B["buildSummaryText()"]
    B --> C["OpenAI Embedding<br/>1536-dim"]
    C --> D["pgvector 저장"]

    E["새 대화 분석 요청"] --> F["queryText 생성"]
    F --> G["cosine similarity 검색"]
    G --> H["상위 5개 유사 대화"]
    H --> I["outcome 통계 집계"]
    I --> J["insight → 프롬프트 주입"]

    D -.-> G
```

- **Embedding**: 분석 완료 후 fire-and-forget으로 벡터 저장
- **Retrieval**: 유사 대화의 결과 분포(긍정/중립/부정)를 프롬프트에 주입
- **Graceful degradation**: OpenAI 키 없으면 RAG 스킵, 나머지 파이프라인 정상 동작

### Phase 4: Multi-step Agent

```mermaid
sequenceDiagram
    participant C as Claude Agent
    participant T1 as analyze_timeline
    participant T2 as detect_tone_shift
    participant T3 as match_patterns
    participant T4 as search_similar
    participant T5 as check_quality
    participant T6 as submit_result

    Note over C: Iteration 1
    C->>T1: 메시지 시간/패턴 분석
    T1-->>C: {initiator, consecutiveSends, lengthTrend}
    C->>T2: 전후반 톤 변화 감지
    T2-->>C: {shiftDirection: warming|cooling|stable}
    C->>T3: 16개 규칙 엔진 실행
    T3-->>C: {signals[], signalCounts}

    Note over C: Iteration 2
    C->>T4: 벡터 DB 유사 패턴 검색
    T4-->>C: {similar[], outcomeStats}
    C->>T5: 분석 초안 품질 검증
    T5-->>C: {warnings[], passed: false}

    Note over C: Iteration 3
    C->>T5: 수정 후 재검증
    T5-->>C: {warnings: [], passed: true}

    Note over C: Iteration 4
    C->>T6: 최종 결과 제출
    T6-->>C: {status: accepted}
```

- **6개 도구**: Claude가 자율적으로 호출 순서를 결정
- **최대 8회 iteration**, 실측 4회에 수렴
- **Quality gate**: `check_quality`를 통과해야 `submit_result` 가능
- **유해 조언 차단**: 스토킹/집착/조종 패턴 자동 감지 및 거부

---

## Analysis Modes

| modelName | Description | Pipeline | Latency | Tokens |
|-----------|-------------|----------|---------|--------|
| `rule-based-dev` | 규칙 기반만 | 16 pattern rules | ~5ms | 0 |
| `hybrid-v1` | 규칙 + Claude 체이닝 | Rules → Enhance → Recommend | ~8s | ~6k |
| `hybrid-v1+rag` | 체이닝 + RAG 컨텍스트 | Rules → RAG → Enhance → Recommend | ~10s | ~7k |
| `agent-v1` | 멀티스텝 에이전트 | 6 tools, max 8 iterations | ~44s | ~34k |

**Fallback Chain**: `agent-v1` 실패 → `hybrid-v1` → `rule-based-dev`

---

## Rule Engine — 16 Patterns

채팅 원문에서 관찰 가능한 16가지 행동 패턴을 감지합니다.

| Type | Signal Key | What it detects |
|------|-----------|-----------------|
| Positive | `reply_continuity` | 내 메시지 이후 상대가 연속 응답하는 패턴 |
| Positive | `future_reference` | "다음에", "주말에", "보자" 등 미래 언급 |
| Positive | `other_initiated` | 상대가 먼저 대화를 시작 |
| Positive | `definite_plan` | 구체적 날짜/시간/장소 제안 |
| Positive | `warm_tone` | 이모지, 따뜻한 표현, 긴 메시지 |
| Positive | `length_balance` | 상대 메시지 길이가 내 것의 70% 이상 |
| Ambiguous | `one_sided_conversation` | 내가 2.5배 이상 많이 보냄 |
| Ambiguous | `short_replies` | 60% 이상이 5자 이하 |
| Ambiguous | `question_balance` | 상대에게서 질문이 돌아오지 않음 |
| Ambiguous | `sample_size` | 총 메시지 6개 미만 (판단 어려움) |
| Caution | `date_specificity` | 만남 제안에 애매한 응답 |
| Caution | `awaiting_reply` | 마지막 메시지가 내 것 |
| Caution | `hedged_replies` | "나중에", "바빠", "어려워" 2회 이상 |
| Caution | `closing_without_follow_up` | "잘 자" 후 대화 종료 |
| Caution | `tone_drop` | 후반부 메시지 길이가 전반부의 60% 미만 |
| Default | `limited_signal` | 판단 가능한 신호 부족 |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | Next.js 15 (App Router) | SSR + API Routes |
| **Language** | TypeScript 5 (strict) | Type safety |
| **Frontend** | React 19 | UI |
| **Database** | PostgreSQL 16 | Primary storage |
| **ORM** | Prisma 7 + `@prisma/adapter-pg` | Type-safe DB access |
| **Vector DB** | pgvector (cosine similarity) | RAG embedding storage |
| **LLM** | Claude API (`@anthropic-ai/sdk`) | Signal enhancement + Agent |
| **Embeddings** | OpenAI `text-embedding-3-small` | 1536-dim conversation vectors |
| **Structured Output** | Anthropic `tool_use` | JSON schema-constrained responses |

---

## API Endpoints

```
POST   /api/v1/conversations                          # 대화 업로드 + 메시지 파싱
GET    /api/v1/conversations/:id                      # 대화 조회
POST   /api/v1/conversations/:id/analyses/stream      # 분석 실행 — SSE 스트리밍 ★
POST   /api/v1/conversations/:id/analyses             # 분석 실행 — 단건 응답 (eval 모드)
GET    /api/v1/analyses/:id                           # 분석 결과 조회
GET    /api/v1/analyses/:id/signals                   # 시그널 목록
GET    /api/v1/analyses/:id/recommendations           # 추천 메시지 목록
```

**대화 생성 예시** (상황 설명 포함):
```bash
# Mode A: 자유 텍스트 상황 설명
curl -X POST .../conversations -d '{
  "relationshipStage": "after_first_date",
  "meetingChannel": "dating_app",
  "userGoal": "evaluate_interest",
  "rawText": "나: 어제 재밌었어!\n상대: 나도! 다음에 또 보자",
  "situationContext": "3번째 만남이고, 직접 만났을 때 분위기는 좋았어요. 상대는 원래 답장이 느린 편이에요.",
  "messages": [...]
}'

# Mode B: 가이드 질문 응답
curl -X POST .../conversations -d '{
  ...
  "guidedAnswers": {
    "meetingCount": "2_3_times",
    "meetingVibe": "good",
    "otherStyle": ["slow_reply", "short_messages"],
    "freeText": "갑자기 이모지를 안 쓰기 시작해서 걱정"
  }
}'
```

**분석 요청 예시**:
```bash
# 규칙 기반
curl -X POST .../analyses -d '{"modelName": "rule-based-dev"}'

# 하이브리드 (기본값)
curl -X POST .../analyses -d '{"modelName": "hybrid-v1"}'

# 멀티스텝 에이전트
curl -X POST .../analyses -d '{"modelName": "agent-v1"}'

# 평가 모드 (규칙 vs 하이브리드 비교)
curl -X POST ".../analyses?eval=true"
```

---

## Project Structure

```
lib/
├── rule-based-analysis.ts          # 16 pattern rules
├── ai/
│   ├── analysis-engine.ts          # Router: rule → hybrid → agent
│   ├── anthropic-client.ts         # Claude SDK singleton
│   ├── token-tracker.ts            # Token usage logging
│   ├── prompts/
│   │   ├── system-prompt.ts        # System prompts (Korean-only, length constraints)
│   │   └── few-shot-examples.ts    # Anthropic tool_use format examples
│   ├── schemas/
│   │   └── analysis-schema.ts      # Structured output tool definitions
│   ├── chains/
│   │   ├── signal-enhancer.ts      # Chain 1: Signal description refinement
│   │   └── recommendation-generator.ts  # Chain 2: Next message generation
│   ├── embeddings/
│   │   ├── openai-client.ts        # OpenAI SDK singleton
│   │   ├── embed-conversation.ts   # Conversation → vector storage
│   │   ├── similarity-search.ts    # pgvector cosine search
│   │   └── insight-builder.ts      # Aggregate similar outcomes
│   ├── agent/
│   │   ├── analysis-agent.ts       # Multi-step tool_use loop (max 8 iter)
│   │   └── tools/
│   │       ├── timeline.ts         # Message sequence analysis
│   │       ├── tone-shift.ts       # Tone warming/cooling detection
│   │       ├── pattern-matcher.ts  # Rule engine wrapper
│   │       ├── similar-search.ts   # RAG search wrapper
│   │       └── quality-checker.ts  # Harmful advice + consistency check
│   └── evaluation/
│       ├── metrics.ts              # 10+ comparison metrics
│       └── comparator.ts           # Rule vs hybrid A/B evaluator
├── situation-context-builder.ts     # Guided Q&A → situationContext text
├── store.ts                        # Storage abstraction (JSON ↔ PostgreSQL)
├── db-store.ts                     # Prisma-based storage
└── prisma.ts                       # Prisma client singleton
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL + pgvector)
- Anthropic API key

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Start PostgreSQL with pgvector
docker run -d --name signalmate-db \
  -e POSTGRES_USER=signalmate \
  -e POSTGRES_PASSWORD=signalmate_local \
  -e POSTGRES_DB=signalmate \
  -p 5433:5432 \
  pgvector/pgvector:pg16

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 4. Run migrations
npx prisma migrate deploy

# 5. Start dev server
npm run dev
```

### Environment Variables

```env
DATABASE_URL="postgresql://signalmate:signalmate_local@localhost:5433/signalmate"
USE_DB=true
ANTHROPIC_API_KEY=sk-ant-...     # Required for hybrid/agent modes
OPENAI_API_KEY=sk-...            # Optional, enables RAG (Phase 3)
```

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **tool_use for structured output** | JSON mode보다 스키마 제약이 강력하고, 필드별 description으로 한국어/글자수 제한 가능 |
| **Rule engine이 항상 먼저 실행** | LLM 없이도 기본 분석 제공, LLM은 "강화"만 담당 → API 키 없어도 서비스 가능 |
| **Agent가 check_quality를 스스로 호출** | 유해 조언(스토킹/조종) 자동 차단, 시그널-증거 일관성 보장 |
| **pgvector (not Pinecone/Weaviate)** | 외부 벡터 DB 의존성 제거, PostgreSQL 하나로 모든 데이터 관리 |
| **Fire-and-forget embedding** | 분석 응답 속도에 영향 없이 비동기로 벡터 저장 |
| **Graceful degradation at every level** | OpenAI 없으면 RAG 스킵, Claude 없으면 규칙 기반, 에이전트 실패하면 하이브리드로 fallback |

---

## Performance

실측 결과 (Claude Haiku 4.5, 테스트 대화 12개 메시지):

| Mode | Latency | Tokens | Cost (est.) |
|------|---------|--------|-------------|
| Rule-based | 5ms | 0 | $0 |
| Hybrid | 8s | ~6,000 | ~$0.003 |
| Agent | 44s | ~34,000 | ~$0.017 |

Agent 모드는 4 iterations / 7 tool calls로 수렴. Quality score: 96/100 (evaluation pipeline 기준).

---

## License

Private project. For portfolio demonstration purposes.
