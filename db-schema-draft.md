# SignalMate DB 초안

작성일: 2026-03-27

## 1. 문서 목적

이 문서는 SignalMate MVP를 구현하기 위한 최소 데이터 구조 초안이다.

목표는 아래 3가지를 동시에 만족하는 것이다.

- 빠르게 개발 가능한 단순한 구조
- 분석 결과 저장과 재조회 가능
- 개인정보 민감도를 고려한 확장 가능성

## 2. 설계 원칙

- 채팅 원문 저장은 선택 가능해야 한다
- 분석 결과와 원문 데이터는 분리한다
- 한 대화에 대해 여러 번 재분석할 수 있어야 한다
- 결과 설명과 추천 메시지는 별도 테이블로 관리한다
- 추후 결제, 구독, 실험 로그를 붙이기 쉬워야 한다

## 3. 핵심 엔터티

- users
- analyses
- conversations
- conversation_messages
- analysis_signals
- analysis_recommendations
- subscriptions
- payments

## 4. 테이블 초안

## 4-1. users

사용자 계정 정보

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| email | varchar | 로그인 이메일 |
| password_hash | varchar | 이메일 로그인 시 사용 |
| auth_provider | varchar | google, kakao, apple, local 등 |
| provider_user_id | varchar | 외부 로그인 식별자 |
| nickname | varchar | 표시명 |
| locale | varchar | ko-KR 등 |
| timezone | varchar | Asia/Seoul 등 |
| status | varchar | active, deleted, suspended |
| created_at | timestamp | 생성 시각 |
| updated_at | timestamp | 수정 시각 |

## 4-2. conversations

사용자가 분석 대상으로 올린 대화 묶음

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| user_id | bigint / uuid | FK users.id |
| title | varchar | 사용자가 구분하기 위한 제목 |
| source_type | varchar | kakao, sms, dating_app, manual 등 |
| relationship_stage | varchar | before_meeting, after_first_date 등 |
| meeting_channel | varchar | blind_date, app, agency, mutual_friend 등 |
| user_goal | varchar | continue_chat, ask_for_date, evaluate_interest 등 |
| save_mode | varchar | temporary, saved |
| raw_text_redacted | text | 익명화된 대화 원문 |
| created_at | timestamp | 생성 시각 |
| updated_at | timestamp | 수정 시각 |

`save_mode=temporary`인 경우 TTL 삭제 정책을 둘 수 있다.

## 4-3. conversation_messages

대화를 메시지 단위로 파싱해 저장하는 테이블

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| conversation_id | bigint / uuid | FK conversations.id |
| sender_role | varchar | self, other, unknown |
| message_text | text | 메시지 내용 |
| sent_at | timestamp nullable | 메시지 시각 |
| sequence_no | int | 대화 내 순서 |
| message_length | int | 글자 수 |
| created_at | timestamp | 생성 시각 |

메시지 시각을 알 수 없을 수도 있으므로 `sent_at`은 nullable로 두는 편이 안전하다.

## 4-4. analyses

한 번의 분석 실행 단위

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| user_id | bigint / uuid | FK users.id |
| conversation_id | bigint / uuid | FK conversations.id |
| analysis_version | varchar | 분석 엔진 버전 |
| overall_summary | text | 전체 요약 |
| positive_signal_count | int | 긍정 신호 수 |
| ambiguous_signal_count | int | 애매 신호 수 |
| caution_signal_count | int | 주의 신호 수 |
| confidence_level | varchar | low, medium, high |
| recommended_action | varchar | keep_light, suggest_date, slow_down 등 |
| recommended_action_reason | text | 추천 액션 이유 |
| analysis_status | varchar | queued, completed, failed |
| created_at | timestamp | 생성 시각 |
| completed_at | timestamp nullable | 완료 시각 |

같은 conversation에 대해 analyses가 여러 개 생길 수 있다.

## 4-5. analysis_signals

