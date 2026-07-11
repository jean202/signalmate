# Mobile Task 8 Report

## 범위

- `situation` 화면에 관계 단계, 만난 경로, GuidedAnswers 선택 항목과 2,000자 자유 입력을 구현했다.
- `review` 화면에 현재 입력 요약, 검증 오류별 수정 명령, 정보 추가 명령을 구현했다.
- 대화 생성, 생성 스냅샷 보존, SSE 분석, 결과 저장과 `/result` 이동을 연결했다.
- `situation`과 `review`를 Expo Router 스택에 등록했다.
- 작업 9 범위인 결과 화면 교체와 기존 `analyze`/API 모듈 삭제는 수행하지 않았다.

## 주요 계약

- 관계 단계와 만난 경로를 필수로 두고 나머지 GuidedAnswers 값을 웹 계약과 동일한 값으로 저장한다.
- `capture`/`text`의 기본 `inputFocus`는 `chat`, `meeting_note`는 `meeting_note`다. 사용자가 선택한 값은 `inputFocusTouched`로 구분해 재방문 시 보존한다.
- 자유 입력은 상태에 최대 2,000자만 저장하며 현재 글자 수와 초과 안내를 표시한다.
- 요약은 현재 병합 대화와 현재 중복 후보를 다시 계산하므로 stale 제외 ID를 세지 않는다.
- 검증 오류는 `/`, `/ocr-review`, `/situation` 중 실제 수정 가능한 화면 명령과 연결한다.
- submit 순서는 요청 생성, 대화 생성, draft 저장, SSE 분석, 결과 저장, `/result` 교체다.
- 같은 submit에서는 방금 생성한 로컬 conversation을 사용하고, 재시도에서는 Provider의 `createdConversation`을 사용한다.
- running ref로 연속 탭을 막고 mounted ref로 unmount 뒤 상태 및 라우터 갱신을 막는다.
- 실패 상세와 원문은 화면이나 console에 기록하지 않는다.

## TDD 기록

1. `situation.test.tsx`를 먼저 추가하고 `Cannot find module '../situation'` 실패를 확인했다.
2. 상황 설문과 draft 메타데이터를 구현한 뒤 상황 테스트 7개 통과를 확인했다.
3. `review.test.tsx`를 먼저 추가하고 `Cannot find module '../review'` 실패를 확인했다.
4. 입력 요약과 분석 실행을 구현했다. 첫 GREEN 실행에서 테스트 픽스처의 한글 길이 기대값 오류 1건을 확인해 31자를 실제 32자로 수정했다.
5. 집중 테스트 17개와 타입 검사 통과 후 전체 회귀 테스트를 실행했다.

## 검증 결과

- 집중 테스트: 2 suites, 17 tests passed
- 전체 `npm test`: 16 suites, 135 tests passed
- `npm run typecheck`: 통과
- `git diff --check`: 통과

## 남은 위험

- 실제 iOS/Android 기기의 키보드, 시스템 큰 글자, VoiceOver/TalkBack 동작은 자동화 테스트 범위 밖이라 기기 검증이 남아 있다.
- 작업 9 전까지 `/result`는 기존 화면이며, 신호 우선 결과 화면 교체는 포함하지 않았다.
