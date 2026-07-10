# Mobile Unified Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일에서 최대 20장의 대화 캡처, 붙여넣은 채팅, 실제 만남 후기를 단독 또는 함께 검수하고 분석하는 완전한 흐름을 구현한다.

**Architecture:** `AnalysisDraft`를 단일 상태 원본으로 두고 `AsyncStorage`와 앱 캐시에 초안을 보존한다. OCR, 텍스트 병합·치환, API 요청 생성, SSE 해석은 화면과 분리된 순수 모듈로 구현하며 Expo Router 화면은 `입력 → OCR 검수 → 상황 입력 → 최종 확인 → 결과` 순서로 구성한다.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, Expo Router 6, TypeScript 5.9, `expo-image-picker`, `expo-file-system`, `expo/fetch`, `expo-clipboard`, AsyncStorage, Jest Expo, React Native Testing Library

## Global Constraints

- Expo SDK는 `54.0.x`를 유지하고 새 Expo 패키지는 반드시 `npx expo install`로 호환 버전을 설치한다.
- 이미지 선택은 최대 20장, OCR 동시 요청은 최대 2건이다.
- 지원 이미지 형식은 PNG, JPEG, WEBP, GIF이며 이미지 한 장의 최대 크기는 10MB다.
- OCR 결과는 사용자가 검수하고 치환한 뒤에만 분석 입력으로 사용한다.
- 원본 이미지와 원문 대화는 앱 로그에 남기지 않는다.
- 원본 이미지는 OCR 요청 이외의 서버 저장소에 보관하지 않는다.
- 상황만으로 분석할 때 자유 입력은 20자 이상, 전체 상황 입력은 2,000자 이하여야 한다.
- 결과 순서는 실제 만남 신호, 채팅 신호, 종합 판단, 다음 행동, 추천 메시지다.
- 로그인, 결제, 기록 목록, 학습용 피드백 화면은 이번 구현에 포함하지 않는다.
- 모든 새 화면은 최소 터치 영역 44pt, 접근성 레이블, 큰 글자 줄바꿈을 지원한다.
- 색상은 짙은 중립색, 녹색, 황색을 역할별로 사용하고 장식용 카드 중첩을 만들지 않는다.

---

## File Map

- `signalmate-app/lib/analysis/types.ts`: 초안, API, 분석 결과의 공용 타입
- `signalmate-app/lib/analysis/draft.ts`: 빈 초안, 복구 정규화, 이미지 순서 변경
- `signalmate-app/lib/analysis/draft-storage.ts`: AsyncStorage 저장·복구
- `signalmate-app/lib/analysis/image-cache.ts`: 선택 이미지의 앱 캐시 복사·삭제
- `signalmate-app/lib/analysis/input-builder.ts`: OCR 병합, 중복 후보, 치환, 검증, 요청 생성
- `signalmate-app/lib/analysis/ocr-queue.ts`: 동시 실행 수 2인 OCR 큐
- `signalmate-app/lib/analysis/signal-groups.ts`: 실제 만남·후속 연락·채팅·불확실 신호 분류
- `signalmate-app/lib/api/client.ts`: 응답 검증, 이미지 추출, 대화 생성, 분석 스트림 호출
- `signalmate-app/lib/api/sse.ts`: 분할된 SSE 프레임 조립과 분석 상태 누적
- `signalmate-app/providers/analysis-provider.tsx`: 초안, 저장, 분석 결과의 앱 전역 수명 관리
- `signalmate-app/components/ui/*`: 화면 셸, 분할 선택, 선택 칩, 하단 명령
- `signalmate-app/components/capture/*`: 이미지 목록과 OCR 상태
- `signalmate-app/components/review/*`: OCR 편집, 치환 규칙, 중복 후보
- `signalmate-app/app/index.tsx`: 주 입력 선택과 텍스트 입력
- `signalmate-app/app/capture.tsx`: 다중 이미지 선택, 순서 조정, OCR 실행
- `signalmate-app/app/ocr-review.tsx`: 이미지별 OCR 검수와 개인정보 치환
- `signalmate-app/app/situation.tsx`: 관계 단계, 만남 경로, 만남 후기 입력
- `signalmate-app/app/review.tsx`: 최종 입력 요약과 분석 실행
- `signalmate-app/app/result.tsx`: B안 신호 우선 결과 화면
- `signalmate-app/app/_layout.tsx`: Provider와 화면 경로 연결

### Task 1: Expo 54 의존성과 분석 도메인 기초

**Files:**
- Modify: `signalmate-app/package.json`
- Modify: `signalmate-app/package-lock.json`
- Modify: `signalmate-app/app.json`
- Modify: `signalmate-app/tsconfig.json`
- Create: `signalmate-app/lib/analysis/types.ts`
- Create: `signalmate-app/lib/analysis/draft.ts`
- Test: `signalmate-app/lib/analysis/__tests__/draft.test.ts`

**Interfaces:**
- Produces: `AnalysisDraft`, `ImageDraftItem`, `GuidedAnswers`, `AnalysisResult`, `createEmptyDraft()`, `normalizeRestoredDraft()`, `moveDraftImage()`
- Consumes: 없음

- [ ] **Step 1: Expo 54 호환 런타임과 테스트 의존성을 설치한다**

Run:

```bash
cd signalmate-app
npx expo install react-dom@19.1.0 react-native-web @expo/metro-runtime
npx expo install expo-image-picker expo-file-system expo-clipboard react-native-svg
npm install lucide-react-native
npx expo install jest-expo jest @types/jest @testing-library/react-native -- --dev
```

첫 명령은 `expo-router`의 선택적 peer가 최신 `react-dom`을 자동 선택해 React 19.1.0과 충돌하지 않도록 웹 런타임 버전을 직접 고정한다. Expected: 설치가 종료 코드 0으로 끝나고 `package-lock.json`이 갱신되며 `npm ls react react-dom`에 peer 충돌이 없다.

- [ ] **Step 2: 테스트 설정과 사진 접근 문구를 추가한다**

`package.json`에 다음 스크립트와 Jest 설정을 추가한다.

```json
{
  "scripts": {
    "test": "jest --runInBand",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  },
  "jest": {
    "preset": "jest-expo",
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|expo-router|@react-navigation/.*|lucide-react-native|react-native-svg)"
    ]
  }
}
```

`tsconfig.json`의 `compilerOptions.types`에 `jest`를 추가한다. `app.json`의 `plugins`에는 다음을 추가한다.

```json
[
  "expo-image-picker",
  {
    "photosPermission": "대화 캡처를 선택하기 위해 사진에 접근합니다.",
    "cameraPermission": false,
    "microphonePermission": false
  }
]
```

- [ ] **Step 3: 초안 복구와 이미지 순서 변경의 실패 테스트를 작성한다**