분석 결과의 신호 카드

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| analysis_id | bigint / uuid | FK analyses.id |
| signal_type | varchar | positive, ambiguous, caution |
| signal_key | varchar | question_ratio, reply_delay 등 |
| title | varchar | 카드 제목 |
| description | text | 사용자에게 보여줄 설명 |
| evidence_text | text | 근거 문장 |
| confidence_level | varchar | low, medium, high |
| display_order | int | 노출 순서 |
| created_at | timestamp | 생성 시각 |

## 4-6. analysis_recommendations

다음 메시지 추천 및 행동 가이드

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| analysis_id | bigint / uuid | FK analyses.id |
| recommendation_type | varchar | next_message, tone_guide, avoid_phrase |
| title | varchar | 추천 제목 |
| content | text | 추천 문구 |
| rationale | text | 추천 이유 |
| display_order | int | 노출 순서 |
| created_at | timestamp | 생성 시각 |

## 4-7. subscriptions

구독 상태 관리

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| user_id | bigint / uuid | FK users.id |
| plan_code | varchar | free, premium_monthly 등 |
| status | varchar | active, canceled, expired |
| started_at | timestamp | 시작 시각 |
| ended_at | timestamp nullable | 종료 시각 |
| created_at | timestamp | 생성 시각 |
| updated_at | timestamp | 수정 시각 |

## 4-8. payments

단건 결제 및 구독 결제 이력

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| id | bigint / uuid | PK |
| user_id | bigint / uuid | FK users.id |
| analysis_id | bigint / uuid nullable | 단건 결제 연결용 |
| subscription_id | bigint / uuid nullable | 구독 결제 연결용 |
| payment_provider | varchar | stripe, toss 등 |
| provider_payment_id | varchar | PG사 결제 식별자 |
| amount | int | 결제 금액 |
| currency | varchar | KRW 등 |
| payment_status | varchar | pending, paid, failed, refunded |
| paid_at | timestamp nullable | 결제 완료 시각 |
| created_at | timestamp | 생성 시각 |

## 5. 권장 추가 테이블

MVP 시작에는 없어도 되지만 곧 필요해질 수 있다.

- waitlist_signups
- feature_flags
- analysis_events
- deleted_data_audit

## 6. 관계 요약

- users 1:N conversations
- conversations 1:N conversation_messages
- conversations 1:N analyses
- analyses 1:N analysis_signals
- analyses 1:N analysis_recommendations
- users 1:N subscriptions
- users 1:N payments

## 7. 인덱스 초안

초기에는 아래 정도면 충분하다.

- users.email unique
- conversations.user_id index
- conversation_messages.conversation_id, sequence_no index
- analyses.user_id, created_at index
- analyses.conversation_id, created_at index
- analysis_signals.analysis_id index
- analysis_recommendations.analysis_id index
- payments.user_id, created_at index

## 8. 삭제 및 보관 정책

채팅 데이터 민감도가 높기 때문에 정책이 중요하다.

- 비저장 분석은 conversations와 conversation_messages를 일정 시간 후 삭제
- 사용자가 저장한 분석도 개별 삭제 가능해야 함
- 계정 삭제 시 원문과 분석 결과를 함께 정리할 수 있어야 함
- 원문 없는 분석 결과 보관 옵션도 장기적으로 검토 가능

## 9. PostgreSQL 기준 간단한 DDL 방향

구현 시에는 아래 선택이 무난하다.

- PK는 uuid 사용
- enum 대신 varchar + 애플리케이션 검증으로 빠르게 시작
- created_at, updated_at 기본 컬럼 공통 적용
- text 컬럼은 UTF-8 기준 충분히 넉넉하게 사용

## 10. 초기 구현에서 단순화 가능한 부분

아래는 처음에는 생략 가능하다.

- message 단위 정밀 타임스탬프 분석
- 소셜 로그인 공급자 다중 연동
- 정교한 구독 상태 머신
- AB 테스트 전용 테이블

## 11. 한 줄 결론

SignalMate의 DB는 `대화`, `분석`, `결과 카드`, `추천 메시지`를 분리해두는 것이 핵심이며, 채팅 원문 저장 여부를 독립적으로 통제할 수 있어야 한다.
