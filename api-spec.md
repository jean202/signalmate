# SignalMate API 명세 초안

작성일: 2026-03-27

## 1. 목적

이 문서는 SignalMate MVP에서 필요한 핵심 API를 정리한 초안이다.

범위는 아래 흐름에 맞춘다.

- 대기자 등록
- 비회원 또는 회원 대화 업로드
- 관계 신호 분석 실행
- 결과 조회
- 다음 메시지 추천 조회
- 결제 및 업그레이드

## 2. 공통 규칙

### Base URL

`/api/v1`

### 응답 포맷

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

실패 시:

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "relationshipStage is required"
  }
}
```

### 인증

- 회원 API는 `Authorization: Bearer <token>` 사용
- 비회원 체험은 `X-Session-Id` 헤더로 처리 가능
- `user_id` 또는 `session_id` 중 하나는 항상 있어야 한다

### 기본 상태 코드

- `200 OK`: 조회 성공
- `201 Created`: 생성 성공
- `202 Accepted`: 비동기 분석 접수
- `400 Bad Request`: 유효성 오류
- `401 Unauthorized`: 인증 실패
- `403 Forbidden`: 접근 권한 없음
- `404 Not Found`: 리소스 없음
- `409 Conflict`: 중복 요청

## 3. 인증 API

## 3-1. 이메일 회원가입

`POST /api/v1/auth/email/sign-up`

### Request

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!",
  "nickname": "mina"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "d8f3b8a2-0d7a-4b6c-a1f5-2f4ecf3f9c11",
      "email": "user@example.com",
      "nickname": "mina"
    },
    "accessToken": "jwt-token"
  },
  "error": null
}
```

## 3-2. 이메일 로그인

`POST /api/v1/auth/email/sign-in`

### Request

```json
{
  "email": "user@example.com",
  "password": "StrongPassword123!"
}
```

## 4. 마케팅 API

## 4-1. 대기자 등록

`POST /api/v1/waitlist`

### Request

```json
{
  "email": "user@example.com",
  "source": "landing",
  "note": "소개팅 후속 대화 분석이 가장 필요함"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "waitlistId": "19f6fa39-2d5a-46f6-9fd2-7df1ce06dcd0"
  },
  "error": null
}
```

## 5. 대화 업로드 API

## 5-1. 대화 생성

`POST /api/v1/conversations`

회원과 비회원 모두 사용 가능하다.

### Headers

- 회원: `Authorization: Bearer <token>`
- 비회원: `X-Session-Id: <uuid>`

### Request

```json
{
  "title": "첫 소개팅 후 대화",
  "sourceType": "kakao",
  "relationshipStage": "after_first_date",
  "meetingChannel": "blind_date",
  "userGoal": "evaluate_interest",
  "saveMode": "temporary",
  "rawText": "[오후 8:10] 나: 오늘 잘 들어갔어요?\n[오후 8:13] 상대: 네 덕분에요 :)",
  "messages": [
    {
      "senderRole": "self",
      "messageText": "오늘 잘 들어갔어요?",
      "sentAt": "2026-03-27T20:10:00+09:00",
      "sequenceNo": 1
    },
    {
      "senderRole": "other",
      "messageText": "네 덕분에요 :)",
      "sentAt": "2026-03-27T20:13:00+09:00",
      "sequenceNo": 2
    }
  ]
}
```

### Response

```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "fd9fd0ab-76c3-42c3-8a24-4504095d5704",
      "saveMode": "temporary",
      "relationshipStage": "after_first_date",
      "messageCount": 2
    }
  },
  "error": null
}
```

## 5-2. 대화 상세 조회

`GET /api/v1/conversations/{conversationId}`

### Response

```json
{
  "success": true,
  "data": {
    "conversation": {
      "id": "fd9fd0ab-76c3-42c3-8a24-4504095d5704",
      "title": "첫 소개팅 후 대화",
      "sourceType": "kakao",
      "relationshipStage": "after_first_date",
      "meetingChannel": "blind_date",
      "userGoal": "evaluate_interest",
      "saveMode": "temporary",
      "createdAt": "2026-03-27T11:03:20Z"
    },
    "messages": [
      {
        "senderRole": "self",
        "messageText": "오늘 잘 들어갔어요?",
        "sequenceNo": 1
      },
      {
        "senderRole": "other",
        "messageText": "네 덕분에요 :)",
        "sequenceNo": 2
      }
    ]
  },
  "error": null
}
```

## 6. 분석 API

## 6-1. 분석 생성

`POST /api/v1/conversations/{conversationId}/analyses`

분석은 비동기 처리 기준으로 설계한다.

### Request

```json
{
  "analysisVersion": "v1",
  "modelName": "hybrid-rules-llm",
  "context": {
    "userGoal": "evaluate_interest",
    "includeRecommendations": true
  }
}
```

### Response

```json
{
  "success": true,
  "data": {
    "analysis": {
      "id": "113d54ea-4b53-4c61-bb38-23f0e7f1dc8a",
      "analysisStatus": "queued"
    }
  },
  "error": null
}
```