```ts
import {
  createEmptyDraft,
  moveDraftImage,
  normalizeRestoredDraft,
} from '../draft';

describe('analysis draft', () => {
  test('새 초안은 필수 상황값을 아직 선택하지 않은 상태다', () => {
    const draft = createEmptyDraft();
    expect(draft.primaryInput).toBeNull();
    expect(draft.relationshipStage).toBeNull();
    expect(draft.meetingChannel).toBeNull();
    expect(draft.images).toEqual([]);
  });

  test('앱 재실행 시 중단된 추출 상태를 대기로 되돌린다', () => {
    const draft = createEmptyDraft();
    draft.images = [
      {
        id: 'img-1', order: 0, uri: 'file://1.png', fileName: '1.png',
        mimeType: 'image/png', fileSize: 10, status: 'extracting',
        extractedText: '', editedText: '', notes: [], errorCode: null,
        reviewed: false,
      },
    ];
    expect(normalizeRestoredDraft(draft).images[0].status).toBe('queued');
  });

  test('이미지 이동 뒤 order를 0부터 다시 매긴다', () => {
    const draft = createEmptyDraft();
    draft.images = ['a', 'b', 'c'].map((id, order) => ({
      id, order, uri: `file://${id}.png`, fileName: `${id}.png`,
      mimeType: 'image/png', fileSize: 10, status: 'queued' as const,
      extractedText: '', editedText: '', notes: [], errorCode: null,
      reviewed: false,
    }));
    expect(moveDraftImage(draft.images, 2, 0).map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(moveDraftImage(draft.images, 2, 0).map((item) => item.order)).toEqual([0, 1, 2]);
  });
});
```

- [ ] **Step 4: 테스트가 모듈 없음으로 실패하는지 확인한다**

Run: `npm test -- lib/analysis/__tests__/draft.test.ts`

Expected: FAIL with `Cannot find module '../draft'`.

- [ ] **Step 5: 공용 타입과 초안 함수를 구현한다**

`types.ts`에는 다음 계약을 정의한다.

```ts
export type PrimaryInput = 'capture' | 'text' | 'meeting_note';
export type OcrStatus = 'queued' | 'extracting' | 'complete' | 'failed';
export type RelationshipStage =
  | 'before_meeting' | 'after_first_date' | 'after_second_date' | 'cooling_down';
export type MeetingChannel = 'blind_date' | 'dating_app' | 'mutual_friend' | 'other';
export type DesiredHelp = 'next_message' | 'ask_for_date' | 'wait_or_send' | 'decide_to_stop';

export type GuidedAnswers = {
  inputFocus: 'chat' | 'meeting_note' | 'mixed' | 'follow_up';
  meetingCount: 'none' | 'once' | '2_3_times' | '4_plus';
  meetingVibe: 'none' | 'awkward' | 'normal' | 'good' | 'great';
  otherInitiative: 'low' | 'medium' | 'high' | 'unknown';
  afterMeetingContact: 'none' | 'self_first' | 'other_first' | 'slower' | 'ongoing' | 'not_applicable';
  desiredHelp: DesiredHelp;
  otherStyle: string[];
  freeText: string;
};

export type ImageDraftItem = {
  id: string;
  order: number;
  uri: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: OcrStatus;
  extractedText: string;
  editedText: string;
  notes: string[];
  errorCode: string | null;
  reviewed: boolean;
};

export type ReplacementRule = { id: string; source: string; replacement: string };

export type ConversationSnapshot = {
  id: string;
  rawText: string;
  situationContext: string | null;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  messages: Array<{
    senderRole: string; messageText: string; sentAt: string | null; sequenceNo: number;
  }>;
};

export type AnalysisDraft = {
  version: 1;
  primaryInput: PrimaryInput | null;
  images: ImageDraftItem[];
  pastedText: string;
  replacementRules: ReplacementRule[];
  excludedDuplicateIds: string[];
  relationshipStage: RelationshipStage | null;
  meetingChannel: MeetingChannel | null;
  guidedAnswers: GuidedAnswers;
  createdConversation: ConversationSnapshot | null;
  updatedAt: string;
};

export type SignalType = 'positive' | 'ambiguous' | 'caution';
export type AnalysisSignal = {
  id: string; signalType: SignalType; signalKey: string; title: string;
  description: string; evidenceText: string; confidenceLevel: 'low' | 'medium' | 'high';
  displayOrder: number;
};
export type AnalysisRecommendation = {
  id: string; recommendationType: 'next_message' | 'tone_guide' | 'avoid_phrase';
  title: string; content: string; rationale: string; toneLabel: string | null;
  displayOrder: number;
};
export type AnalysisResult = {
  analysisId: string; overallSummary: string; signals: AnalysisSignal[];
  recommendations: AnalysisRecommendation[];
  recommendedAction: string; recommendedActionReason: string;
  confidenceLevel: 'low' | 'medium' | 'high'; warnings: string[];
};
```

`draft.ts`에는 다음 함수를 구현한다.

```ts
import type { AnalysisDraft, ImageDraftItem } from './types';

export function createEmptyDraft(now = new Date().toISOString()): AnalysisDraft {
  return {
    version: 1,
    primaryInput: null,
    images: [],
    pastedText: '',
    replacementRules: [],
    excludedDuplicateIds: [],
    relationshipStage: null,
    meetingChannel: null,
    guidedAnswers: {
      inputFocus: 'chat', meetingCount: 'none', meetingVibe: 'none',
      otherInitiative: 'unknown', afterMeetingContact: 'not_applicable',
      desiredHelp: 'next_message', otherStyle: [], freeText: '',
    },
    createdConversation: null,
    updatedAt: now,
  };
}

export function normalizeRestoredDraft(draft: AnalysisDraft): AnalysisDraft {
  return {
    ...draft,
    images: draft.images.map((image) => ({
      ...image,
      status: image.status === 'extracting' ? 'queued' : image.status,
    })),
  };
}

export function moveDraftImage(
  images: ImageDraftItem[],
  from: number,
  to: number,
): ImageDraftItem[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
    return images;
  }
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((image, order) => ({ ...image, order }));
}
```

- [ ] **Step 6: 단위 테스트와 타입 검사를 통과시킨다**

Run: `npm test -- lib/analysis/__tests__/draft.test.ts && npm run typecheck`

Expected: 모든 테스트 PASS, TypeScript 오류 0개.

- [ ] **Step 7: 커밋한다**

```bash
git add signalmate-app/package.json signalmate-app/package-lock.json signalmate-app/app.json signalmate-app/tsconfig.json signalmate-app/lib/analysis
git commit -m "feat(app): add unified analysis domain foundation"
```

### Task 2: 초안 저장과 이미지 캐시 수명

**Files:**
- Create: `signalmate-app/lib/analysis/draft-storage.ts`
- Create: `signalmate-app/lib/analysis/image-cache.ts`
- Test: `signalmate-app/lib/analysis/__tests__/draft-storage.test.ts`
- Test: `signalmate-app/lib/analysis/__tests__/image-cache.test.ts`

**Interfaces:**
- Consumes: `AnalysisDraft`, `normalizeRestoredDraft()`
- Produces: `createDraftStorage()`, `draftStorage`, `cachePickedImage()`, `deleteCachedImage()`, `clearCachedImages()`

- [ ] **Step 1: 저장·복구와 파일명 정규화의 실패 테스트를 작성한다**

```ts
import { createEmptyDraft } from '../draft';
import { createDraftStorage } from '../draft-storage';
import { cacheFileName } from '../image-cache';

test('저장한 초안을 복구하며 extracting을 queued로 바꾼다', async () => {
  const values = new Map<string, string>();
  const storage = createDraftStorage({
    getItem: async (key) => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async (key) => { values.delete(key); },
  });
  const draft = createEmptyDraft();
  draft.images = [{
    id: 'a', order: 0, uri: 'file://a.png', fileName: 'a.png', mimeType: 'image/png',
    fileSize: 1, status: 'extracting', extractedText: '', editedText: '', notes: [],
    errorCode: null, reviewed: false,
  }];
  await storage.save(draft);
  expect((await storage.load())?.images[0].status).toBe('queued');
});

