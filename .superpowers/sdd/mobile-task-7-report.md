# Mobile Task 7 Report

## 구현 요약

- `ocr-review` 화면에서 완료된 OCR 이미지만 순서대로 탐색하고, 이미지별 `editedText` 수정과 `reviewed` 완료 처리를 구현했다.
- 모든 완료 이미지가 검수된 경우에만 `/situation` 이동 명령이 활성화된다.
- 개인정보 치환 규칙의 추가, 삭제, 일반 문자열 일치 건수 미리보기, 전체 적용을 구현했다.
- 전체 적용은 완료 이미지의 `editedText`와 `pastedText`에만 반영하며 `extractedText`는 보존한다.
- 연속 캡처 중복 후보를 체크박스로 표시하고 `excludedDuplicateIds`만 토글한다.
- 중복 후보 ID는 이미지 ID, 원본 줄 인덱스, 정규화된 줄 내용을 함께 사용한다. 최종 병합은 현재 complete 이미지에서 후보를 다시 계산하고 현재도 유효한 제외 ID만 적용한다.
- 수동 편집과 전체 치환 후에는 전체 이미지 경계의 현재 후보 집합과 제외 목록의 교집합만 유지해 양쪽 경계 중 어느 쪽이 바뀌어도 stale 선택이 남지 않는다.
- 치환은 모든 저장 규칙의 기존 replacement 구간을 먼저 보호하고 원문을 한 번만 스캔해, 같은 실행과 반복 실행 모두에서 규칙 간 연쇄 적용을 막는다.
- 새 규칙의 source가 저장된 replacement와 겹치거나 새 replacement가 자신 또는 저장된 source를 포함하면 구체적인 한국어 안내와 함께 추가를 차단한다.
- `ocr-review` 라우트를 등록했다. 아직 없는 `situation` 및 `review` 화면은 추가하지 않았다.
- Expo Web에서 모듈 import만으로 `Directory`를 생성하던 이미지 캐시를 지연 생성으로 바꿔 검수 화면의 브라우저 확인을 가능하게 했다.

## TDD 기록

1. 신규 화면과 컴포넌트가 없는 상태에서 집중 테스트를 실행해 두 모듈을 찾지 못하는 실패를 확인했다.
2. 검수 완료, 원본 불변, complete 필터링, 이전/다음, 다음 단계 조건, 전체 치환 범위, 중복 선택 토글 테스트를 먼저 작성했다.
3. 빈 원문 거부, 치환 일치 건수, 규칙 추가/삭제/적용 테스트를 먼저 작성했다.
4. 웹 렌더 오류를 재현한 뒤 이미지 캐시의 import 시 파일시스템 객체 생성 금지 테스트가 `Expected: 0, Received: 1`로 실패하는 것을 확인하고 지연 생성을 구현했다.
5. 리뷰 수정 전 테스트에서 중복 선택 후 삽입한 `나: 새 앞줄`이 병합 결과에서 사라지는 실패를 확인했다.
6. 치환 테스트에서 `민수와 친구`가 `[상대]와 [상대]`로 연쇄 치환되고, 재적용 결과가 `[[민수]]`가 되는 실패를 확인했다.
7. 상태 누적 화면 harness로 중복 선택 후 앞줄 편집과 전체 치환 2회 적용을 연속 검증했다.
8. 이미지 2 중복 선택 후 이미지 1 마지막 줄 수정, 이미지 1 삭제, 이미지 1 경계 치환, 임의 ID 주입 시 이미지 2 첫 줄이 사라지는 실패를 각각 확인했다.
9. 상태 누적 화면 harness로 이미지 1 경계 수정 후 이미지 2 제외 선택이 정리되고 최종 병합에 메시지가 유지되는 것을 검증했다.
10. `민수→친구`, `친구→[상대]` 규칙을 반복 적용하면 첫 결과의 `친구`가 두 번째 적용에서 `[상대]`로 바뀌는 실패를 확인했다.
11. 상태 누적 화면에서 저장된 교차 규칙을 두 번 적용하고, 컴포넌트에서 source/replacement 교차 충돌 두 종류가 차단되는지 검증했다.

## UI 및 접근성 확인

- 기존 theme, `ScreenShell`, `BottomAction`, lucide 아이콘을 사용했다.
- 미리보기는 `aspectRatio: 4 / 3`, 편집기는 `minHeight: 220`으로 고정했다.
- 아이콘 버튼, 입력, 체크박스 행, 주요 명령은 최소 44pt 터치 영역을 사용한다.
- 320 x 700 웹 뷰포트에서 `scrollWidth`와 `clientWidth`가 모두 320이었고, 확인한 모든 입력 및 버튼 높이는 44px였다.
- 원문, OCR 텍스트, 치환 전 개인정보를 console에 기록하는 코드는 추가하지 않았다.

## 검증 결과

- 집중 테스트 명령: `npm test -- lib/analysis/__tests__/input-builder.test.ts components/review/__tests__/replacement-rule-editor.test.tsx app/__tests__/ocr-review.test.tsx`
- 집중 테스트: 3 suites, 45 tests passed
- 관련 회귀 테스트: 9 suites, 86 tests passed
- 전체 테스트: 14 suites, 118 tests passed
- `npm run typecheck`: passed, TypeScript errors 0
- `git diff --check`: passed
- Expo Web: `http://localhost:8091/ocr-review`에서 320pt 레이아웃 확인

## 남은 위험

- iOS와 Android 실기기에서 키보드, 큰 글자, 긴 OCR 원문을 포함한 수동 검증은 수행하지 않았다.
- `/situation` 화면은 작업 8 범위이므로 현재 다음 단계 버튼은 라우팅 계약만 구현한다.
- Expo 시작 시 설치 버전 권고 경고(`expo`, `expo-router`)가 표시되지만 이번 작업에서는 의존성 버전을 변경하지 않았다.
