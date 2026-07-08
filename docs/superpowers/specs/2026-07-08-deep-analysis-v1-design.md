# 심화 분석 v1 설계 (Deep Analysis v1)

날짜: 2026-07-08
상태: 구현 완료 (2026-07-08 플랜 실행)

## 배경과 결정

현재 무료 데모가 신호 카드·메시지 추천까지 전부 제공하고 있어 유료 "심화 분석 보기 ₩3,900"에 실체가 없다. 결정 사항:

- **현재 출력(신호 그룹, 근거 카드, 추천 3종)은 전부 무료로 유지한다.**
- 심화 분석 v1은 **유사 사례 비교 + 행동 시나리오 시뮬레이션 + 초안 메시지 검증**으로 새로 구성한다.
- **로그인 전제**: 심화 리포트는 로그인 사용자 전용. 결제 시 temporary 대화를 `saved`로 승격한다.
- 유사 사례 콜드스타트는 **큐레이션 시드 코퍼스**(50~100건, LLM 보조 제작 + 수동 검수)로 해결한다.
- v2 후보(이번 범위 아님): 관계 타임라인 추이, 상대 프로파일 심층분석, 후속 질문 크레딧.

## 범위

### 포함 (v1)

1. **유사 사례 비교**: 시드 코퍼스 대상 pgvector 검색 → 패턴 요약 + 각색된 사례 2~3개(흐름/결말/교훈).
2. **행동 시나리오 시뮬레이션**: 행동 경로 2~3개(예: 가볍게 보낸다 / 기다린다 / 약속 제안) 각각에 예상 전개·리스크·권장 메시지·타이밍·확신도.
3. **초안 메시지 검증**: 사용자가 입력한 초안에 예상 반응·리스크 수준·개선안·근거 피드백. 결제당 5회.

### 제외

- 구독 플랜 전용 기능(타임라인 저장 등), 후속 질문 챗, 상대 프로파일링.
- 무료 결과의 축소·게이팅(무료는 현행 유지).

## 아키텍처

결제 확인 후 단일 리포트 생성 체인(A안). 기존 하이브리드 파이프라인의 패턴(SSE 스트리밍, 구조화 JSON, 견고한 파싱, 단계별 fallback, 토큰 트래킹)을 재사용한다.

### 데이터 모델 (Prisma migration 2개)

```prisma
model DeepReport {
  id               String   @id @default(uuid())
  analysisId       String   @unique
  userId           String
  status           String   // generating | completed | failed
  similarCasesJson Json?
  scenariosJson    Json?
  draftCheckCount  Int      @default(0)
  createdAt        DateTime @default(now())
  completedAt      DateTime?
}

model ReferenceCase {
  id            String @id @default(uuid())
  summaryText   String
  situationType String // blind_date | dating_app | after_first_date | cooling_down | ...
  outcomeLabel  String // progressed | stalled | ended
  lesson        String
  // pgvector embedding 컬럼(raw SQL migration으로 추가, 기존 임베딩 패턴 준수)
}
```

- `ReferenceCase`는 사용자 `Conversation`과 분리해 실사용 데이터 오염을 막는다.
- 기존 `lib/ai/embeddings/similarity-search.ts`를 ReferenceCase 테이블도 조회할 수 있게 일반화한다.

### API (3개, 모두 requireAuth + 결제 검증)

| 엔드포인트 | 동작 |
| --- | --- |
| `POST /api/v1/analyses/{analysisId}/deep-report` | 결제 검증(해당 analysisId의 단건 Payment 또는 활성 Subscription) → SSE 스트리밍 생성 → 완료 시 DeepReport 저장. 멱등: completed면 저장본 반환, failed면 무료 재생성 |
| `GET /api/v1/analyses/{analysisId}/deep-report` | 본인 소유 리포트 재열람 |
| `POST /api/v1/analyses/{analysisId}/deep-report/draft-check` | `{ draftText }` → 검증 결과 반환. `draftCheckCount` 증가, 5회 초과 시 402/limit 에러. 결과 비저장 |

### LLM 체인 (신규 2개, `lib/ai/chains/`)

1. **deep-report-generator**
   - 입력: 기존 분석 결과(신호·recommendedAction·situationContext·메시지 요약) + RAG 인사이트(`insight-builder` 재사용)
   - 출력(구조화 JSON):
     - `similarCases`: `{ patternSummary, cases: [{ situationType, flowSummary, outcome, lesson }] }`
     - `scenarios`: `[{ actionLabel, expectedFlow, risk, bestMessage, timing, confidence }]` (2~3개)
   - fallback: LLM 실패 시 유사 사례 원자료(검색 결과 그대로) + 룰 기반 시나리오 골격(recommendedAction 기반 1개)으로 부분 리포트 생성
2. **draft-checker**
   - 입력: 초안 텍스트 + 분석 컨텍스트 요약
   - 출력: `{ predictedReaction, riskLevel, risks[], improvedDraft, rationale }`
   - fallback: LLM 실패 시 에러 반환(횟수 차감 없음)

### 결제·UX 플로우

1. 결과 페이지 하단에 **잠금 프리뷰 카드**: 심화 리포트가 제공하는 것(유사 사례·시나리오·초안 검증)을 요약해 보여주고 기존 `PaymentButton` 배치.
2. 비로그인 상태에서 결제 버튼 클릭 → 로그인 유도. 로그인 후 temporary 대화·분석을 `saved`로 승격(결제 전 승격, 실패 시 결제 진행 불가).
3. `Payment` 레코드에 `analysisId`를 저장하고, 결제 success 페이지는 `/report/{analysisId}`로 리다이렉트.
4. `/report/[analysisId]` 페이지: 리포트 스트리밍 뷰 + 초안 검증 입력창(남은 횟수 표시) + 재열람.

### 시드 코퍼스 제작 (learning 트랙 스타일)

- `learn:seed-gen`: 유형(situationType) × 결말(outcomeLabel) 조합별로 LLM이 사례 초안 JSON 생성 → `learning/seeds/`에 저장.
- 수동 검수 후 `learn:seed-embed`: 임베딩 생성·ReferenceCase 업서트.
- 목표 50~100건. 리포트에는 각색된 요약으로만 노출(개별 실사례 인용 형태 금지).

## 에러 처리

- 유사 사례 검색 결과 0건 → 유사 사례 섹션 생략, 시나리오만 제공(리포트 유효).
- 리포트 생성 중단/실패 → `status=failed`, 사용자는 추가 과금 없이 재시도.
- OpenAI(임베딩) 불가 시 → 유사 사례 섹션 생략 폴백과 동일 경로.
- draft-check LLM 실패 → 횟수 차감 없이 에러 안내.

## 테스트

- 체인: JSON 파싱 성공/실패/부분 응답, fallback 경로.
- 라우트: 미로그인 401, 미결제 402/403, 멱등(completed 재요청), draft-check 횟수 제한, 소유자 검증.
- similarity-search 일반화: ReferenceCase 조회 회귀 테스트.
- 시드 스크립트: 생성 JSON 스키마 검증.

## 성공 기준

- 결제 → 리포트 생성 → 재열람 → 초안 검증 5회 제한까지 E2E로 동작.
- LLM/임베딩 장애 시에도 결제 사용자가 빈 화면을 보지 않는다(부분 리포트 또는 재시도 안내).
- 리포트 1건 생성 원가(LLM 호출)가 판매가 대비 통제 가능한 수준(호출 수 고정: 리포트 1~2회 + 검증 최대 5회).
