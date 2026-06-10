# Learning Track — 실제 캡쳐로 NLP/시그널 추론 이해하기

상용화가 아닌 개인 학습용. 마스킹된 캡쳐를 기존 엔진(`../lib/ai`)에 흘려보내며 추론을 이해한다.

## 캡쳐 등록 (서있는 원칙)
1. 이미지 원본 저장 금지 — 텍스트로 옮겨 `captures/NNNN.json`.
2. **마스킹 = 일반화.** 식별어는 본문에서 `[직장]`·`[지명]` 토큰으로, 사회적 범주는 `context` 블록에 넓게 기록. 범주를 좁혀 재식별 가능하게 만들지 말 것.
3. `captures/`·`traces/`·`experiments/*.jsonl` 은 .gitignore. git에는 집계 노트(실험 카드)만. **주의:** `example-0000.json`만 예외로 추적되므로 실데이터 파일명에 `example-` 접두사를 쓰지 말 것.
4. 포맷은 `captures/example-0000.json`(합성 예시) 참고.

## Phase 1 — 해부
- `npm run learn:trace -- learning/captures/NNNN.json` → `traces/NNNN.trace.md` 생성.
- 각 단계 "내 코멘트:" 줄을 직접 채운다. 특히 임베딩(LLM 단계 활성화 시) 이웃이 진짜 비슷한지 눈으로 검증.

## Phase 2 — 실험노트
1. 캡쳐를 **블라인드 라벨링**(시스템 출력 보기 전 `myLabel` 작성: temperature/topSignal/nextMove).
2. 라벨 단 캡쳐들을 `experiments/dataset.jsonl`(한 줄 = 캡쳐 1개)에 모은다.
3. `npm run learn:eval` → 시스템 temperature vs 내 라벨 표 + 불일치 목록.
4. 불일치마다 왜 갈렸는지 기록 → Phase 3 후보.

## Phase 3 — 개선루프
1. 불일치 하나 선택 → `templates/experiment-card.md` 복사해 `experiments/cards/NNN.md`.
2. **딱 한 변수만** 바꾼다(룰 임계값/프롬프트/few-shot 중 하나).
3. 같은 dataset으로 `npm run learn:eval` 재측정 → before/after 기록.
4. 가설이 틀려도 카드에 남긴다. 작은 표본 과적합을 경계.
