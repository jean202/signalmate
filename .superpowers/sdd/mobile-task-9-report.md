# Mobile Task 9 Report

## 구현

- 결과 데이터를 URL JSON이 아닌 `useAnalysis().result`에서 읽도록 변경했다.
- 신호를 `meeting`, `followUp`, `chat`, `uncertainty`로 누락과 중복 없이 분류하고 `displayOrder`와 동순위 입력 순서를 보존했다.
- 실제 만남, 채팅, 불확실성, 종합 판단, 다음 행동, 추천 메시지, 서버 안내 순서로 결과 화면을 구성했다.
- `next_message`를 다른 추천보다 먼저 표시하고 `expo-clipboard` 비동기 복사, 완료/실패 상태, 44pt 터치 영역을 추가했다.
- 결과 없음, 추천 메시지 없음, 초기화 실패 상태를 추가하고 초기화 중 중복 탭과 unmount 이후 이동을 차단했다.
- `/result`의 뒤로 가기 제스처와 헤더 뒤로 버튼을 비활성화하고 `/analyze`, 구형 `lib/api.ts`를 제거했다.
- 모바일 앱 실행 및 검증 방법과 실기기 `localhost` 주의사항을 README에 기록했다.
- Expo web export 산출물인 `dist`가 TypeScript 입력에 포함되지 않도록 설정했다.

## 리뷰 수정

- Clipboard 호출에 화면 전역 lock과 실행 토큰을 적용했다. 복사 중에는 모든 추천 메시지 복사 버튼을 비활성화하고 `busy`/`disabled` 접근성 상태를 제공한다.
- 여러 `next_message`를 순서대로 표시하며 성공, 실패, 빠른 중복 탭, 다른 추천 탭, 실패 후 재시도, unmount 후 resolve/reject를 테스트했다.
- `usePreventRemove`로 Android 하드웨어 뒤로 가기와 web history를 포함한 navigation 제거를 차단한다. 초기화가 성공한 경우에만 차단을 해제한 다음 `replace('/')`를 한 번 실행한다.
- `AnalysisProvider.resetDraft()`는 저장소와 캐시 정리가 성공한 뒤에만 메모리 draft/result를 비운다. 실패하면 결과와 제거 차단을 유지한다.
- 실제 `AnalysisProvider`를 사용하는 결과 렌더·초기화 성공·초기화 실패 통합 테스트를 추가했다.
- caution 색을 `#98600D`로 조정했다. 대비는 흰 배경 5.2316:1, `cautionSurface` 4.9131:1이다.
- `tsconfig`에 `dist`, `node_modules`, 구성 파일, `android`, `ios` 제외를 명시해 Expo base 제외 범위를 보존했다.

## 초기화 일관성 재검토

- `AnalysisProvider.resetDraft()`가 reset 시작 시 draft/result/generation snapshot을 캡처하고 기존 저장 큐 뒤에서 storage clear, cache clear를 직렬 실행하도록 변경했다.
- storage clear가 실패하면 cache를 호출하지 않고 메모리를 유지한다. cache clear가 실패하면 reset 시작 시점의 draft를 storage에 보상 저장하며, 보상 저장 실패도 원문 오류를 노출하거나 기록하지 않고 일관된 `DraftResetError`로 처리한다.
- 모든 정리가 성공한 경우에만 메모리 draft/result를 비운다. 실패 후 draft 수정 저장, reset 재시도, 보상 저장 실패 경로를 Provider 테스트에 추가했다.
- 홈의 `void resetDraft()` 미처리 rejection을 제거하고 전역 ref lock, 실행 중 disabled/busy 접근성 상태, 실패 안내, 명시적인 재시도 명령, unmount 이후 상태 갱신 방지를 추가했다.
- 홈 테스트에 빠른 중복 탭, 기존 초안 유지, 실패 후 성공 재시도, unmount 이후 resolve/reject 경로를 추가했다.

리뷰 RED에서는 복사 중 Clipboard가 2회 호출되고 두 번째 추천 버튼이 없으며 `usePreventRemove` 호출이 없음을 확인했다. Provider 실패 테스트에서는 결과가 조기에 사라지고, 기존 caution 대비는 흰 배경에서 4.4177:1로 실패했다.

## TDD

RED:

```text
npm test -- lib/analysis/__tests__/signal-groups.test.ts app/__tests__/result.test.tsx
Test Suites: 2 failed
```

신규 그룹 모듈 부재와 기존 결과 화면의 URL 파라미터 의존으로 실패하는 것을 확인했다.

GREEN:

```text
Test Suites: 2 passed, 2 total
Tests: 13 passed, 13 total
```

## 자동 검증

```text
npm test
Test Suites: 23 passed, 23 total
Tests: 207 passed, 207 total

npm run typecheck
exit 0

npx expo export --platform web
Exported: dist

git diff --check
exit 0
```

`rg`로 URL 결과 파싱, `/analyze`, 구형 `lib/api` import, `console.log/error/warn/info/debug` 잔재가 없고 `lib/api/client.ts`가 유지된 것을 확인했다.

초기화 일관성 재검토의 집중 Provider 테스트 17개와 홈 집중 테스트 9개가 통과했다. 홈 실패 안내 컨테이너를 실제 접근성 요소로 노출하고, 테스트에서 `alert` 역할과 명확한 접근성 이름을 함께 검증했다. 전체 테스트는 23 suites, 207 tests가 통과했다.

## 시각 검수

- Expo web을 320x700과 1280x900에서 실행했다.
- 결과 있음 fixture로 실제 만남/후속 연락/채팅/불확실성, 긴 evidence, 긴 recommendation, 긴 warning, 추천 메시지 없음과 별개인 전체 스크롤 구조를 확인했다. fixture는 검수 후 삭제했다.
- 320px에서 수평 overflow가 없고 긴 텍스트가 줄바꿈되며 모든 섹션에 스크롤로 접근 가능했다.
- 복사 버튼은 44pt, 새 분석 버튼은 47pt로 측정했다.
- 리뷰 수정 후 320x700에서 두 추천 메시지 복사 버튼이 각각 44pt이고 수평 overflow가 없으며 caution 색이 `rgb(152, 96, 13)`으로 렌더링되는 것을 다시 확인했다.
- 빈 상태도 두 뷰포트에서 중앙 정렬, 줄바꿈, 명령 접근성을 확인했다.
- 브라우저에서 합성 대화로 실제 API 흐름을 시도했으나 개발 환경의 기본 원격 API 연결이 실패해 실서버 결과는 만들지 못했다.

## 남은 위험

- iOS와 Android 실기기에서 20장 캡처, 부분 OCR 실패, 앱 재실행 복구, 시스템 동적 글자 크기는 이번 환경에서 실행하지 못했다.
- 웹 시각 검수는 레이아웃과 긴 콘텐츠를 확인했지만 iOS/Android 네이티브 글꼴 메트릭과 클립보드 권한 동작은 실기기 확인이 필요하다.
- Expo 시작 시 설치 버전 권고가 출력됐다: `expo@54.0.34` 대 `~54.0.35`, `expo-router@6.0.23` 대 `~6.0.24`. 이번 작업 범위에서는 의존성을 변경하지 않았다.
