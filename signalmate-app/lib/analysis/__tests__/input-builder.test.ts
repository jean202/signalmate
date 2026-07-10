import { createEmptyDraft } from '../draft';
import {
  applyReplacementRules,
  buildConversationRequest,
  buildMergedChatText,
  countReplacementChanges,
  findDuplicateCandidates,
  validateDraft,
} from '../input-builder';
import type { DesiredHelp } from '../types';

test('치환값을 정규식이 아닌 일반 문자열로 적용한다', () => {
  expect(applyReplacementRules('김진하님 김진하', [
    { id: '1', source: '김진하', replacement: '[내이름]' },
  ])).toBe('[내이름]님 [내이름]');
});

test('여러 치환 규칙은 한 번의 적용에서 서로 연쇄되지 않는다', () => {
  expect(applyReplacementRules('민수와 친구', [
    { id: '1', source: '민수', replacement: '친구' },
    { id: '2', source: '친구', replacement: '[상대]' },
  ])).toBe('친구와 [상대]');
});

test('source를 포함한 치환값에 같은 규칙을 다시 적용해도 중첩되지 않는다', () => {
  const rules = [{ id: '1', source: '민수', replacement: '[민수]' }];
  const once = applyReplacementRules('민수', rules);

  expect(once).toBe('[민수]');
  expect(applyReplacementRules(once, rules)).toBe('[민수]');
  expect(countReplacementChanges(once, rules)).toBe(0);
});

test('연속 캡처의 suffix와 prefix가 같은 줄을 중복 후보로 찾는다', () => {
  const candidates = findDuplicateCandidates([
    { imageId: 'a', text: '나: 안녕\n상대: 반가워' },
    { imageId: 'b', text: '상대: 반가워\n나: 오늘 어땠어?' },
  ]);
  expect(candidates).toEqual([{
    id: expect.stringMatching(/^duplicate:b:0:/),
    imageId: 'b',
    lineIndex: 0,
    text: '상대: 반가워',
  }]);
});

test('빈 줄을 무시해도 중복 후보는 원본 줄 인덱스를 유지한다', () => {
  const candidates = findDuplicateCandidates([
    { imageId: 'a', text: '나: 안녕\n상대: 반가워' },
    { imageId: 'b', text: '\n상대: 반가워\n나: 오늘 어땠어?' },
  ]);
  expect(candidates).toEqual([{
    id: expect.stringMatching(/^duplicate:b:1:/),
    imageId: 'b',
    lineIndex: 1,
    text: '상대: 반가워',
  }]);
});