test('캐시 파일명은 식별자와 허용 확장자만 사용한다', () => {
  expect(cacheFileName('abc', 'IMG 1.PNG', 'image/png')).toBe('abc.png');
  expect(cacheFileName('abc', 'IMG.HEIC', 'image/jpeg')).toBe('abc.jpg');
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `npm test -- lib/analysis/__tests__/draft-storage.test.ts lib/analysis/__tests__/image-cache.test.ts`

Expected: 두 모듈을 찾지 못해 FAIL.

- [ ] **Step 3: 주입 가능한 AsyncStorage 래퍼를 구현한다**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeRestoredDraft } from './draft';
import type { AnalysisDraft } from './types';

const DRAFT_KEY = 'signalmate.analysis-draft.v1';
type StoragePort = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export function createDraftStorage(storage: StoragePort) {
  return {
    async load(): Promise<AnalysisDraft | null> {
      const raw = await storage.getItem(DRAFT_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as AnalysisDraft;
        if (parsed.version !== 1 || !Array.isArray(parsed.images)) return null;
        return normalizeRestoredDraft(parsed);
      } catch {
        return null;
      }
    },
    save(draft: AnalysisDraft): Promise<void> {
      return storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    },
    clear(): Promise<void> {
      return storage.removeItem(DRAFT_KEY);
    },
  };
}

export const draftStorage = createDraftStorage(AsyncStorage);
```

- [ ] **Step 4: Expo FileSystem의 새 `File` API로 캐시 수명을 구현한다**

```ts
import { Directory, File, Paths } from 'expo-file-system';

const CACHE_DIR = new Directory(Paths.cache, 'signalmate-analysis');
const MIME_EXTENSION: Record<string, string> = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif',
};

export function cacheFileName(id: string, fileName: string, mimeType: string): string {
  const sourceExtension = fileName.match(/\.(png|jpe?g|webp|gif)$/i)?.[0].toLowerCase();
  const extension = MIME_EXTENSION[mimeType] ?? sourceExtension ?? '.jpg';
  return `${id}${extension === '.jpeg' ? '.jpg' : extension}`;
}

export function cachePickedImage(
  sourceUri: string,
  id: string,
  fileName: string,
  mimeType: string,
): string {
  CACHE_DIR.create({ idempotent: true, intermediates: true });
  const source = new File(sourceUri);
  const target = new File(CACHE_DIR, cacheFileName(id, fileName, mimeType));
  if (target.exists) target.delete();
  source.copy(target);
  return target.uri;
}

export function deleteCachedImage(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

export function clearCachedImages(): void {
  if (CACHE_DIR.exists) CACHE_DIR.delete();
}
```

- [ ] **Step 5: 테스트와 타입 검사를 통과시킨다**

Run: `npm test -- lib/analysis/__tests__/draft-storage.test.ts lib/analysis/__tests__/image-cache.test.ts && npm run typecheck`

Expected: PASS. `image-cache.test.ts`에서는 `expo-file-system`을 다음처럼 고정 mock하고 `cacheFileName()`을 실제 검증 대상으로 유지한다.

```ts
jest.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file://cache/' } },
  Directory: class {
    uri = 'file://cache/signalmate-analysis/'; exists = false;
    create = jest.fn(); delete = jest.fn();
  },
  File: class {
    uri = 'file://cache/mock.png'; exists = false;
    copy = jest.fn(); delete = jest.fn();
  },
}));
```

- [ ] **Step 6: 커밋한다**

```bash
git add signalmate-app/lib/analysis
git commit -m "feat(app): persist analysis drafts and cached captures"
```

### Task 3: OCR 병합, 치환, 중복 탐지, 요청 생성

**Files:**
- Create: `signalmate-app/lib/analysis/input-builder.ts`
- Test: `signalmate-app/lib/analysis/__tests__/input-builder.test.ts`

**Interfaces:**
- Consumes: `AnalysisDraft`, `ReplacementRule`, `GuidedAnswers`
- Produces: `applyReplacementRules()`, `findDuplicateCandidates()`, `buildMergedChatText()`, `validateDraft()`, `buildConversationRequest()`

- [ ] **Step 1: 핵심 입력 변환의 실패 테스트를 작성한다**

```ts
import { createEmptyDraft } from '../draft';
import {
  applyReplacementRules,
  buildConversationRequest,
  buildMergedChatText,
  findDuplicateCandidates,
  validateDraft,
} from '../input-builder';

test('치환값을 정규식이 아닌 일반 문자열로 적용한다', () => {
  expect(applyReplacementRules('김진하님 김진하', [
    { id: '1', source: '김진하', replacement: '[내이름]' },
  ])).toBe('[내이름]님 [내이름]');
});

test('연속 캡처의 suffix와 prefix가 같은 줄을 중복 후보로 찾는다', () => {
  const candidates = findDuplicateCandidates([
    { imageId: 'a', text: '나: 안녕\n상대: 반가워' },
    { imageId: 'b', text: '상대: 반가워\n나: 오늘 어땠어?' },
  ]);
  expect(candidates).toEqual([{ id: 'b:0', imageId: 'b', lineIndex: 0, text: '상대: 반가워' }]);
});

