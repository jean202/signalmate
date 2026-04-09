# SignalMate ERD

작성일: 2026-03-27

## 1. 목적

이 문서는 SignalMate MVP의 핵심 데이터 구조를 시각적으로 정리한 ERD다.

초기 버전에서는 아래 흐름이 자연스럽게 이어지도록 설계한다.

- 사용자가 대화를 업로드한다
- 대화가 메시지 단위로 파싱된다
- 분석 실행이 생성된다
- 신호 카드와 추천 메시지가 결과로 생성된다
- 필요하면 결제, 구독, 대기자 등록까지 연결된다

## 2. ERD

```mermaid
erDiagram
    USERS ||--o{ CONVERSATIONS : owns
    CONVERSATIONS ||--o{ CONVERSATION_MESSAGES : contains
    CONVERSATIONS ||--o{ ANALYSES : produces
    USERS ||--o{ ANALYSES : requests
    ANALYSES ||--o{ ANALYSIS_SIGNALS : includes
    ANALYSES ||--o{ ANALYSIS_RECOMMENDATIONS : suggests
    USERS ||--o{ SUBSCRIPTIONS : has
    USERS ||--o{ PAYMENTS : pays
    SUBSCRIPTIONS ||--o{ PAYMENTS : bills
    ANALYSES ||--o{ PAYMENTS : unlocks

    USERS {
        uuid id PK
        string email
        string auth_provider
        string nickname
        string status
        datetime created_at
    }

    CONVERSATIONS {
        uuid id PK
        uuid user_id FK
        uuid session_id
        string source_type
        string relationship_stage
        string meeting_channel
        string user_goal
        string save_mode
        text raw_text_redacted
        datetime created_at
    }

    CONVERSATION_MESSAGES {
        uuid id PK
        uuid conversation_id FK
        string sender_role
        text message_text
        datetime sent_at
        int sequence_no
        int message_length
    }

    ANALYSES {
        uuid id PK
        uuid user_id FK
        uuid session_id
        uuid conversation_id FK
        string analysis_version
        string analysis_status
        int positive_signal_count
        int ambiguous_signal_count
        int caution_signal_count
        string confidence_level
        string recommended_action
        datetime created_at
    }

    ANALYSIS_SIGNALS {
        uuid id PK
        uuid analysis_id FK
        string signal_type
        string signal_key
        string title
        text description
        text evidence_text
        string confidence_level
        int display_order
    }

    ANALYSIS_RECOMMENDATIONS {
        uuid id PK
        uuid analysis_id FK
        string recommendation_type
        string title
        text content
        text rationale
        string tone_label
        int display_order
    }

    SUBSCRIPTIONS {
        uuid id PK
        uuid user_id FK
        string plan_code
        string status
        string billing_provider
        datetime current_period_end
    }

    PAYMENTS {
        uuid id PK
        uuid user_id FK
        uuid analysis_id FK
        uuid subscription_id FK
        string payment_provider
        int amount
        string currency
        string payment_status
        datetime paid_at
    }
```

## 3. 해석 포인트

- `conversations`와 `analyses`를 분리해서 같은 대화를 여러 엔진 버전으로 재분석할 수 있게 한다.
- `analysis_signals`와 `analysis_recommendations`를 분리해서 결과 화면과 추천 메시지 화면을 독립적으로 구성한다.
- `session_id`를 두어 비회원 체험 분석도 지원할 수 있게 한다.
- `payments`는 단건 분석 결제와 구독 결제를 모두 연결할 수 있게 설계한다.

## 4. MVP 메모

- 초기에는 `waitlist_signups`를 별도 마케팅 테이블로 운영할 수 있다.
- 저장 없는 분석은 `save_mode=temporary`와 TTL 삭제 정책으로 처리한다.
- `raw_text_redacted`만 보관하고 원문 저장 여부는 별도 정책으로 통제한다.