## 6-2. 분석 상세 조회

`GET /api/v1/analyses/{analysisId}`

### Response

```json
{
  "success": true,
  "data": {
    "analysis": {
      "id": "113d54ea-4b53-4c61-bb38-23f0e7f1dc8a",
      "analysisStatus": "completed",
      "overallSummary": "대화는 긍정적으로 이어지고 있지만 아직 적극적인 확신 단계는 아닙니다.",
      "positiveSignalCount": 4,
      "ambiguousSignalCount": 2,
      "cautionSignalCount": 1,
      "confidenceLevel": "medium",
      "recommendedAction": "keep_light",
      "recommendedActionReason": "대화는 계속 이어지지만 질문 회수와 약속 구체성이 아직 높지 않습니다.",
      "createdAt": "2026-03-27T11:05:10Z",
      "completedAt": "2026-03-27T11:05:15Z"
    }
  },
  "error": null
}
```

## 6-3. 신호 카드 조회

`GET /api/v1/analyses/{analysisId}/signals`

### Response

```json
{
  "success": true,
  "data": {
    "signals": [
      {
        "id": "12fb90d0-8e8a-4d62-a17e-bbb2b22bdcfd",
        "signalType": "positive",
        "signalKey": "reply_continuity",
        "title": "대화를 끊지 않고 이어가고 있어요",
        "description": "상대는 짧더라도 대화를 종료하지 않고 연결하고 있습니다.",
        "evidenceText": "질문형 답변은 적지만 응답 자체는 지속되고 있습니다.",
        "confidenceLevel": "high",
        "displayOrder": 1
      }
    ]
  },
  "error": null
}
```

## 6-4. 추천 메시지 조회

`GET /api/v1/analyses/{analysisId}/recommendations`

### Response

```json
{
  "success": true,
  "data": {
    "recommendations": [
      {
        "id": "be9f0d58-7d80-4326-b598-f2a7e4101c66",
        "recommendationType": "next_message",
        "title": "가볍게 후속 대화 이어가기",
        "content": "오늘 이야기했던 전시 생각보다 재밌었어요. 다음에 시간 맞으면 다른 곳도 같이 가보고 싶네요.",
        "rationale": "바로 강하게 밀기보다 공통 화제를 활용해 자연스럽게 제안하는 쪽이 좋습니다.",
        "toneLabel": "light"
      }
    ]
  },
  "error": null
}
```

## 6-5. 내 분석 목록 조회

`GET /api/v1/me/analyses?cursor=<cursor>&limit=20`

### Response

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "analysisId": "113d54ea-4b53-4c61-bb38-23f0e7f1dc8a",
        "conversationTitle": "첫 소개팅 후 대화",
        "overallSummary": "긍정적이지만 아직 탐색 단계입니다.",
        "recommendedAction": "keep_light",
        "createdAt": "2026-03-27T11:05:10Z"
      }
    ],
    "nextCursor": null
  },
  "error": null
}
```

## 7. 저장 및 삭제 API

## 7-1. 대화 저장 모드 변경

`PATCH /api/v1/conversations/{conversationId}`

### Request

```json
{
  "title": "애프터 전 대화",
  "saveMode": "saved"
}
```

## 7-2. 대화 삭제

`DELETE /api/v1/conversations/{conversationId}`

### Response

```json
{
  "success": true,
  "data": {
    "deleted": true
  },
  "error": null
}
```

## 8. 결제 API

## 8-1. 체크아웃 세션 생성

`POST /api/v1/payments/checkout`

### Request

```json
{
  "purchaseType": "single_analysis",
  "analysisId": "113d54ea-4b53-4c61-bb38-23f0e7f1dc8a",
  "provider": "toss"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "paymentId": "89a6b4eb-5825-4ff4-98b5-54a0113dc6d6",
    "checkoutUrl": "https://payments.example.com/checkout/abc123"
  },
  "error": null
}
```

## 8-2. 결제 웹훅

`POST /api/v1/webhooks/payments`

PG사 콜백용 엔드포인트다. 외부 호출이므로 서명 검증이 필요하다.

## 9. 도메인 값 제안

### relationshipStage

- `before_meeting`
- `after_first_date`
- `after_second_date`
- `ongoing_chat`
- `cooling_down`

### meetingChannel

- `blind_date`
- `dating_app`
- `marriage_agency`
- `mutual_friend`
- `other`

### recommendedAction

- `keep_light`
- `suggest_date`
- `slow_down`
- `wait_for_response`
- `consider_stopping`

## 10. 구현 메모

- 첫 분석은 `202 Accepted` + polling 구조로 시작하는 편이 안전하다.
- 결과 화면 속도 체감이 중요하면 `GET /api/v1/analyses/{id}` 하나에 요약과 일부 신호를 함께 넣어도 된다.
- 결제 전후로 결과의 일부만 잠그는 경우 `lockedFields`를 응답에 포함시키는 방식도 가능하다.
