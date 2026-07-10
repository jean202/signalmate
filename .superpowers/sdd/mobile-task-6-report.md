# Mobile Task 6 Report

## Status

완료. 실제 입력 시작 화면, source identity 기반 최대 20장 직렬 캡처, 2행 이미지 제어, 실패 복구 가능한 OCR 흐름을 구현했고 focused/full test, TypeScript 검사, whitespace 검사를 통과했다.

## Design Plan

- 대상: 소개팅·썸 초기 대화를 분석하려는 모바일 사용자.
- 첫 화면의 단일 목적: 마케팅 설명 없이 `캡처`/`텍스트`/`만남 후기` 중 실제 입력을 즉시 시작한다.
- 색상: 기존 토큰을 사용했다. 흰 배경 `#FFFFFF`, 따뜻한 중립 표면 `#F7F7F4`, 명령 `#20201D`, 선택/완료 `#287B53`, 주의/재시도 `#A56C12`, 경계 `#D8D6CE`.
- 타입: 시스템 산세리프를 유지하고 제목 22-24pt, 본문 14-15pt, 상태 11-13pt의 기능적 위계를 사용했다. 글자 간격은 변경하지 않았다.
- 레이아웃: 시작 화면은 분할 선택 아래에 선택된 입력 패널과 고정 하단 명령을 둔다. 캡처 화면은 헤더, 추가 명령, 순서형 이미지 목록, OCR 상태/복구 명령, 검수 명령 순서다.
- 시그니처: 각 캡처의 번호, 고정 크기 썸네일, 파일명, OCR 상태를 정보 행에 두고 44pt 순서/삭제 명령을 별도 행에 둔 처리 목록이다. 선택 순서가 분석 순서라는 사실을 장식 없이 드러낸다.
- 접근성: 모든 명령은 44pt 이상이며 아이콘 버튼에 파일명 기반 접근성 레이블과 disabled 상태를 제공한다.

## Design Critique

- 흰색/따뜻한 중립색 조합은 일반적인 생산성 앱처럼 보일 수 있다. 이를 보완하기 위해 카드 장식이나 큰 소개 문구를 추가하지 않고, 대화 캡처의 순서와 OCR 상태를 첫 정보로 만들었다.
- 녹색과 앰버를 장식에 사용하지 않고 선택/완료와 경고/복구 의미로만 제한했다.
- 320pt 폭에서는 정보 행에 182pt의 읽기 영역을 남기고 세 아이콘 명령을 별도 행으로 분리했다. 파일명과 실패 안내는 줄 수를 제한해 목록 폭을 밀어내지 않는다.
- 중첩 카드, gradient, emoji, 8pt 초과 radius, 과대 제목을 제거했다.

## RED / GREEN

### RED

1. `cd signalmate-app && npm test -- app/__tests__/index.test.tsx`
   - Exit 1.
   - 3 tests failed because the existing marketing screen had no `캡처`, `텍스트`, `만남 후기` controls.
2. `cd signalmate-app && npm test -- app/__tests__/capture.test.tsx`
   - Exit 1.
   - Suite failed because `app/capture.tsx` did not exist.

### GREEN

1. `cd signalmate-app && npm test -- app/__tests__/index.test.tsx app/__tests__/capture.test.tsx && npm run typecheck`
   - Exit 0.
   - 2 suites, 11 tests passed; `tsc --noEmit` passed.
2. `cd signalmate-app && npm test`
   - Exit 0.
   - 12 suites, 83 tests passed, 0 snapshots.
3. `cd signalmate-app && npm run typecheck`
   - Exit 0.
4. `git diff --check`
   - Exit 0, no output.

## Implemented Behavior

- 시작 화면에서 주 입력을 초안에 저장하고 선택별 실제 입력 패널/다음 경로를 제공한다.
- 텍스트 입력을 `draft.pastedText`에 즉시 저장하며 비어 있으면 다음 명령을 비활성화한다.
- picker에 이미지 전용 다중 선택, 남은 장수, 선택 순서, 원본 품질 옵션을 정확히 전달한다.
- PNG/JPEG/WEBP/GIF와 10MB 이하만 허용하고 MIME이 없을 때만 확장자로 추론한다. HEIC/AVIF는 구체적으로 안내한다.
- 허용 자산은 반환 순서대로 앱 캐시에 복사하고 20장을 넘기지 않는다.
- Android pending result를 hydration 뒤 한 번 소비하며 일반 picker와 같은 직렬 변환 경로를 사용한다. 중복은 persisted `sourceKey`의 assetId 또는 source URI로 판정한다.
- 이미지의 위/아래 이동과 캐시 포함 삭제를 지원한다.
- queued OCR과 failed retry를 `runOcrQueue(..., 2)`로 처리하고 항목별 `extracting`/`complete`/`failed` 상태를 보존한다.
- CaptureScreen이 OCR 중 unmount되면 active `extracting` 항목을 Provider draft에서 `queued`로 복구하고 늦은 worker 결과를 무시한다.
- 개별 OCR 실패는 다른 성공 결과를 제거하지 않는다. 재시도는 failed 항목만 대상으로 한다.
- 하나 이상의 complete 항목이 있을 때만 `/ocr-review` 검수를 허용한다.
- `_layout.tsx`에는 이번 작업에서 실제 생성된 `capture` 화면만 등록했다.