test('선택한 중복 줄을 제외하고 이미지 순서와 붙여넣기 텍스트를 합친다', () => {
  const draft = createEmptyDraft();
  draft.images = [
    { id: 'a', order: 0, uri: 'a', fileName: 'a.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '나: 안녕\n상대: 반가워', notes: [], errorCode: null, reviewed: true },
    { id: 'b', order: 1, uri: 'b', fileName: 'b.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '상대: 반가워\n나: 또 봐요', notes: [], errorCode: null, reviewed: true },
  ];
  draft.excludedDuplicateIds = ['b:0'];
  draft.pastedText = '상대: 좋아요';
  expect(buildMergedChatText(draft)).toBe('나: 안녕\n상대: 반가워\n나: 또 봐요\n\n상대: 좋아요');
});

test('만남 후기만 20자 이상이면 분석 가능하다', () => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '대화는 편했고 상대가 먼저 다음 장소를 이야기했다.';
  expect(validateDraft(draft)).toEqual({ valid: true, errors: [] });
});

test('원하는 도움을 API userGoal로 변환한다', () => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.desiredHelp = 'ask_for_date';
  draft.guidedAnswers.freeText = '대화는 편했고 상대가 먼저 다음 장소를 이야기했다.';
  expect(buildConversationRequest(draft).userGoal).toBe('ask_for_date');
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `npm test -- lib/analysis/__tests__/input-builder.test.ts`

Expected: `input-builder` 모듈 없음으로 FAIL.

- [ ] **Step 3: 문자열 치환과 중복 후보 탐지를 구현한다**

```ts
import type { AnalysisDraft, ReplacementRule } from './types';

export type DuplicateCandidate = {
  id: string; imageId: string; lineIndex: number; text: string;
};

const normalizeLine = (line: string) => line.trim().replace(/\s+/g, ' ');

export function applyReplacementRules(text: string, rules: ReplacementRule[]): string {
  return rules.reduce((result, rule) => {
    if (!rule.source) return result;
    return result.split(rule.source).join(rule.replacement);
  }, text);
}

export function findDuplicateCandidates(
  items: Array<{ imageId: string; text: string }>,
): DuplicateCandidate[] {
  const result: DuplicateCandidate[] = [];
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1].text.split(/\r?\n/).filter(Boolean);
    const current = items[index].text.split(/\r?\n/).filter(Boolean);
    const max = Math.min(previous.length, current.length);
    let overlap = 0;
    for (let size = max; size > 0; size -= 1) {
      const suffix = previous.slice(-size).map(normalizeLine);
      const prefix = current.slice(0, size).map(normalizeLine);
      if (suffix.every((line, lineIndex) => line === prefix[lineIndex])) {
        overlap = size;
        break;
      }
    }
    for (let lineIndex = 0; lineIndex < overlap; lineIndex += 1) {
      result.push({
        id: `${items[index].imageId}:${lineIndex}`,
        imageId: items[index].imageId,
        lineIndex,
        text: current[lineIndex],
      });
    }
  }
  return result;
}
```

- [ ] **Step 4: 병합, 검증, API 요청 생성을 구현한다**

```ts
const USER_GOAL = {
  next_message: 'continue_chat',
  ask_for_date: 'ask_for_date',
  wait_or_send: 'evaluate_interest',
  decide_to_stop: 'decide_to_stop',
} as const;

export function buildMergedChatText(draft: AnalysisDraft): string {
  const imageParts = [...draft.images]
    .sort((a, b) => a.order - b.order)
    .filter((image) => image.status === 'complete')
    .map((image) => image.editedText.split(/\r?\n/)
      .filter((_, lineIndex) => !draft.excludedDuplicateIds.includes(`${image.id}:${lineIndex}`))
      .join('\n').trim())
    .filter(Boolean);
  return [...imageParts, draft.pastedText.trim()].filter(Boolean).join('\n\n');
}

export function recognizedChatCount(text: string): number {
  return text.split(/\r?\n/).filter((line) =>
    /^(?:\[[^\]]+\]\s*)?(?:나|저|상대|상대방)\s*[:：]\s*\S+/.test(line.trim()),
  ).length;
}

export function validateDraft(draft: AnalysisDraft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const chatText = buildMergedChatText(draft);
  if (!draft.primaryInput) errors.push('입력 방식을 선택해 주세요.');
  if (!draft.relationshipStage) errors.push('관계 단계를 선택해 주세요.');
  if (!draft.meetingChannel) errors.push('만난 경로를 선택해 주세요.');
  if (draft.guidedAnswers.freeText.trim().length > 2000) errors.push('만남 후기는 2,000자 이하여야 해요.');
  const situationAllowed = draft.guidedAnswers.inputFocus !== 'chat'
    && draft.guidedAnswers.freeText.trim().length >= 20;
  if (recognizedChatCount(chatText) < 2 && !situationAllowed) {
    errors.push('대화 두 줄 이상 또는 20자 이상의 만남 후기가 필요해요.');
  }
  if (draft.images.some((image) => image.status === 'complete' && !image.reviewed)) {
    errors.push('추출된 캡처 내용을 모두 검수해 주세요.');
  }
  return { valid: errors.length === 0, errors };
}

export function buildConversationRequest(draft: AnalysisDraft) {
  const validation = validateDraft(draft);
  if (!validation.valid || !draft.relationshipStage || !draft.meetingChannel) {
    throw new Error(validation.errors[0] ?? '분석 입력이 완성되지 않았어요.');
  }
  return {
    title: '모바일 분석',
    sourceType: draft.images.length > 0 ? 'mobile_capture' : 'mobile_manual',
    relationshipStage: draft.relationshipStage,
    meetingChannel: draft.meetingChannel,
    userGoal: USER_GOAL[draft.guidedAnswers.desiredHelp],
    saveMode: 'temporary' as const,
    rawText: buildMergedChatText(draft),
    selfName: '나',
    guidedAnswers: draft.guidedAnswers,
  };
}
```

- [ ] **Step 5: 전체 입력 변환 테스트를 통과시킨다**

Run: `npm test -- lib/analysis/__tests__/input-builder.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add signalmate-app/lib/analysis/input-builder.ts signalmate-app/lib/analysis/__tests__/input-builder.test.ts
git commit -m "feat(app): build reviewed multi-source analysis input"
```

### Task 4: 검증된 API 클라이언트, SSE, OCR 큐

**Files:**
- Create: `signalmate-app/lib/api/sse.ts`
- Create: `signalmate-app/lib/api/client.ts`
- Create: `signalmate-app/lib/analysis/ocr-queue.ts`
- Test: `signalmate-app/lib/api/__tests__/sse.test.ts`
- Test: `signalmate-app/lib/api/__tests__/client.test.ts`
- Test: `signalmate-app/lib/analysis/__tests__/ocr-queue.test.ts`

**Interfaces:**
- Consumes: `AnalysisSignal`, `AnalysisRecommendation`, `ImageDraftItem`, `buildConversationRequest()` 결과
- Produces: `SseDecoder`, `reduceAnalysisEvent()`, `extractImage()`, `createConversation()`, `streamAnalysis()`, `runOcrQueue()`

- [ ] **Step 1: 분할 SSE와 동시 실행 제한의 실패 테스트를 작성한다**

```ts
import { SseDecoder } from '../sse';
import { runOcrQueue } from '../../analysis/ocr-queue';

test('네트워크 청크 중간에서 잘린 SSE 프레임을 조립한다', () => {
  const decoder = new SseDecoder();
  expect(decoder.push('event: progress\ndata: {"type":"rule_')).toEqual([]);
  expect(decoder.push('complete"}\n\n')).toEqual([
    { event: 'progress', data: { type: 'rule_complete' } },
  ]);
});

test('OCR 작업은 동시에 두 건을 넘지 않는다', async () => {
  let running = 0;
  let maximum = 0;
  await runOcrQueue(['a', 'b', 'c', 'd'], async (id) => {
    running += 1;
    maximum = Math.max(maximum, running);
    await Promise.resolve();
    running -= 1;
    return id;
  }, 2);
  expect(maximum).toBe(2);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- lib/api/__tests__/sse.test.ts lib/analysis/__tests__/ocr-queue.test.ts`

Expected: 모듈 없음으로 FAIL.

- [ ] **Step 3: SSE 디코더와 OCR 큐를 구현한다**

```ts
export type SseFrame = { event: string; data: unknown };

export class SseDecoder {
  private buffer = '';

  push(chunk: string): SseFrame[] {
    this.buffer += chunk.replace(/\r\n/g, '\n');
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() ?? '';
    return blocks.flatMap((block) => {
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length === 0) return [];
      return [{ event, data: JSON.parse(data.join('\n')) }];
    });
  }
}
```

```ts
export async function runOcrQueue<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 2,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = new Array(items.length);
  let cursor = 0;
  async function consume() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(items[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}
```

- [ ] **Step 4: API 응답 계약 테스트를 작성한다**

Mock `expo/fetch`로 다음을 검증한다.

```ts
test('대화 생성 성공 응답에서 data.conversation을 반환한다', async () => {
  mockFetch.mockResolvedValue(response(201, {
    success: true,
    data: { conversation: {
      id: 'conv-1', rawText: '나: 안녕\n상대: 안녕', situationContext: null,
      relationshipStage: 'before_meeting', meetingChannel: 'blind_date',
      userGoal: 'continue_chat', messages: [],
    } },
    error: null,
  }));
  await expect(createConversation(validRequest)).resolves.toMatchObject({ id: 'conv-1' });
});

test('success가 true여도 conversation이 없으면 응답 오류를 던진다', async () => {
  mockFetch.mockResolvedValue(response(200, { success: true, data: {}, error: null }));
  await expect(createConversation(validRequest)).rejects.toThrow('서버 응답 형식');
});
```

- [ ] **Step 5: `expo/fetch` 기반 API 클라이언트를 구현한다**

`client.ts`의 공개 계약은 다음과 같다.

```ts
import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';
import { SseDecoder } from './sse';
import type {
  AnalysisResult, AnalysisSignal, AnalysisRecommendation, ConversationSnapshot,
} from '../analysis/types';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL
  ?? 'https://landing-page-nextjs-rust-six.vercel.app/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

export type ExtractedImage = { rawText: string; messageCount: number; notes: string[] };
export type CreatedConversation = ConversationSnapshot;

async function readEnvelope<T>(response: Response, pick: (data: unknown) => T | null): Promise<T> {
  const body = await response.json() as {
    success?: boolean; data?: unknown; error?: { code?: string; message?: string } | null;
  };
  if (!response.ok || body.success !== true) {
    throw new ApiError(body.error?.code ?? 'HTTP_ERROR', body.error?.message ?? '요청에 실패했어요.', response.status);
  }
  const value = pick(body.data);
  if (value === null) throw new ApiError('INVALID_RESPONSE', '서버 응답 형식을 확인하지 못했어요.', response.status);
  return value;
}

export async function extractImage(uri: string): Promise<ExtractedImage> {
  const form = new FormData();
  form.append('image', new File(uri));
  const response = await fetch(`${API_BASE_URL}/conversations/extract-from-image`, {
    method: 'POST', body: form,
  });
  return readEnvelope(response, (data) => {
    const value = data as Partial<ExtractedImage> | null;
    return value && typeof value.rawText === 'string' && Array.isArray(value.notes)
      ? { rawText: value.rawText, messageCount: Number(value.messageCount ?? 0), notes: value.notes }
      : null;
  });
}

export async function createConversation(request: unknown): Promise<CreatedConversation> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  });
  return readEnvelope(response, (data) => {
    const value = (data as { conversation?: CreatedConversation } | null)?.conversation;
    return value && typeof value.id === 'string' && Array.isArray(value.messages) ? value : null;
  });
}
```

`streamAnalysis()`는 생성된 대화를 `conversationInline`으로 보내고 `rule_complete`, `signals_enhanced`, `recommendations_ready`, `stage_warning`, `complete`, `error` 프레임을 다음처럼 누적한다.

```ts
function isSignalArray(value: unknown): value is AnalysisSignal[] {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item === 'object'
    && typeof (item as AnalysisSignal).id === 'string'
    && typeof (item as AnalysisSignal).signalKey === 'string',
  );
}

function isRecommendationArray(value: unknown): value is AnalysisRecommendation[] {
  return Array.isArray(value) && value.every((item) =>
    item && typeof item === 'object'
    && typeof (item as AnalysisRecommendation).id === 'string'
    && typeof (item as AnalysisRecommendation).content === 'string',
  );
}

export async function streamAnalysis(conversation: CreatedConversation): Promise<AnalysisResult> {
  const response = await fetch(`${API_BASE_URL}/conversations/${conversation.id}/analyses/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      conversationInline: {
        rawText: conversation.rawText,
        relationshipStage: conversation.relationshipStage,
        meetingChannel: conversation.meetingChannel,
        userGoal: conversation.userGoal,
        situationContext: conversation.situationContext,
        messages: conversation.messages,
      },
    }),
  });
  if (!response.ok || !response.body) {
    throw new ApiError('STREAM_UNAVAILABLE', '분석 연결을 시작하지 못했어요.', response.status);
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const sseDecoder = new SseDecoder();
  const result: AnalysisResult = {
    analysisId: '', overallSummary: '', signals: [], recommendations: [],
    recommendedAction: '', recommendedActionReason: '', confidenceLevel: 'low', warnings: [],
  };
  let complete = false;

  while (true) {
    const next = await reader.read();
    if (next.done) break;
    const frames = sseDecoder.push(textDecoder.decode(next.value, { stream: true }));
    for (const frame of frames) {
      const event = frame.data as Record<string, unknown>;
      if (frame.event === 'error') {
        throw new ApiError('ANALYSIS_FAILED', String(event.message ?? '분석에 실패했어요.'), 502);
      }
      if (event.type === 'rule_complete') {
        if (isSignalArray(event.signals)) result.signals = event.signals;
        if (typeof event.overallSummary === 'string') result.overallSummary = event.overallSummary;
        if (typeof event.recommendedAction === 'string') result.recommendedAction = event.recommendedAction;
        if (typeof event.recommendedActionReason === 'string') result.recommendedActionReason = event.recommendedActionReason;
        if (event.confidenceLevel === 'low' || event.confidenceLevel === 'medium' || event.confidenceLevel === 'high') {
          result.confidenceLevel = event.confidenceLevel;
        }
      } else if (event.type === 'signals_enhanced') {
        if (isSignalArray(event.signals)) result.signals = event.signals;
        if (typeof event.overallSummary === 'string') result.overallSummary = event.overallSummary;
      } else if (event.type === 'recommendations_ready') {
        if (isRecommendationArray(event.recommendations)) result.recommendations = event.recommendations;
        if (typeof event.recommendedActionReason === 'string') result.recommendedActionReason = event.recommendedActionReason;
      } else if (event.type === 'stage_warning' && typeof event.message === 'string') {
        result.warnings.push(event.message);
      } else if (event.type === 'complete' && typeof event.analysisId === 'string') {
        result.analysisId = event.analysisId;
        complete = true;
      }
    }
  }
  if (!complete) {
    throw new ApiError('INCOMPLETE_STREAM', '분석 연결이 완료되기 전에 끊겼어요.', 502);
  }
  return result;
}
```

- [ ] **Step 6: 클라이언트와 스트림 테스트를 통과시킨다**

Run: `npm test -- lib/api lib/analysis/__tests__/ocr-queue.test.ts && npm run typecheck`

Expected: PASS. 분할 프레임, 오류 프레임, 완료 없는 스트림을 각각 검증한다.

- [ ] **Step 7: 커밋한다**

```bash
git add signalmate-app/lib/api signalmate-app/lib/analysis/ocr-queue.ts signalmate-app/lib/analysis/__tests__/ocr-queue.test.ts
git commit -m "feat(app): add resilient OCR and analysis API client"
```

### Task 5: 초안 Provider와 공용 모바일 UI

**Files:**
- Create: `signalmate-app/providers/analysis-provider.tsx`
- Create: `signalmate-app/components/ui/screen-shell.tsx`
- Create: `signalmate-app/components/ui/segmented-control.tsx`
- Create: `signalmate-app/components/ui/choice-chips.tsx`
- Create: `signalmate-app/components/ui/bottom-action.tsx`
- Create: `signalmate-app/components/ui/theme.ts`
- Modify: `signalmate-app/app/_layout.tsx`
- Test: `signalmate-app/providers/__tests__/analysis-provider.test.tsx`
- Test: `signalmate-app/components/ui/__tests__/segmented-control.test.tsx`

**Interfaces:**
- Consumes: `AnalysisDraft`, `AnalysisResult`, `draftStorage`, `clearCachedImages()`
- Produces: `AnalysisProvider`, `useAnalysis()`, `ScreenShell`, `SegmentedControl`, `ChoiceChips`, `BottomAction`

- [ ] **Step 1: Provider 복구와 초기화의 실패 테스트를 작성한다**

```tsx
test('저장된 초안을 복구한 뒤 자식 화면을 렌더링한다', async () => {
  mockedDraftStorage.load.mockResolvedValue(savedDraft);
  const Probe = () => <Text>{useAnalysis().draft.pastedText}</Text>;
  const { findByText } = render(<AnalysisProvider><Probe /></AnalysisProvider>);
  await findByText(savedDraft.pastedText);
});

