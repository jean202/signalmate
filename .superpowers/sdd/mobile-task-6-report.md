# Mobile Task 6 Report

## Status

완료. 실제 입력 시작 화면과 최대 20장 캡처/OCR 흐름을 구현했고 focused/full test, TypeScript 검사, whitespace 검사를 통과했다.

## Design Plan

- 대상: 소개팅·썸 초기 대화를 분석하려는 모바일 사용자.
- 첫 화면의 단일 목적: 마케팅 설명 없이 `캡처`/`텍스트`/`만남 후기` 중 실제 입력을 즉시 시작한다.
- 색상: 기존 토큰을 사용했다. 흰 배경 `#FFFFFF`, 따뜻한 중립 표면 `#F7F7F4`, 명령 `#20201D`, 선택/완료 `#287B53`, 주의/재시도 `#A56C12`, 경계 `#D8D6CE`.
- 타입: 시스템 산세리프를 유지하고 제목 22-24pt, 본문 14-15pt, 상태 11-13pt의 기능적 위계를 사용했다. 글자 간격은 변경하지 않았다.
- 레이아웃: 시작 화면은 분할 선택 아래에 선택된 입력 패널과 고정 하단 명령을 둔다. 캡처 화면은 헤더, 추가 명령, 순서형 이미지 목록, OCR 상태/복구 명령, 검수 명령 순서다.
- 시그니처: 각 캡처의 번호, 고정 크기 썸네일, 파일명, OCR 상태, 순서 조정 명령을 한 행에 묶은 처리 목록이다. 선택 순서가 분석 순서라는 사실을 장식 없이 드러낸다.
- 접근성: 모든 명령은 44pt 이상이며 아이콘 버튼에 파일명 기반 접근성 레이블과 disabled 상태를 제공한다.

## Design Critique

- 흰색/따뜻한 중립색 조합은 일반적인 생산성 앱처럼 보일 수 있다. 이를 보완하기 위해 카드 장식이나 큰 소개 문구를 추가하지 않고, 대화 캡처의 순서와 OCR 상태를 첫 정보로 만들었다.
- 녹색과 앰버를 장식에 사용하지 않고 선택/완료와 경고/복구 의미로만 제한했다.
- 320pt 폭에서도 세 아이콘 명령과 고정 썸네일이 유지되도록 세부 텍스트 영역만 축소되게 구성했다. 파일명과 실패 안내는 줄 수를 제한해 행 폭을 밀어내지 않는다.
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
- Android pending result를 hydration 뒤 한 번 소비하며 일반 picker와 같은 변환 경로 및 중복 판정을 사용한다.
- 이미지의 위/아래 이동과 캐시 포함 삭제를 지원한다.
- queued OCR과 failed retry를 `runOcrQueue(..., 2)`로 처리하고 항목별 `extracting`/`complete`/`failed` 상태를 보존한다.
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
- `.superpowers/sdd/mobile-task-6-report.md`

## Self-review

- picker 옵션, 취소 no-op, 남은 제한/20장 상한, 타입/크기 거절, 반환 순서, Android pending, 중복 제외, 캐시 삭제, 이동 경계, 부분 OCR 실패, failed-only retry, 검수 enablement를 테스트로 대조했다.
- 원문 OCR 또는 provider 오류 메시지를 log에 남기는 코드가 없음을 확인했다.
- 실패 오류 코드는 제한된 대문자 코드만 수용하고 그 외에는 `OCR_FAILED`로 정규화한다. 사용자 메시지는 고정된 한국어 안내만 저장/표시한다.
- 새 경로 등록은 `capture`만 추가했으며 Tasks 7/8 경로는 router integration point로만 남겼다.
- 다른 작업의 변경을 되돌리거나 Task 6 범위 밖 제품 파일을 수정하지 않았다.

## Concerns

- `/situation`과 `/ocr-review` 파일은 Tasks 7/8에서 생성될 예정이므로 현재 버튼은 의도된 integration point다.
- 복원된 초안에는 원본 picker URI가 저장되지 않는다. Android pending 중복 판정은 파일명, 크기, MIME fingerprint를 사용하므로 세 값이 완전히 같은 서로 다른 파일은 중복으로 간주될 수 있다.
- Jest 환경의 Lucide `.mjs` 변환 제약 때문에 캡처 화면 테스트는 아이콘 렌더러만 단순 View로 대체한다. 접근성 레이블, 터치 영역, disabled 상태와 실제 화면/Provider 동작은 그대로 테스트한다.
- 네이티브 시뮬레이터 스크린샷 QA는 이번 명령 집합에 포함하지 않았다.
