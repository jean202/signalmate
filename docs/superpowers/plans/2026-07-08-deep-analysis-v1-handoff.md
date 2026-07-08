# Deep Analysis v1 — Codex 인계 가이드

작성: 2026-07-08 (Claude 세션 크레딧 제한으로 중단, Codex가 이어서 구현)

## 무엇을 하는 작업인가

유료 심화 분석(₩3,900 단건/구독): 유사 사례 비교(RAG) + 행동 시나리오 시뮬레이션 + 초안 메시지 검증 5회.

- **스펙**: `docs/superpowers/specs/2026-07-08-deep-analysis-v1-design.md`
- **구현 플랜(태스크별 전체 코드 포함)**: `docs/superpowers/plans/2026-07-08-deep-analysis-v1.md` ← 이것만 따라가면 됨

## 현재 상태

- **브랜치**: `feature/deep-analysis-v1` (이 브랜치에서 계속 작업, main 머지는 사용자 승인 후)
- **완료: Task 1~4** (각 태스크당 커밋 1개)
  - Task 1 `58592ee`: Prisma `DeepReport`/`ReferenceCase` 모델 + 마이그레이션 `20260708030255_...` (스펙·품질 리뷰 승인됨)
  - Task 2 `7547eae`: `lib/deep-report.ts` 타입 + fallback 빌더 + 테스트 (리뷰 승인됨)
  - Task 3 `03ca8e1`: `lib/ai/embeddings/reference-search.ts` 검색 함수 + 테스트
  - Task 4 `1f49cc3`: `lib/ai/schemas/deep-report-schema.ts` + `lib/ai/prompts/deep-report-prompt.ts`
- **남음: Task 5~14** — 플랜 문서의 해당 섹션에 파일별 전체 코드가 있음. 순서대로 진행.
- 현재 테스트 206개 전부 통과, `tsc --noEmit` 클린.

## 작업 규칙 (플랜 Global Constraints 요약 + 추가)

1. 모든 명령은 `landing-page-nextjs/`에서. **테스트·tsc 전에 반드시**:
   ```bash
   export PATH="$HOME/.nvm/versions/node/v22.21.0/bin:$PATH"   # vitest는 node 22 필요 (기본 node 18은 기동 실패)
   ```
2. 태스크당: 테스트 먼저(TDD) → 구현 → `npx vitest run` 전체 회귀 + `npx tsc --noEmit` → 커밋(플랜의 커밋 메시지 사용) → 플랜 문서의 해당 체크박스 `- [x]`로 갱신.
3. 사용자-facing copy 한국어. LLM 호출은 fallback + 견고한 파싱 유지. draft-check 실패 시 횟수 차감 금지.
4. 무료 결과(신호 카드·추천) 축소 금지.

## 리뷰·구현 중 발견된 함정 (플랜 본문보다 우선)

1. **vitest mock 호이스팅**: 테스트가 **정적 import**로 대상 모듈을 불러오는 경우, `const xMock = vi.fn()` + `vi.mock(...)` 조합은 `Cannot access before initialization`으로 깨진다. 이때는:
   ```ts
   const { xMock } = vi.hoisted(() => ({ xMock: vi.fn() }));
   ```
   - **Task 5·6 테스트가 이 케이스** (플랜 코드가 정적 import 사용) — 플랜의 mock 선언부를 `vi.hoisted`로 바꿔서 작성할 것. Task 3에서 실제로 이 문제를 만나 같은 방식으로 고쳤음(`lib/ai/embeddings/__tests__/reference-search.test.ts` 참고).
   - Task 8·9 테스트는 `await import("../route")` 동적 import라 그대로 괜찮음.
2. **Task 5·6 (체인)**: `lib/ai/anthropic-client.ts`의 `getInferenceTimeoutMs` / `buildInferenceOptions` / `resolveMaxTokens`와 `lib/ai/token-tracker.ts`의 `trackUsage` 시그니처를 **기존 체인 `lib/ai/chains/signal-enhancer.ts`와 대조**해서 맞출 것. 단계 이름이 union 타입이면 `"deep_report"`, `"draft_check"`를 union에 추가.
3. **Task 8**: `getAnalysis`/`getConversation`이 `lib/store.ts`에서 re-export되는지 확인, 없으면 기존 re-export 패턴대로 추가. `isDbEnabled()`도 Task 7에서 store.ts에 추가해야 함(플랜 Task 7 Step 5).
4. **Task 13 (시드 임베딩)**: `ReferenceCase.embedding`이 `Unsupported("vector(1536)")`라 **Prisma Client로 insert 불가** — 플랜대로 raw SQL(`$executeRawUnsafe`) 사용 (플랜 코드에 이미 반영돼 있음).
5. **로컬 DB drift**: 로컬 `signalmate` DB는 pgvector 버전 차이로 `prisma migrate dev`가 reset을 요구함. Task 1의 마이그레이션은 **파일만 생성, 로컬 DB 미적용**. Task 14 E2E 전에 사용자 동의 하에 둘 중 하나:
   - `npx prisma migrate reset --force` (로컬 dev DB, 데이터 없음) 후 `migrate dev`
   - 또는 `npx prisma db execute --file prisma/migrations/20260708030255_add_deep_report_and_reference_cases/migration.sql` 후 `npx prisma migrate resolve --applied 20260708030255_add_deep_report_and_reference_cases`
6. **Task 12 UI**: fallback 리포트는 `bestMessage`가 빈 문자열일 수 있음 — 플랜 페이지 코드의 조건부 렌더(`{scenario.bestMessage ? ... : null}`)를 유지할 것. fallback 여부는 콘텐츠가 아니라 SSE `complete` 이벤트의 `fallback` 필드로 전달됨.
7. **포트 3000 충돌**: 다른 프로젝트(threadkeeper)가 3000을 쓸 수 있음. dev 스크립트는 PORT 오버라이드 가능(`PORT=3100 npm run dev`).

## 완료 후

1. `npx vitest run` + `npx tsc --noEmit` 전체 통과 확인 (플랜 Final Verification).
2. 플랜 체크박스 전부 `[x]`, 스펙 문서 상태줄 갱신 (플랜 Task 14).
3. main 머지·push는 하지 말고 사용자에게 보고 (브랜치 그대로 두기).
4. 시드 실제 생성(`learn:seed-gen`/`learn:seed-embed`)은 API 키 필요한 수동 단계 — 사용자에게 안내만.

## Codex 시작 프롬프트 (사용자용)

```
feature/deep-analysis-v1 브랜치에서 심화 분석 v1 구현을 이어서 해줘.
먼저 docs/superpowers/plans/2026-07-08-deep-analysis-v1-handoff.md 를 읽고,
docs/superpowers/plans/2026-07-08-deep-analysis-v1.md 의 Task 5부터 순서대로 구현해.
태스크당 TDD로 진행하고 커밋 하나씩, 전체 테스트와 tsc를 매번 확인해.
```
