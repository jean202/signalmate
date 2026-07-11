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
- 로컬 running ref로 연속 탭을 막고 Provider 실행 토큰과 화면 focus로 늦은 상태 및 라우터 갱신을 막는다.
- 실패 상세와 원문은 화면이나 console에 기록하지 않는다.

## 리뷰 후속 수정

- 서버는 top-level `situationContext`와 `guidedAnswers.freeText` 사용자 입력을 각각 2,000자로 제한한다. 자동 생성 안내 문구가 더해진 병합 결과 길이는 거절 조건에서 제외했다.
- GuidedAnswers의 필드 타입과 enum 값을 route 경계에서 검증해 비정상 `freeText`/`otherStyle` 등이 예외를 만들지 않게 했다.
- 실제 분석 request를 결정하는 입력을 고정 순서로 해시한 `analysisInputFingerprint()`를 추가했다. 원문, `createdConversation`, 저장 fingerprint, `updatedAt`, UI 메타데이터는 fingerprint 문자열에 포함하지 않는다.
- Provider는 입력 fingerprint 변경 시 저장 conversation과 fingerprint를 자동 무효화한다.
- Review는 현재 fingerprint와 저장 fingerprint가 같은 경우에만 snapshot을 재사용하며, create 직후 사용한 fingerprint를 snapshot과 함께 저장한다.
- Provider 단일 실행 토큰과 Expo Router `useFocusEffect`를 사용해 새 실행, blur, unmount 뒤의 이전 진행/결과/라우팅 갱신을 차단한다.
- 실행 중 blur 후 재진입하면 취소된 `running` UI 상태를 복원한다.
- 실제 Provider 누적 테스트로 입력 미변경 재시도는 create 1회, 입력 변경 재시도는 create 2회임을 검증했다.
- 입력 요약의 중복 제외 수는 유일 ID 기준이며, ChoiceChips는 320pt와 큰 글자에서 축소/줄바꿈하고 선택 전후 1px border 폭을 유지한다.
- route는 top-level JSON이 plain object가 아니면 속성 접근 전에 400으로 거절한다.
- `situationContext`와 `guidedAnswers`의 `null`/`undefined` 호환을 유지하면서 값이 있을 때만 타입, 길이, enum을 검증한다.
- 실제 Provider와 deferred promise로 stream blur/unmount resolve/reject, 복수 Review create 경쟁, blur 재진입, late stream reject의 최신 상태 보존을 검증한다.
- conversations POST는 required 문자열, optional nullable 문자열, saveMode, messages 배열과 메시지 필드 타입을 사용 전에 검증한다. 오류 응답과 로그에는 입력 원문을 포함하지 않는다.
- required 관계 enum은 Prisma schema allowlist와 일치시키고, `sentAt` 유효 날짜·`sequenceNo` signed 32-bit Int 범위·정규화 후 순번 유일성을 DB 호출 전에 검증한다.

## TDD 기록

1. `situation.test.tsx`를 먼저 추가하고 `Cannot find module '../situation'` 실패를 확인했다.
2. 상황 설문과 draft 메타데이터를 구현한 뒤 상황 테스트 7개 통과를 확인했다.
3. `review.test.tsx`를 먼저 추가하고 `Cannot find module '../review'` 실패를 확인했다.
4. 입력 요약과 분석 실행을 구현했다. 첫 GREEN 실행에서 테스트 픽스처의 한글 길이 기대값 오류 1건을 확인해 31자를 실제 32자로 수정했다.
5. 집중 테스트 17개와 타입 검사 통과 후 전체 회귀 테스트를 실행했다.
6. route 테스트에서 2,000자 자유 입력+자동 문구 400과 비정상 타입 예외 3건을 RED로 확인했다.
7. fingerprint 모듈 부재, Provider snapshot 미무효화/토큰 부재, Review stale snapshot·입력 변경·blur 경쟁을 각각 RED로 확인했다.
8. 중복 ID 이중 집계, 긴 chip 폭 제약 부재, 선택 border 3px 변경을 RED로 확인했다.
9. 실제 Provider 통합 테스트로 stream 실패 재시도와 복수 Review late resolve를 검증했다.
10. top-level JSON `null` 예외와 nullable 상황 필드 400을 RED로 확인하고 route 경계에서 수정했다.
11. 분석 경쟁 회귀 9개를 실제 Provider/deferred promise로 추가했으며 기존 실행 토큰 구현에서 모두 통과했다. act 경고는 숨기지 않았고 테스트 출력에 경고가 없음을 확인했다.
12. 숫자/객체/배열 top-level 필드와 잘못된 messages 요소가 500 또는 201이 되는 11건을 RED로 확인하고 route 선행 validator로 수정했다.
13. unknown required enum, invalid date, Prisma Int 범위 밖, 명시/fallback 순번 충돌 9건이 201이 되는 것을 RED로 확인하고 DB 저장 전 validator로 수정했다.

## 검증 결과

- 리뷰 후속 집중 테스트: 7 suites, 65 tests passed
- 앱 전체 `npm test`: 19 suites, 174 tests passed
- 앱 `npm run typecheck`: 통과
- landing route 테스트: 1 file, 66 tests passed
- landing `npx tsc --noEmit`: 통과
- `git diff --check`: 통과

## 남은 위험

- 실제 iOS/Android 기기의 키보드, 시스템 큰 글자, VoiceOver/TalkBack 동작은 자동화 테스트 범위 밖이라 기기 검증이 남아 있다.
- ChoiceChips의 제품 스타일은 유지했다. 실제 font scale에서 320pt 줄바꿈과 chip 높이는 iOS/Android 기기 및 브라우저 확대 환경에서 최종 시각 검증해야 한다.
- 작업 9 전까지 `/result`는 기존 화면이며, 신호 우선 결과 화면 교체는 포함하지 않았다.