## Files

- `signalmate-app/app/index.tsx`
- `signalmate-app/app/capture.tsx`
- `signalmate-app/components/capture/image-queue-list.tsx`
- `signalmate-app/app/__tests__/index.test.tsx`
- `signalmate-app/app/__tests__/capture.test.tsx`
- `signalmate-app/app/_layout.tsx`
- `signalmate-app/lib/analysis/types.ts`
- `signalmate-app/lib/analysis/__tests__/draft-storage.test.ts`
- `.superpowers/sdd/mobile-task-6-report.md`

## Self-review

- picker 옵션, 취소 no-op, 남은 제한/20장 상한, 타입/크기 거절, 반환 순서, Android pending, sourceKey 중복 제외, 캐시 삭제, 이동 경계, 부분 OCR 실패, failed-only retry, unmount queued 복구, 검수 enablement를 테스트로 대조했다.
- 원문 OCR 또는 provider 오류 메시지를 log에 남기는 코드가 없음을 확인했다.
- 실패 오류 코드는 제한된 대문자 코드만 수용하고 그 외에는 `OCR_FAILED`로 정규화한다. 사용자 메시지는 고정된 한국어 안내만 저장/표시한다.
- 새 경로 등록은 `capture`만 추가했으며 Tasks 7/8 경로는 router integration point로만 남겼다.
- 다른 작업의 변경을 되돌리거나 Task 6 범위 밖 제품 파일을 수정하지 않았다.

## Concerns

- `/situation`과 `/ocr-review` 파일은 Tasks 7/8에서 생성될 예정이므로 현재 버튼은 의도된 integration point다.
- 수정 전 저장된 이미지에는 optional `sourceKey`가 없어 source identity 중복 방지가 소급 적용되지 않는다.
- `assetId`가 없는 provider 자산은 source URI를 identity로 사용하므로 provider가 같은 자산에 새 URI를 발급하면 동일성을 판별할 수 없다.
- Jest 환경의 Lucide `.mjs` 변환 제약 때문에 캡처 화면 테스트는 아이콘 렌더러만 단순 View로 대체한다. 접근성 레이블, 터치 영역, disabled 상태와 실제 화면/Provider 동작은 그대로 테스트한다.
- 네이티브 시뮬레이터 스크린샷 QA는 이번 명령 집합에 포함하지 않았다.

## Review Fix

### Scope

- picker와 Android pending 결과의 자산 처리를 단일 promise queue로 직렬화했다.
- picker launch부터 자산 admission 완료까지 즉시 ref lock을 유지해 재진입을 막았다.
- React render/effect를 기다리지 않는 `imagesRef`를 admission, 이동, 삭제, OCR 상태의 즉시 source of truth로 사용했다.
- capacity를 캐시 복사 전에 계산하며, 방어적으로 복사됐지만 admission되지 않은 URI는 즉시 삭제한다.
- `ImageDraftItem.sourceKey?: string`을 추가했다. 새 자산은 `assetId`가 있으면 `asset:<id>`, 없으면 `uri:<source-uri>`를 저장한다.
- 캐시 삭제 실패 시 draft 항목과 URI를 유지하고 고정된 안전한 한국어 오류만 표시한다.
- 캡처 목록을 정보 행과 44pt 제어 행으로 분리해 320pt 폭에서 파일 정보가 제어열과 폭을 경쟁하지 않게 했다.
- picker 완료 전 unmount되면 로컬 state와 draft를 갱신하지 않고 이미 복사된 캐시를 정리한다. OCR 중 unmount되면 active 항목을 `queued`로 복구하고 늦은 결과의 draft/local state 갱신을 막는다.

### RED

Command:

`cd signalmate-app && npm test -- app/__tests__/capture.test.tsx`

Result: Exit 1. 15 tests 중 9 passed, 6 failed.

- picker 재진입으로 `launchImageLibraryAsync`가 2회 호출됐다.
- 이름/크기/MIME이 같은 다른 URI 2개 중 1개만 수용됐다.
- 복원된 `sourceKey`와 같은 `assetId` pending 자산이 다시 추가됐다.
- `deleteCachedImage` 실패 뒤 draft 항목이 제거됐다.
- 정보와 3개 제어가 같은 수평 행에 있어 구조 testID를 찾지 못했다.
- picker가 unmount 뒤 resolve되면 캐시 복사가 실행됐다.

