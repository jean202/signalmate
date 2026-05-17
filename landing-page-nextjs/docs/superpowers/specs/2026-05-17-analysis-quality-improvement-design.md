# 분석 품질 개선 설계: 이모지 신호 추가 + 기존 문구 개선

작성일: 2026-05-17

## 배경

현재 룰 기반 분석 엔진(`lib/rule-based-analysis.ts`)은 16개 신호를 생성한다. 두 가지 품질 문제가 있다.

1. 이모지/리액션 패턴이 독립 신호로 노출되지 않는다. `otherWarmCount`는 이미 집계 중이나 `warm_tone` 신호의 보조 근거로만 사용된다.
2. caution/ambiguous 신호의 문구가 단정적이거나 구체성이 낮다.

## 목표

- 이모지 관련 신호 2개를 신설한다.
- caution 6개 + ambiguous 4개 신호의 `description`/`evidenceText` 문구를 개선한다.
- 기존 96개 테스트를 전부 통과 상태로 유지한다.

## 범위 외

- `warm_tone` 신호 제거 또는 병합 — 유지한다. 역할이 다르다: `warm_tone`은 "건조하지 않음"을 확인, 새 신호는 적극적 감정 표현을 별도 포착한다.
- StageConfig 구조 변경 — 임계값 상수만 추가한다.
- LLM 기반 동적 문구 생성 — 이번 범위 밖이다.

---

## 1. 신규 신호: `emoji_engagement` (positive)

### 조건

```
otherWarmDensity >= 0.5
```

- `otherWarmDensity` = `otherWarmCount / otherMessages`
- 최소 메시지 수 조건: `otherMessages >= 3` (표본 보호)

### 문구

- **title:** 감정 표현을 자주 섞어서 답해요
- **description:** 상대가 이모지나 감탄 표현을 메시지마다 꽤 자주 쓰고 있어서, 딱딱하게 닫힌 톤은 아닙니다.
- **evidenceText:** 상대 메시지 {N}개 중 감정 표현이 포함된 답장이 {M}개({ratio}%)입니다.
- **confidence:** ratio >= 70% → high, 그 외 → medium

### 메트릭 추가

`MessageMetrics`에 필드 추가:

```ts
otherWarmDensity: number;           // otherWarmCount / otherMessages (0이면 0)
```

---

## 2. 신규 신호: `emoji_drop` (caution)

### 조건

전반부(앞 50% 메시지)와 후반부(뒤 50% 메시지)의 warm 밀도를 비교한다.

```
otherWarmDropDetected === true
```

감지 기준: 후반부 warm 밀도 < 전반부 warm 밀도 × 0.6

최소 조건: 전반부 `otherMessages >= 2` AND 전반부 warm 밀도 >= 0.3 (원래 표현이 있었어야 감지)

### 문구

- **title:** 대화 후반으로 갈수록 반응 표현이 줄고 있어요
- **description:** 처음엔 이모지나 감탄 표현이 있었는데 후반부에서 눈에 띄게 줄었어요. 피로도가 올라가거나 관심이 옅어지는 구간일 수 있어요.
- **evidenceText:** 전반부 warm 표현 밀도 {A}%, 후반부 {B}%로 {diff}%p 감소했습니다.
- **confidence:** medium

### 메트릭 추가

```ts
otherWarmDropDetected: boolean;     // 후반 밀도 < 전반 밀도 × 0.6
```

---

## 3. 기존 문구 개선

### 개선 원칙

- **구체성:** evidenceText에 실제 수치를 노출한다. "거의 없어서" → "N개 중 0개였습니다."
- **톤:** caution/ambiguous에서 단정형(`~어렵습니다`, `~보기 어렵습니다`) → 가능성형(`~이른 구간이에요`, `~판단하기엔 더 필요해요`)

### 개선 대상 신호 (10개)

| 신호 키 | 타입 | 개선 포인트 |
|---|---|---|
| `question_balance` | ambiguous/caution | evidenceText에 상대 질문 수 명시 |
| `short_replies` | ambiguous | "보기 어렵습니다" → "판단하기엔 아직 이른 구간이에요" |
| `one_sided_conversation` | ambiguous | 톤 유지, evidenceText 수치 포맷 개선 |
| `sample_size` | ambiguous | 문구 유지 (이미 구체적) |
| `date_specificity` | caution | "약합니다" → "아직 나오지 않은 단계예요" |
| `awaiting_reply` | caution | 문구 유지 (이미 적절) |
| `hedged_replies` | caution | "반복됩니다" → "반복되는 편이에요" |
| `slow_response_cadence` | caution | "보기는 어렵습니다" → "적극적 관심 신호로 읽기엔 이른 편이에요" |
| `closing_without_follow_up` | caution | 문구 유지 (이미 중립적) |
| `tone_drop` | caution | "흥미가 줄었을 가능성이 있습니다" → "흥미가 다소 옅어졌을 수도 있어요" |

---

## 4. 구현 파일

| 파일 | 변경 내용 |
|---|---|
| `lib/rule-based-analysis.ts` | `MessageMetrics`에 `otherWarmDensity`, `otherWarmDropDetected` 추가; `buildMetrics()`에 계산 로직 추가; 신호 2개 추가; 기존 10개 신호 문구 수정 |
| `lib/__tests__/rule-based-analysis.test.ts` | `emoji_engagement`, `emoji_drop` 신호 케이스 추가 (각 최소 2개 픽스처) |

---

## 5. 테스트 케이스

### `emoji_engagement`
- **통과:** 상대 메시지 4개, warm 포함 3개 (75%) → positive 신호 확인
- **미통과:** 상대 메시지 4개, warm 포함 1개 (25%) → 신호 없음 확인

### `emoji_drop`
- **통과:** 전반부 warm 밀도 0.8, 후반부 0.1 → caution 신호 확인
- **미통과:** 전반부 warm 밀도 0.1 (기준 미달) → 신호 없음 확인

---

## 6. 성공 기준

- 기존 96개 테스트 전부 통과
- 신규 테스트 최소 4개 추가
- 개선된 문구에서 "~보기 어렵습니다" 패턴 0개