test('새 분석은 저장소와 이미지 캐시를 함께 비운다', async () => {
  const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
  await act(() => result.current.resetDraft());
  expect(mockedDraftStorage.clear).toHaveBeenCalled();
  expect(mockedClearCachedImages).toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- providers/__tests__/analysis-provider.test.tsx`

Expected: Provider 모듈 없음으로 FAIL.

- [ ] **Step 3: Provider를 구현한다**

공개 컨텍스트 계약을 다음으로 고정한다.

```ts
type AnalysisContextValue = {
  hydrated: boolean;
  draft: AnalysisDraft;
  result: AnalysisResult | null;
  updateDraft: (updater: (draft: AnalysisDraft) => AnalysisDraft) => void;
  setResult: (result: AnalysisResult | null) => void;
  resetDraft: () => Promise<void>;
};
```

`AnalysisProvider`는 마운트 시 `draftStorage.load()`를 한 번 호출하고, 복구가 끝난 뒤의 초안 변경만 150ms debounce로 저장한다. `resetDraft()`는 `draftStorage.clear()`, `clearCachedImages()`, `createEmptyDraft()`, `setResult(null)`을 순서대로 실행한다. Context 밖에서 `useAnalysis()`를 호출하면 명시적 오류를 던진다.

- [ ] **Step 4: 공용 UI의 상호작용 테스트를 작성한다**

```tsx
test('분할 선택은 선택값과 접근성 상태를 노출한다', () => {
  const onChange = jest.fn();
  const screen = render(<SegmentedControl
    value="capture"
    onChange={onChange}
    options={[{ value: 'capture', label: '캡처' }, { value: 'text', label: '텍스트' }]}
  />);
  expect(screen.getByRole('button', { name: '캡처' })).toHaveAccessibilityState({ selected: true });
  fireEvent.press(screen.getByRole('button', { name: '텍스트' }));
  expect(onChange).toHaveBeenCalledWith('text');
});
```

- [ ] **Step 5: 공용 UI와 테마를 구현한다**

`theme.ts`는 다음 토큰을 내보낸다.

```ts
export const colors = {
  background: '#FFFFFF', surface: '#F7F7F4', text: '#20201D', muted: '#747169',
  border: '#D8D6CE', positive: '#287B53', positiveSurface: '#EDF6F1',
  caution: '#A56C12', cautionSurface: '#FFF7E8', danger: '#B44836',
} as const;
export const radius = { control: 8, panel: 8 } as const;
export const touchTarget = 44;
```

`ScreenShell`은 `SafeAreaView`, `KeyboardAvoidingView`, `ScrollView`를 조합하고 하단 여백을 고정한다. `SegmentedControl`은 텍스트가 길어질 때 두 줄을 허용하고 각 버튼 높이를 44pt 이상으로 유지한다. `ChoiceChips`는 다중 또는 단일 선택을 지원하며 `accessibilityState.selected`를 설정한다. `BottomAction`은 화면 하단의 단일 주요 명령과 선택적 보조 명령을 제공한다.

- [ ] **Step 6: Provider를 루트 레이아웃에 연결한다**

```tsx
export default function RootLayout() {
  return (
    <AnalysisProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.text }}>
        <Stack.Screen name="index" options={{ title: '새 분석', headerShown: false }} />
        <Stack.Screen name="capture" options={{ title: '캡처 선택' }} />
        <Stack.Screen name="ocr-review" options={{ title: '추출 내용 검수' }} />
        <Stack.Screen name="situation" options={{ title: '상황 입력' }} />
        <Stack.Screen name="review" options={{ title: '입력 확인' }} />
        <Stack.Screen name="result" options={{ title: '분석 결과', gestureEnabled: false }} />
      </Stack>
    </AnalysisProvider>
  );
}
```

- [ ] **Step 7: 테스트와 타입 검사를 통과시킨다**

Run: `npm test -- providers components/ui && npm run typecheck`

Expected: PASS.

- [ ] **Step 8: 커밋한다**

```bash
git add signalmate-app/providers signalmate-app/components/ui signalmate-app/app/_layout.tsx
git commit -m "feat(app): add persistent analysis flow shell"
```

### Task 6: 입력 시작과 최대 20장 캡처 처리

**Files:**
- Replace: `signalmate-app/app/index.tsx`
- Create: `signalmate-app/app/capture.tsx`
- Create: `signalmate-app/components/capture/image-queue-list.tsx`
- Test: `signalmate-app/app/__tests__/index.test.tsx`
- Test: `signalmate-app/app/__tests__/capture.test.tsx`

**Interfaces:**
- Consumes: `useAnalysis()`, `cachePickedImage()`, `deleteCachedImage()`, `runOcrQueue()`, `extractImage()`
- Produces: 주 입력 선택, 텍스트 입력, 다중 캡처 선택·순서 조정·OCR 상태 갱신

- [ ] **Step 1: 시작 화면의 실패 테스트를 작성한다**

```tsx
test('캡처, 텍스트, 만남 후기 중 하나를 주 입력으로 선택한다', () => {
  const screen = render(<HomeScreen />);
  expect(screen.getByRole('button', { name: '캡처' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '텍스트' })).toBeTruthy();
  expect(screen.getByRole('button', { name: '만남 후기' })).toBeTruthy();
});