### GREEN

1. `cd signalmate-app && npm test -- app/__tests__/capture.test.tsx`
   - Exit 0. 1 suite, 15 tests passed.
2. `cd signalmate-app && npm test -- app/__tests__/index.test.tsx app/__tests__/capture.test.tsx lib/analysis/__tests__/draft-storage.test.ts && npm run typecheck`
   - Exit 0. 3 suites, 22 tests passed; `tsc --noEmit` passed.
3. `cd signalmate-app && npm test`
   - Exit 0. 12 suites, 91 tests passed.
4. `cd signalmate-app && npm run typecheck`
   - Exit 0.
5. `git diff --check`
   - Exit 0, no output.

### Regression Coverage

- deferred picker/pending overlap, 20장 상한, picker 재진입 방지, 중복/overflow 캐시 copy 없음
- 동일 메타데이터지만 다른 source URI인 자산 2개 수용
- persisted `assetId` pending 중복 거부와 draft storage `sourceKey` round trip
- 누락 `fileSize` 거부와 고정 안내
- 부분 cache copy 실패 후 성공 항목 순서/상태 보존
- cache delete 성공 시 draft 제거, 실패 시 draft/URI 유지
- picker unmount guard, OCR unmount queued 복구/late result guard, raw OCR logging 없음
- 정보/제어 두 행, 항목 148pt 최소 높이, 아이콘 버튼 44x44pt

### 320pt Self-review

- 화면 좌우 20pt padding을 제외한 목록 폭은 280pt다.
- 정보 행의 고정 폭은 index 24pt + thumbnail 54pt + gap 20pt = 98pt이며 파일 정보에 182pt가 남는다.
- 파일명은 최대 2줄, 실패 안내는 최대 2줄이고 detail 영역은 `flex: 1`, `minWidth: 0`이라 긴 단어가 제어 영역을 밀어내지 않는다.
- 이동/삭제 버튼은 별도 행에 44x44pt로 배치되어 정보 행 폭을 소비하지 않는다.
- 항목 최소 높이 148pt는 68pt 정보 행 + 44pt 제어 행 + 간격/여백을 안정적으로 수용한다.
- 별도 카드나 nested card를 추가하지 않고 기존 구분선 목록을 유지했다.

### Remaining Concerns

- 수정 전 저장된 이미지에는 optional `sourceKey`가 없다. 기존 draft 복원은 유지되지만 그 이미지에 대해서는 source identity 기반 중복 방지가 소급 적용되지 않는다.
- `assetId`가 없는 provider 자산은 요구사항대로 source URI를 identity로 사용한다. provider가 동일 자산에 다른 URI를 발급하면 동일성을 판별할 추가 메타데이터가 없다.
- 네이티브 시뮬레이터 screenshot은 실행하지 않았으며 320pt 검증은 고정 치수 산정과 구조/style 회귀 테스트로 수행했다.

## Final Fix: OCR Unmount Recovery

### RED

Command:

`cd signalmate-app && npm test -- app/__tests__/capture.test.tsx -t "CaptureScreen만 unmount"`

Result: Exit 1. CaptureScreen 제거 뒤 Provider probe가 `queued` 대신 `extracting`을 유지했다.

### Implementation

- worker가 `extracting`으로 전환한 이미지 ID를 `activeExtractionIdsRef`에 기록한다.
- 정상 success/failure는 `finally`에서 ID를 제거한다.
- CaptureScreen cleanup은 mounted guard를 먼저 닫고 active ID 중 여전히 `extracting`인 Provider draft 항목만 `queued`로 동기 복구한다.
- cleanup은 active set을 비우고 mounted guard를 닫는다. 따라서 늦은 resolve/reject는 복구 상태나 로컬 state를 덮어쓰지 않는다.
- Provider와 draft probe를 유지한 harness에서 CaptureScreen만 제거/재마운트해 두 번째 OCR 완료까지 검증한다.
- OCR 원문 또는 provider 오류를 log에 남기지 않는다.

### GREEN

1. `cd signalmate-app && npm test -- app/__tests__/capture.test.tsx -t "CaptureScreen만 unmount"`
   - Exit 0. 1 passed, 15 skipped.
2. `cd signalmate-app && npm test -- app/__tests__/capture.test.tsx`
   - Exit 0. 1 suite, 16 tests passed.
3. `cd signalmate-app && npm test`
   - Exit 0. 12 suites, 92 tests passed.
4. `cd signalmate-app && npm run typecheck`
   - Exit 0.
5. `git diff --check`
   - Exit 0, no output.
