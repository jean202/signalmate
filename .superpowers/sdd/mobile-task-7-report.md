# Mobile Task 7 Report

## 구현 요약

- `ocr-review` 화면에서 완료된 OCR 이미지만 순서대로 탐색하고, 이미지별 `editedText` 수정과 `reviewed` 완료 처리를 구현했다.
- 모든 완료 이미지가 검수된 경우에만 `/situation` 이동 명령이 활성화된다.
- 개인정보 치환 규칙의 추가, 삭제, 일반 문자열 일치 건수 미리보기, 전체 적용을 구현했다.
- 전체 적용은 완료 이미지의 `editedText`와 `pastedText`에만 반영하며 `extractedText`는 보존한다.
- 연속 캡처 중복 후보를 체크박스로 표시하고 `excludedDuplicateIds`만 토글한다.
- `ocr-review` 라우트를 등록했다. 아직 없는 `situation` 및 `review` 화면은 추가하지 않았다.
- Expo Web에서 모듈 import만으로 `Directory`를 생성하던 이미지 캐시를 지연 생성으로 바꿔 검수 화면의 브라우저 확인을 가능하게 했다.

## TDD 기록

1. 신규 화면과 컴포넌트가 없는 상태에서 집중 테스트를 실행해 두 모듈을 찾지 못하는 실패를 확인했다.
2. 검수 완료, 원본 불변, complete 필터링, 이전/다음, 다음 단계 조건, 전체 치환 범위, 중복 선택 토글 테스트를 먼저 작성했다.
3. 빈 원문 거부, 치환 일치 건수, 규칙 추가/삭제/적용 테스트를 먼저 작성했다.
4. 웹 렌더 오류를 재현한 뒤 이미지 캐시의 import 시 파일시스템 객체 생성 금지 테스트가 `Expected: 0, Received: 1`로 실패하는 것을 확인하고 지연 생성을 구현했다.

## UI 및 접근성 확인

- 기존 theme, `ScreenShell`, `BottomAction`, lucide 아이콘을 사용했다.
- 미리보기는 `aspectRatio: 4 / 3`, 편집기는 `minHeight: 220`으로 고정했다.
- 아이콘 버튼, 입력, 체크박스 행, 주요 명령은 최소 44pt 터치 영역을 사용한다.
- 320 x 700 웹 뷰포트에서 `scrollWidth`와 `clientWidth`가 모두 320이었고, 확인한 모든 입력 및 버튼 높이는 44px였다.
- 원문, OCR 텍스트, 치환 전 개인정보를 console에 기록하는 코드는 추가하지 않았다.

## 검증 결과

- 집중 테스트: 3 suites, 15 tests passed
- 전체 테스트: 14 suites, 103 tests passed
- `npm run typecheck`: passed, TypeScript errors 0
- `git diff --check`: passed
- Expo Web: `http://localhost:8091/ocr-review`에서 320pt 레이아웃 확인

## 남은 위험

- iOS와 Android 실기기에서 키보드, 큰 글자, 긴 OCR 원문을 포함한 수동 검증은 수행하지 않았다.
- `/situation` 화면은 작업 8 범위이므로 현재 다음 단계 버튼은 라우팅 계약만 구현한다.
- Expo 시작 시 설치 버전 권고 경고(`expo`, `expo-router`)가 표시되지만 이번 작업에서는 의존성 버전을 변경하지 않았다.