test('텍스트 선택 시 입력 후 상황 화면으로 이동할 수 있다', () => {
  const screen = render(<HomeScreen />);
  fireEvent.press(screen.getByRole('button', { name: '텍스트' }));
  fireEvent.changeText(screen.getByPlaceholderText('대화 내용을 붙여넣으세요'), '나: 안녕\n상대: 반가워');
  fireEvent.press(screen.getByRole('button', { name: '상황 정보 입력' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/situation');
});
```

- [ ] **Step 2: 캡처 제한과 부분 실패 테스트를 작성한다**

```tsx
test('사진 선택기는 이미지 최대 20장과 선택 순서를 요청한다', async () => {
  mockedPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
  render(<CaptureScreen />);
  fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));
  await waitFor(() => expect(mockedPicker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({
      mediaTypes: ['images'], allowsMultipleSelection: true,
      selectionLimit: 20, orderedSelection: true, quality: 1,
    }),
  ));
});

test('한 장 OCR 실패 뒤에도 성공한 장의 텍스트를 보존한다', async () => {
  mockedExtractImage
    .mockResolvedValueOnce({ rawText: '나: 안녕', messageCount: 1, notes: [] })
    .mockRejectedValueOnce(new Error('읽기 실패'));
  render(<CaptureScreen />);
  fireEvent.press(screen.getByRole('button', { name: '텍스트 추출' }));
  await screen.findByText('1장 완료');
  expect(screen.getByText('1장 재시도 필요')).toBeTruthy();
});
```

- [ ] **Step 3: 실제 분석 시작 화면을 구현한다**

`index.tsx`는 큰 소개 영역을 제거하고 `SegmentedControl`과 선택된 입력 패널을 첫 화면에 표시한다. 텍스트 모드는 최소 높이 180의 `TextInput`을 제공한다. 캡처 모드는 `/capture`, 만남 후기는 `/situation`으로 이동한다. 저장된 초안이 있으면 `이어서 작성`과 `새로 시작` 명령만 상단에 표시한다.

- [ ] **Step 4: 다중 이미지 선택과 캐시 복사를 구현한다**

사진 선택 호출은 다음 옵션을 정확히 사용한다.

```ts
const result = await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],
  allowsMultipleSelection: true,
  selectionLimit: 20 - draft.images.length,
  orderedSelection: true,
  quality: 1,
});
```

취소 시 초안을 변경하지 않는다. 각 asset은 PNG/JPEG/WEBP/GIF와 10MB 이하인지 검사한 뒤 `cachePickedImage()`로 복사한다. 추가된 순서대로 `order`를 부여한다. Android에서 `ImagePicker.getPendingResultAsync()`가 성공 결과를 반환하면 같은 변환 함수를 재사용한다.

- [ ] **Step 5: 이미지 순서와 OCR 실행 화면을 구현한다**

`ImageQueueList`는 `Image`, 파일명, 상태, 위로, 아래로, 삭제 아이콘 버튼을 표시한다. 위·아래 버튼은 `moveDraftImage()`를 호출하며 첫 항목의 위로 버튼과 마지막 항목의 아래로 버튼은 비활성화한다. 삭제 시 `deleteCachedImage()`와 초안 제거를 함께 실행한다.

OCR 시작 시 queued/failed 항목을 `runOcrQueue(..., 2)`에 전달한다. worker 시작 직전에 `extracting`, 성공 시 `complete`와 `extractedText`/`editedText`/`notes`, 실패 시 `failed`와 오류 코드를 기록한다. 완료 항목이 하나 이상이면 `검수하기`로 `/ocr-review`에 이동할 수 있다.

- [ ] **Step 6: 화면 테스트와 타입 검사를 통과시킨다**

Run: `npm test -- app/__tests__/index.test.tsx app/__tests__/capture.test.tsx && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add signalmate-app/app/index.tsx signalmate-app/app/capture.tsx signalmate-app/app/__tests__ signalmate-app/components/capture
git commit -m "feat(app): add multi-capture OCR input"
```

### Task 7: OCR 검수, 개인정보 치환, 중복 선택

**Files:**
- Create: `signalmate-app/app/ocr-review.tsx`
- Create: `signalmate-app/components/review/replacement-rule-editor.tsx`
- Create: `signalmate-app/components/review/duplicate-candidate-list.tsx`
- Test: `signalmate-app/app/__tests__/ocr-review.test.tsx`
- Test: `signalmate-app/components/review/__tests__/replacement-rule-editor.test.tsx`

**Interfaces:**
- Consumes: `applyReplacementRules()`, `findDuplicateCandidates()`, `useAnalysis()`
- Produces: 이미지별 `editedText`, `reviewed`, `replacementRules`, `excludedDuplicateIds`

- [ ] **Step 1: 검수 완료 조건과 치환 미리보기의 실패 테스트를 작성한다**

```tsx
test('현재 이미지 텍스트를 수정하고 검수 완료로 표시한다', () => {
  const screen = render(<OcrReviewScreen />);
  fireEvent.changeText(screen.getByLabelText('1번 캡처 추출 텍스트'), '나: 수정한 내용');
  fireEvent.press(screen.getByRole('button', { name: '이 캡처 검수 완료' }));
  const updater = mockUpdateDraft.mock.calls.at(-1)?.[0];
  const nextDraft = updater(savedDraft);
  expect(nextDraft.images[0]).toMatchObject({ editedText: '나: 수정한 내용', reviewed: true });
});

