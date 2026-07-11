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
Test Suites: 21 passed, 21 total
Tests: 187 passed, 187 total

npm run typecheck
exit 0

npx expo export --platform web
Exported: dist

git diff --check
exit 0
```

`rg`로 URL 결과 파싱, `/analyze`, 구형 `lib/api` import, `console.log/error/warn/info/debug` 잔재가 없고 `lib/api/client.ts`가 유지된 것을 확인했다.

## 시각 검수

- Expo web을 320x700과 1280x900에서 실행했다.
- 결과 있음 fixture로 실제 만남/후속 연락/채팅/불확실성, 긴 evidence, 긴 recommendation, 긴 warning, 추천 메시지 없음과 별개인 전체 스크롤 구조를 확인했다. fixture는 검수 후 삭제했다.
- 320px에서 수평 overflow가 없고 긴 텍스트가 줄바꿈되며 모든 섹션에 스크롤로 접근 가능했다.
- 복사 버튼은 44pt, 새 분석 버튼은 47pt로 측정했다.
- 빈 상태도 두 뷰포트에서 중앙 정렬, 줄바꿈, 명령 접근성을 확인했다.
- 브라우저에서 합성 대화로 실제 API 흐름을 시도했으나 개발 환경의 기본 원격 API 연결이 실패해 실서버 결과는 만들지 못했다.

## 남은 위험

- iOS와 Android 실기기에서 20장 캡처, 부분 OCR 실패, 앱 재실행 복구, 시스템 동적 글자 크기는 이번 환경에서 실행하지 못했다.
- 웹 시각 검수는 레이아웃과 긴 콘텐츠를 확인했지만 iOS/Android 네이티브 글꼴 메트릭과 클립보드 권한 동작은 실기기 확인이 필요하다.
- Expo 시작 시 설치 버전 권고가 출력됐다: `expo@54.0.34` 대 `~54.0.35`, `expo-router@6.0.23` 대 `~6.0.24`. 이번 작업 범위에서는 의존성을 변경하지 않았다.
