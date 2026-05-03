# SignalMate

> 소개팅·썸 초기 채팅을 붙여넣으면 관계 신호를 분석하고, 다음 메시지를 제안하는 AI 서비스

[![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Claude API](https://img.shields.io/badge/Claude_API-Anthropic-orange)](https://docs.anthropic.com/)
[![pgvector](https://img.shields.io/badge/pgvector-RAG-green)](https://github.com/pgvector/pgvector)
[![Live Demo](https://img.shields.io/badge/Live_Demo-Vercel-black?logo=vercel)](https://landing-page-nextjs-rust-six.vercel.app/analyze)

**→ [https://landing-page-nextjs-rust-six.vercel.app/analyze](https://landing-page-nextjs-rust-six.vercel.app/analyze)**

---

## 왜 이 프로젝트인가

사람들은 소개팅 후 카톡 캡처를 친구에게 보내며 "이 사람 나한테 관심 있는 거야?"라고 물어봅니다.
SignalMate는 이 행동을 AI 파이프라인으로 체계화합니다.

**포지셔닝**: 호감도 예측(운세)이 아니라, **채팅에서 관찰 가능한 패턴**을 구조화해 증거 기반 해석과 다음 액션을 제공합니다.

---

## 핵심 기술 하이라이트

### 1. SSE 스트리밍 분석 UX

결과를 한 번에 기다리지 않고, 분석 단계마다 UI를 업데이트합니다.

```
클릭 → POST /analyses/stream (SSE 연결)
  ├─ rule_complete     ~200ms → 신호 카드 즉시 등장 + "AI 강화 중" 배지
  ├─ signals_enhanced  ~3-5s  → 카드 내용이 Claude 강화 텍스트로 교체
  ├─ recommendations_ready    → 추천 카드 순차 등장
  └─ complete                 → 버튼 활성화
```

`fetch() + ReadableStream`으로 구현 — EventSource 대신 POST body 전달이 가능한 방식.

### 2. 4단계 AI 파이프라인

| 단계 | 방식 | 역할 |
|------|------|------|
| **Phase 1** | Prompt Chaining | 규칙 기반 신호 → Claude `tool_use`로 강화 → 추천 생성 |
| **Phase 2** | Evaluation Pipeline | rule-based vs hybrid 결과를 10+ 메트릭으로 자동 비교 |
| **Phase 3** | RAG (pgvector) | 유사 대화 패턴 검색 → outcome 통계를 프롬프트에 주입 |
| **Phase 4** | Multi-step Agent | 6개 도구로 구성된 self-directed 분석 루프 (max 8 iter) |

### 3. 규칙 엔진 (16 패턴)

Claude 없이도 동작하는 기반 레이어. 응답 연속성, 톤 변화, 미래 언급, 메시지 길이 비율 등을 패턴 매칭으로 감지합니다. LLM은 이 결과를 "강화"하는 역할만 담당해, **API 키 없이도 서비스 가능**합니다.

### 4. Graceful Degradation

```
agent-v1 실패 → hybrid-v1
Claude 없음   → rule-based-dev
OpenAI 없음   → RAG 스킵 (나머지 정상 동작)
```

모든 레이어에서 fallback이 보장되어 API 의존성 장애가 서비스 장애로 이어지지 않습니다.

---

## 프로젝트 구조

```
signalmate/
├── landing-page-nextjs/          # Next.js 15 앱 (주 구현체)
│   ├── app/
│   │   ├── page.tsx              # 랜딩 페이지
│   │   ├── analyze/              # 인터랙티브 데모 (/analyze)
│   │   └── api/v1/               # REST + SSE API 라우트
│   ├── components/
│   │   └── analysis-experience   # 4-step 스트리밍 UI
│   └── lib/
│       ├── rule-based-analysis   # 16 패턴 규칙 엔진
│       └── ai/
│           ├── analysis-engine   # 분석 모드 라우터
│           ├── chains/           # Signal Enhancer + Recommendation Generator
│           ├── agent/            # Multi-step tool_use 에이전트
│           ├── embeddings/       # OpenAI + pgvector RAG
│           └── evaluation/       # A/B 비교 평가 파이프라인
├── api-spec.md                   # OpenAPI 명세
├── db-schema-draft.md            # 데이터 모델 설계
└── business-strategy.md          # 수익 모델 / 포지셔닝
```

---

## 실행 방법

### Quick Start (규칙 기반 분석만)

```bash
cd landing-page-nextjs
npm install
cp .env.example .env.local
# Claude API 키 없이도 동작합니다 (USE_DB=false)

npm run dev
# → http://localhost:3000/analyze
```

Claude API 키 없이도 규칙 기반 분석으로 동작합니다.

### 구현 현황

`landing-page-nextjs` 폴더에 전체 MVP가 포함되어 있습니다.

#### 프론트엔드
- 랜딩페이지 (제품 소개, FAQ, 가격, 대기자 등록)
- 4단계 분석 체험 UI (입력 → 맥락 선택 → 로딩 → 결과)
- 추천 메시지 복사 기능

#### 백엔드 API
- `POST /api/v1/conversations` — 대화 생성 (rawText 자동 파싱 지원)
- `POST /api/v1/conversations/:id/analyses` — 분석 실행 (SSE 스트리밍)
- `GET /api/v1/analyses/:id` / `signals` / `recommendations`
- `POST /api/v1/waitlist` — 대기자 등록

#### 분석 엔진
- **규칙 기반**: 답장 흐름, 질문 비율, 미래 언급, 약속 구체성 등 16 패턴
- **하이브리드**: 규칙 결과를 Claude API로 강화 (API 키 없으면 규칙만으로 동작)
- **RAG**: OpenAI 임베딩 기반 유사 대화 검색 (pgvector)

#### 채팅 파서
- 카카오톡 내보내기 (한국어/대괄호/영문 형식)
- 시간+이름, 단순 이름:메시지 형식
- 자동 형식 감지 + sender role 배정

#### 데이터 저장
- `USE_DB=true`: PostgreSQL + Prisma
- `USE_DB=false`: 로컬 JSON 파일 (DB 없이 데모 가능)

### 테스트

```bash
npm test                      # vitest (chat-parser + rule-based-analysis)
```

상세 설정 (PostgreSQL + pgvector, 전체 파이프라인):
→ [landing-page-nextjs/README.md](./landing-page-nextjs/README.md)

---

## 주요 의사결정

| 결정 | 이유 |
|------|------|
| **규칙 엔진을 항상 먼저 실행** | LLM은 규칙 결과를 "강화"만 담당 → API 없이도 서비스 가능, latency 단축 |
| **SSE 스트리밍** | 분석이 3-8초 걸리는 구간에서 첫 결과를 200ms 안에 표시 → 체감 속도 개선 |
| **tool_use structured output** | JSON mode보다 스키마 제약이 강력, 필드별 한국어·글자수 제한 가능 |
| **pgvector (외부 벡터 DB 미사용)** | PostgreSQL 하나로 모든 데이터 관리, 인프라 의존성 최소화 |
| **fire-and-forget embedding** | 분석 응답 속도에 영향 없이 비동기로 벡터 저장 |

---

## 성능 실측

Claude Haiku 4.5 기준, 12개 메시지 대화:

| 모드 | 첫 결과 표시 | 전체 완료 | 토큰 |
|------|-------------|-----------|------|
| Rule-based | 200ms | 200ms | 0 |
| Hybrid (streaming) | 200ms | ~8s | ~6,000 |
| Agent | — | ~44s | ~34,000 |

스트리밍 도입으로 hybrid 모드에서 **첫 결과 표시 시간이 ~8s → ~200ms**로 단축됩니다.
