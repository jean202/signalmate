# Learning Track — 실제 캡쳐로 NLP/시그널 추론 이해하기

상용화가 아닌 개인 학습용. 마스킹된 캡쳐를 기존 엔진(`../lib/ai`)에 흘려보내며 추론을 이해한다.

## 캡쳐 등록 (서있는 원칙)

1. 이미지 원본 저장 금지 — `learn:mask -- --image` 또는 `--image-dir`로 이미지를 읽을 수는 있지만, 원본 이미지는 repo·DB·로그·학습 폴더에 복사하거나 저장하지 않는다.
2. **마스킹 = 일반화.** 식별어는 본문에서 `[직장]`·`[지명]` 토큰으로, 사회적 범주는 `context` 블록에 넓게 기록. 범주를 좁혀 재식별 가능하게 만들지 말 것.
3. `captures/`·`traces/`·`experiments/*.jsonl` 은 .gitignore. git에는 집계 노트(실험 카드)만. **주의:** `example-0000.json`만 예외로 추적되므로 실데이터 파일명에 `example-` 접두사를 쓰지 말 것.
4. 포맷은 `captures/example-0000.json`(합성 예시) 참고.

## 빠른 루프 — 라벨 우선 평가

1. 앱에서 실제 캡쳐를 읽어 추출 텍스트를 얻는다. 원본 이미지는 저장하지 않는다.
2. `npm run learn:mask -- --id NNNN`으로 추출 텍스트를 붙여넣고, 식별정보를 넓은 범주로 마스킹해 `captures/NNNN.json`을 만든다.
3. 시스템 결과를 보기 전에 `myLabel.temperature`, `myLabel.topSignal`, `myLabel.nextMove`를 먼저 적는다.
4. 라벨을 단 캡쳐를 한 줄 JSON으로 `experiments/dataset.jsonl`에 추가한다.
5. `npm run learn:eval`을 실행해 내 라벨과 시스템 temperature를 비교한다.
6. `거리`가 `1단계`인 케이스와 `2단계` 이상인 케이스를 나눠 본다. 먼저 `2단계` 이상 불일치부터 개선 후보로 삼는다.
7. 반복되는 불일치 패턴 하나를 골라 실험 카드에 기록한다.
8. 룰, 프롬프트, few-shot 중 하나만 바꾸고 같은 dataset으로 다시 측정한다.

## 마스킹 CLI

```bash
npm run learn:mask -- --id 0004
```

이미지 파일을 바로 넣을 때:

```bash
npm run learn:mask -- --id 0004 --image /Users/jean325/portfolio/projects/signalmate/captures/gangho/IMG_3244.PNG
```

이미지 폴더를 순서대로 처리할 때:

```bash
npm run learn:mask -- --image-dir /Users/jean325/portfolio/projects/signalmate/captures/gangho --id-prefix gangho
```

폴더 모드는 지원 이미지 파일을 파일명 순서로 읽고 `learning/captures/gangho-0001.json`, `gangho-0002.json`처럼 저장한다. 이미지 입력은 Claude Vision을 사용하므로 `ANTHROPIC_API_KEY`가 터미널 환경에 있어야 한다.

CLI 흐름:

1. 텍스트 모드에서는 추출 텍스트를 붙여넣고 마지막 줄에 `__END__`를 입력한다. 이미지 모드에서는 Vision이 추출한 텍스트를 먼저 보여준다.
2. 추가 치환 규칙을 `원문=[토큰]` 형식으로 입력한다. 예: `삼성전자=[직장]`, `강남=[지명]`.
3. context를 `key=value` 형식으로 입력한다. 예: `job=대기업 / 사무직`.
4. 저장될 JSON 미리보기를 직접 검수한다.
5. 검수가 끝났을 때만 `저장`을 입력한다.

자동 치환 대상:

- 전화번호 → `[전화번호]`
- 이메일 → `[이메일]`
- URL → `[URL]`
- SNS 핸들 → `[SNS]`

자동 치환은 보조 장치다. 저장 전 미리보기에서 이름, 상세 지명, 회사/학교, 고유 사건이 남아 있지 않은지 직접 확인한다.

## Phase 1 — 해부

- `npm run learn:trace -- learning/captures/NNNN.json` → `traces/NNNN.trace.md` 생성.
- 각 단계 "내 코멘트:" 줄을 직접 채운다. 특히 임베딩(LLM 단계 활성화 시) 이웃이 진짜 비슷한지 눈으로 검증.

## Phase 2 — 실험노트

1. 캡쳐를 **블라인드 라벨링**(시스템 출력 보기 전 `myLabel` 작성: temperature/topSignal/nextMove).
2. 라벨 단 캡쳐들을 `experiments/dataset.jsonl`(한 줄 = 캡쳐 1개)에 모은다.
3. `npm run learn:eval` → 시스템 temperature vs 내 라벨 표 + distance + 불일치 목록.
4. 불일치마다 왜 갈렸는지 기록 → Phase 3 후보.

## Phase 3 — 개선루프

1. 불일치 하나 선택 → `templates/experiment-card.md` 복사해 `experiments/cards/NNN.md`.
2. **딱 한 변수만** 바꾼다(룰 임계값/프롬프트/few-shot 중 하나).
3. 같은 dataset으로 `npm run learn:eval` 재측정 → before/after 기록.
4. 가설이 틀려도 카드에 남긴다. 작은 표본 과적합을 경계.