test('선택한 중복 줄을 제외하고 이미지 순서와 붙여넣기 텍스트를 합친다', () => {
  const draft = createEmptyDraft();
  draft.images = [
    { id: 'a', order: 0, uri: 'a', fileName: 'a.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '나: 안녕\n상대: 반가워', notes: [], errorCode: null, reviewed: true },
    { id: 'b', order: 1, uri: 'b', fileName: 'b.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '상대: 반가워\n나: 또 봐요', notes: [], errorCode: null, reviewed: true },
  ];
  draft.excludedDuplicateIds = findDuplicateCandidates([
    { imageId: 'a', text: draft.images[0].editedText },
    { imageId: 'b', text: draft.images[1].editedText },
  ]).map((candidate) => candidate.id);
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
  draft.excludedDuplicateIds = findDuplicateCandidates([
    { imageId: 'a', text: draft.images[0].editedText },
    { imageId: 'b', text: draft.images[1].editedText },
  ]).map((candidate) => candidate.id);
  expect(buildMergedChatText(draft)).toBe('나: 안녕\n상대: 반가워\n나: 또 봐요');
});

test('중복 선택 후 앞줄이 삽입되면 다른 메시지를 조용히 제외하지 않는다', () => {
  const draft = createEmptyDraft();
  draft.images = [
    { id: 'a', order: 0, uri: 'a', fileName: 'a.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '나: 안녕\n상대: 반복', notes: [], errorCode: null, reviewed: true },
    { id: 'b', order: 1, uri: 'b', fileName: 'b.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '상대: 반복\n나: 다음', notes: [], errorCode: null, reviewed: true },
  ];
  draft.excludedDuplicateIds = findDuplicateCandidates([
    { imageId: 'a', text: draft.images[0].editedText },
    { imageId: 'b', text: draft.images[1].editedText },
  ]).map((candidate) => candidate.id);

  draft.images[1].editedText = '나: 새 앞줄\n상대: 반복\n나: 다음';

  expect(buildMergedChatText(draft)).toBe(
    '나: 안녕\n상대: 반복\n나: 새 앞줄\n상대: 반복\n나: 다음',
  );
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

test('저장된 잘못된 desiredHelp는 분석을 거부한다', () => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '대화는 편했고 상대가 먼저 다음 장소를 이야기했다.';
  (draft.guidedAnswers as unknown as { desiredHelp: string }).desiredHelp = 'invalid_help';

  expect(validateDraft(draft)).toEqual({
    valid: false,
    errors: ['원하는 도움을 선택해 주세요.'],
  });
  expect(() => buildConversationRequest(draft)).toThrow('원하는 도움을 선택해 주세요.');
});

test('desiredHelp가 누락된 저장 초안은 분석을 거부한다', () => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '대화는 편했고 상대가 먼저 다음 장소를 이야기했다.';
  (draft.guidedAnswers as unknown as { desiredHelp?: string }).desiredHelp = undefined;

  expect(validateDraft(draft)).toEqual({
    valid: false,
    errors: ['원하는 도움을 선택해 주세요.'],
  });
  expect(() => buildConversationRequest(draft)).toThrow('원하는 도움을 선택해 주세요.');
});

test('검수하지 않은 complete OCR 이미지는 분석을 막는다', () => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'capture';
  draft.relationshipStage = 'before_meeting';
  draft.meetingChannel = 'dating_app';
  draft.images = [{
    id: 'a', order: 0, uri: 'a', fileName: 'a.png', mimeType: 'image/png', fileSize: 1,
    status: 'complete', extractedText: '나: 안녕\n상대: 반가워', editedText: '나: 안녕\n상대: 반가워',
    notes: [], errorCode: null, reviewed: false,
  }];

  expect(validateDraft(draft)).toEqual({
    valid: false,
    errors: ['추출된 캡처 내용을 모두 검수해 주세요.'],
  });
});

test.each([
  ['19자 후기는 부족하다', 19, false],
  ['20자 후기는 허용된다', 20, true],
])('상황 전용 freeText %s', (_label, length, valid) => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '가'.repeat(length);

  expect(validateDraft(draft).valid).toBe(valid);
});

test.each([
  ['2000자 후기는 허용된다', 2000, true],
  ['2001자 후기는 거부된다', 2001, false],
])('freeText 길이 경계 %s', (_label, length, valid) => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '가'.repeat(length);

  expect(validateDraft(draft).valid).toBe(valid);
});

test('complete 이미지만 order 순서로 병합한다', () => {
  const draft = createEmptyDraft();
  draft.images = [
    { id: 'queued', order: 0, uri: 'queued', fileName: 'queued.png', mimeType: 'image/png', fileSize: 1,
      status: 'queued', extractedText: '', editedText: '무시되어야 해요', notes: [], errorCode: null, reviewed: true },
    { id: 'second', order: 2, uri: 'second', fileName: 'second.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '상대: 두 번째', notes: [], errorCode: null, reviewed: true },
    { id: 'first', order: 1, uri: 'first', fileName: 'first.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '나: 첫 번째', notes: [], errorCode: null, reviewed: true },
    { id: 'failed', order: 3, uri: 'failed', fileName: 'failed.png', mimeType: 'image/png', fileSize: 1,
      status: 'failed', extractedText: '', editedText: '실패한 OCR', notes: [], errorCode: 'ocr_failed', reviewed: false },
  ];

  expect(buildMergedChatText(draft)).toBe('나: 첫 번째\n상대: 두 번째');
});

test('인접하지 않은 이미지의 겹침은 중복 후보가 되지 않는다', () => {
  expect(findDuplicateCandidates([
    { imageId: 'a', text: '나: 안녕\n상대: 반복' },
    { imageId: 'b', text: '나: 중간 이미지' },
    { imageId: 'c', text: '상대: 반복\n나: 마지막' },
  ])).toEqual([]);
});

const userGoalCases: Array<[DesiredHelp, string]> = [
  ['next_message', 'continue_chat'],
  ['ask_for_date', 'ask_for_date'],
  ['wait_or_send', 'evaluate_interest'],
  ['decide_to_stop', 'decide_to_stop'],
];

test.each(userGoalCases)('desiredHelp %s를 userGoal %s로 변환한다', (desiredHelp, userGoal) => {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.desiredHelp = desiredHelp;
  draft.guidedAnswers.freeText = '대화는 편했고 상대가 먼저 다음 장소를 이야기했다.';

  expect(buildConversationRequest(draft).userGoal).toBe(userGoal);
});