test('치환 적용 전에 변경 건수를 보여준다', () => {
  const screen = render(<ReplacementRuleEditor text="진하님 안녕, 진하님" />);
  fireEvent.changeText(screen.getByLabelText('원문'), '진하님');
  fireEvent.changeText(screen.getByLabelText('치환값'), '[내이름]');
  expect(screen.getByText('2곳이 변경돼요')).toBeTruthy();
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `npm test -- app/__tests__/ocr-review.test.tsx components/review`

Expected: 화면과 컴포넌트 모듈 없음으로 FAIL.

- [ ] **Step 3: 이미지별 OCR 편집 화면을 구현한다**

상단에는 `현재 번호 / 전체 완료 이미지 수`와 이전·다음 아이콘 버튼을 둔다. 본문에는 고정 비율 이미지 미리보기와 최소 높이 220의 편집 가능한 텍스트를 둔다. `이 캡처 검수 완료`는 현재 편집값을 저장하고 `reviewed=true`로 바꾼다. 모든 완료 이미지가 reviewed일 때만 다음 단계 버튼을 활성화한다.

- [ ] **Step 4: 치환 규칙과 중복 후보 선택을 구현한다**

`ReplacementRuleEditor`는 원문, 치환값, 일치 건수, 규칙 추가, 삭제, 전체 적용을 제공한다. 빈 원문은 추가하지 못한다. 전체 적용은 모든 `complete` 이미지의 `editedText`와 `pastedText`에 같은 규칙을 적용하되 `extractedText` 원본은 변경하지 않는다.

`DuplicateCandidateList`는 `findDuplicateCandidates()` 결과를 체크박스로 보여준다. 선택 시 후보 id를 `excludedDuplicateIds`에 추가하고 해제 시 제거한다. 중복은 자동 삭제하지 않는다.

- [ ] **Step 5: 모든 검수 테스트와 타입 검사를 통과시킨다**

Run: `npm test -- app/__tests__/ocr-review.test.tsx components/review && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add signalmate-app/app/ocr-review.tsx signalmate-app/app/__tests__/ocr-review.test.tsx signalmate-app/components/review
git commit -m "feat(app): add OCR review and privacy replacement"
```

### Task 8: 상황 설문, 최종 확인, 분석 실행

**Files:**
- Create: `signalmate-app/app/situation.tsx`
- Create: `signalmate-app/app/review.tsx`
- Create: `signalmate-app/components/analysis/input-summary.tsx`
- Test: `signalmate-app/app/__tests__/situation.test.tsx`
- Test: `signalmate-app/app/__tests__/review.test.tsx`

**Interfaces:**
- Consumes: `validateDraft()`, `buildConversationRequest()`, `createConversation()`, `streamAnalysis()`, `useAnalysis()`
- Produces: 필수 상황값, 가이드 답변, 분석 결과 저장 및 `/result` 이동

- [ ] **Step 1: 필수 상황값과 자유 입력 제한의 실패 테스트를 작성한다**

```tsx
test('관계 단계와 만난 경로를 선택해야 다음으로 진행한다', () => {
  const screen = render(<SituationScreen />);
  expect(screen.getByRole('button', { name: '입력 요약 확인' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: '첫 만남 후' }));
  fireEvent.press(screen.getByRole('button', { name: '소개팅' }));
  expect(screen.getByRole('button', { name: '입력 요약 확인' })).toBeEnabled();
});

test('만남 후기 자유 입력은 2,000자를 넘지 못한다', () => {
  const screen = render(<SituationScreen />);
  fireEvent.changeText(screen.getByLabelText('직접 느낀 점'), '가'.repeat(2001));
  expect(screen.getByText('2,000자까지 입력할 수 있어요')).toBeTruthy();
});
```

- [ ] **Step 2: 분석 가능 여부와 재시도의 실패 테스트를 작성한다**

```tsx
test('만남 후기만 20자 이상이면 분석 버튼을 활성화한다', () => {
  const screen = render(<ReviewScreen />);
  expect(screen.getByText('채팅 메시지 0개')).toBeTruthy();
  expect(screen.getByRole('button', { name: '분석하기' })).toBeEnabled();
});

test('분석 실패 뒤 입력을 유지하고 분석만 재시도한다', async () => {
  mockedStreamAnalysis.mockRejectedValueOnce(new Error('network'));
  const screen = render(<ReviewScreen />);
  fireEvent.press(screen.getByRole('button', { name: '분석하기' }));
  await screen.findByRole('button', { name: '분석 다시 시도' });
  expect(mockDraftStorage.clear).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: 상황 설문 화면을 구현한다**

`ChoiceChips`를 사용해 다음 단일 선택을 순서대로 표시한다: 관계 단계, 만난 경로, 입력 중심, 만남 횟수, 분위기, 상대 적극성, 만남 뒤 연락, 원하는 도움. 상대 메시지 스타일은 다중 선택으로 둔다. 자유 입력은 현재 글자 수를 표시하고 2,000자 초과 입력은 상태에 반영하지 않는다.

주 입력에 따라 `inputFocus` 기본값을 정한다: `capture/text → chat`, `meeting_note → meeting_note`. 채팅 입력이 있고 만남 내용을 추가하면 사용자가 `mixed`, 만남 뒤 연락이 핵심이면 `follow_up`을 선택할 수 있다.

- [ ] **Step 4: 최종 입력 요약을 구현한다**

`InputSummary`는 `buildMergedChatText()`와 중복 후보를 이용해 다음 값을 표시한다: 인식된 채팅 메시지 수, 완료/검수된 이미지 수, 만남 후기 글자 수, 관계 단계, 만난 경로, 적용 치환 규칙 수, 제외 중복 수. `validateDraft()` 오류는 입력 위치별 링크와 함께 표시한다.

`정보 더하기`에는 `캡처 추가`, `텍스트 추가`, `만남 정보 수정` 명령을 두고 각각 기존 화면으로 이동한다.

- [ ] **Step 5: 대화 생성과 SSE 분석 실행을 구현한다**

분석 버튼의 실행 순서를 다음으로 고정한다.

```ts
const request = buildConversationRequest(draft);
const conversation = await createConversation(request);
updateDraft((current) => ({ ...current, createdConversation: conversation }));
const result = await streamAnalysis(conversation);
setResult(result);
router.replace('/result');
```

진행 중에는 `대화를 정리하는 중`, `관계 신호를 읽는 중`, `다음 행동을 만드는 중`을 SSE 이벤트에 맞춰 표시한다. 실패하면 현재 초안과 `createdConversation`을 유지한다. 재시도 시 `draft.createdConversation`이 있으면 대화 생성 호출을 반복하지 않고 그 스냅샷으로 `streamAnalysis()`만 다시 실행한다.

- [ ] **Step 6: 상황·요약·분석 테스트와 타입 검사를 통과시킨다**

Run: `npm test -- app/__tests__/situation.test.tsx app/__tests__/review.test.tsx components/analysis && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add signalmate-app/app/situation.tsx signalmate-app/app/review.tsx signalmate-app/app/__tests__ signalmate-app/components/analysis
git commit -m "feat(app): add guided situation and analysis review flow"
```

### Task 9: B안 신호 우선 결과와 최종 통합 검증

**Files:**
- Create: `signalmate-app/lib/analysis/signal-groups.ts`
- Replace: `signalmate-app/app/result.tsx`
- Modify: `signalmate-app/app/_layout.tsx`
- Delete: `signalmate-app/app/analyze.tsx`
- Delete: `signalmate-app/lib/api.ts`
- Create: `signalmate-app/README.md`
- Test: `signalmate-app/lib/analysis/__tests__/signal-groups.test.ts`
- Test: `signalmate-app/app/__tests__/result.test.tsx`

**Interfaces:**
- Consumes: `AnalysisResult`, `useAnalysis()`, `expo-clipboard`
- Produces: 실제 만남 신호 우선 결과 화면, 추천 메시지 복사, 새 분석 초기화

- [ ] **Step 1: 신호 그룹과 결과 순서의 실패 테스트를 작성한다**

```ts
test('실제 만남과 후속 연락 신호를 채팅보다 앞 그룹으로 분리한다', () => {
  const groups = groupSignalsByContext([
    signal('warm_tone'), signal('meeting_positive_vibe'), signal('post_meeting_followup_positive'),
  ]);
  expect(groups.meeting.map((item) => item.signalKey)).toEqual(['meeting_positive_vibe']);
  expect(groups.followUp.map((item) => item.signalKey)).toEqual(['post_meeting_followup_positive']);
  expect(groups.chat.map((item) => item.signalKey)).toEqual(['warm_tone']);
});
```

```tsx
test('결과는 실제 만남 신호를 채팅 신호보다 먼저 표시한다', () => {
  const screen = render(<ResultScreen />);
  const headings = screen.getAllByRole('header').map((node) => node.props.children);
  expect(headings.indexOf('실제 만남 신호')).toBeLessThan(headings.indexOf('채팅 신호'));
});

test('추천 메시지를 시스템 클립보드에 복사한다', async () => {
  const screen = render(<ResultScreen />);
  fireEvent.press(screen.getByRole('button', { name: '추천 메시지 복사' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('다음 주말에 같이 가볼래요?');
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `npm test -- lib/analysis/__tests__/signal-groups.test.ts app/__tests__/result.test.tsx`

Expected: 새 그룹 모듈과 결과 구조가 없어 FAIL.

- [ ] **Step 3: 웹과 같은 신호 그룹 규칙을 구현한다**

```ts
const meeting = new Set(['meeting_positive_vibe', 'meeting_low_reciprocity']);
const followUp = new Set(['post_meeting_followup_positive', 'post_meeting_followup_caution']);
const uncertainty = new Set(['signal_conflict', 'limited_signal', 'sample_size']);

export function groupSignalsByContext<T extends { signalKey: string }>(signals: T[]) {
  return signals.reduce((groups, signal) => {
    if (meeting.has(signal.signalKey)) groups.meeting.push(signal);
    else if (followUp.has(signal.signalKey)) groups.followUp.push(signal);
    else if (uncertainty.has(signal.signalKey)) groups.uncertainty.push(signal);
    else groups.chat.push(signal);
    return groups;
  }, { chat: [] as T[], meeting: [] as T[], followUp: [] as T[], uncertainty: [] as T[] });
}
```

- [ ] **Step 4: B안 결과 화면을 구현한다**

`result.tsx`는 URL JSON 파싱을 제거하고 `useAnalysis().result`를 읽는다. 결과가 없으면 `분석 결과를 찾지 못했어요`와 `새 분석으로 돌아가기`를 표시한다. 결과가 있으면 다음 순서로 렌더링한다.

1. `실제 만남 신호`: meeting과 followUp을 하위 레이블로 구분
2. `채팅 신호`: chat 그룹
3. `판단이 어려운 부분`: uncertainty 그룹이 있을 때만 표시
4. `종합 판단`: `overallSummary`
5. `추천하는 다음 행동`: `recommendedActionReason`
6. `추천 메시지`: `next_message` 추천을 먼저 표시하고 `Clipboard.setStringAsync()`로 복사

신호 행은 `signalType`에 따라 녹색, 황색, 중립색 왼쪽 표시선을 사용하며 제목, 설명, 근거를 모두 보여준다. 신호가 없는 그룹은 빈 패널 대신 생략한다. 서버 경고가 있으면 결과 하단의 중립 안내로 표시한다.

- [ ] **Step 5: 새 분석 정리와 오래된 경로를 제거한다**

`새 분석`은 `resetDraft()`를 완료한 뒤 `router.replace('/')`를 호출한다. 기존 `/analyze` 화면과 `lib/api.ts`를 삭제하고 모든 import가 새 모듈을 사용하게 한다. `_layout.tsx`에 남은 `analyze` 경로도 제거한다.

- [ ] **Step 6: 실행 문서를 작성한다**

`README.md`에 다음을 정확히 기록한다.

````markdown
# SignalMate 모바일 앱

## 실행

```bash
npm install
EXPO_PUBLIC_API_BASE_URL=http://<개발-PC-IP>:3000/api/v1 npm start
```

실기기에서는 `localhost`가 휴대폰 자신을 가리키므로 개발 PC의 같은 네트워크 IP를 사용한다.

## 검증

```bash
npm test
npm run typecheck
npx expo export --platform web
```
````

- [ ] **Step 7: 자동 검증을 실행한다**

Run:

```bash
cd signalmate-app
npm test
npm run typecheck
npx expo export --platform web
```

Expected: 전체 Jest PASS, TypeScript 오류 0개, Expo web export 성공.

- [ ] **Step 8: iOS와 Android 수동 검증을 실행한다**

각 플랫폼에서 다음 시나리오를 수행한다.

1. 캡처 20장을 선택하고 순서를 바꾼다.
2. OCR 한 장 실패를 만든 뒤 나머지 성공 결과가 남는지 확인한다.
3. 앱을 종료하고 재실행해 OCR 결과와 입력이 복구되는지 확인한다.
4. 이름 치환과 중복 제외 후 채팅+만남 후기를 분석한다.
5. 채팅 없이 20자 이상의 만남 후기만 분석한다.
6. 큰 글자 설정에서 버튼, 칩, 결과 근거가 겹치지 않는지 확인한다.
7. 결과에서 실제 만남 신호가 먼저 나오고 추천 메시지가 복사되는지 확인한다.

Expected: 입력 손실, 빈 결과 화면, 원문 로그 노출, UI 겹침이 없다.

- [ ] **Step 9: 최종 커밋한다**

```bash
git add signalmate-app
git commit -m "feat(app): complete mobile unified analysis flow"
```

## Final Verification

- [ ] `git status --short`에 의도하지 않은 변경이 없는지 확인한다.
- [ ] `npm test`가 전체 통과하는지 새로 실행한다.
- [ ] `npm run typecheck`가 종료 코드 0인지 확인한다.
- [ ] `npx expo export --platform web`이 성공하는지 확인한다.
- [ ] API 서버와 Expo 개발 서버를 실행하고 모바일 화면을 직접 검수한다.
- [ ] 원문 대화와 OCR 텍스트가 콘솔 및 오류 로그에 출력되지 않는지 확인한다.
