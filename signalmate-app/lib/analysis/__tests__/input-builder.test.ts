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

test('빈 줄을 무시해도 중복 후보는 원본 줄 인덱스를 유지한다', () => {
  const candidates = findDuplicateCandidates([
    { imageId: 'a', text: '나: 안녕\n상대: 반가워' },
    { imageId: 'b', text: '\n상대: 반가워\n나: 오늘 어땠어?' },
  ]);
  expect(candidates).toEqual([{ id: 'b:1', imageId: 'b', lineIndex: 1, text: '상대: 반가워' }]);
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

test('빈 줄이 있는 중복 후보를 제외하면 원본 인덱스의 메시지를 제거한다', () => {
  const draft = createEmptyDraft();
  draft.images = [
    { id: 'a', order: 0, uri: 'a', fileName: 'a.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '나: 안녕\n상대: 반가워', notes: [], errorCode: null, reviewed: true },
    { id: 'b', order: 1, uri: 'b', fileName: 'b.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '\n상대: 반가워\n나: 또 봐요', notes: [], errorCode: null, reviewed: true },
  ];
  draft.excludedDuplicateIds = ['b:1'];
  expect(buildMergedChatText(draft)).toBe('나: 안녕\n상대: 반가워\n나: 또 봐요');
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
