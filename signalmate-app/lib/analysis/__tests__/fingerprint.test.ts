import { createEmptyDraft } from '../draft';
import { analysisInputFingerprint } from '../fingerprint';
import type { AnalysisDraft } from '../types';

function analysisDraft(): AnalysisDraft {
  const draft = createEmptyDraft('2026-07-11T00:00:00.000Z');
  draft.primaryInput = 'text';
  draft.pastedText = '나: 안녕\n상대: 반가워';
  draft.relationshipStage = 'before_meeting';
  draft.meetingChannel = 'dating_app';
  return draft;
}

test('동일 분석 입력은 안정적인 비가역 fingerprint를 만든다', () => {
  const first = analysisDraft();
  const second = analysisDraft();

  expect(analysisInputFingerprint(first)).toBe(analysisInputFingerprint(second));
  expect(analysisInputFingerprint(first)).toMatch(/^analysis-input-v1:[0-9a-f]{16}$/);
  expect(analysisInputFingerprint(first)).not.toContain(first.pastedText);
});

test.each([
  ['primaryInput', (draft: AnalysisDraft) => { draft.primaryInput = 'capture'; }],
  ['pastedText', (draft: AnalysisDraft) => { draft.pastedText += '\n나: 다음에 봐'; }],
  ['image source mode', (draft: AnalysisDraft) => { draft.images = [{
    id: 'queued', order: 0, uri: 'file://queued.png', fileName: 'queued.png', mimeType: 'image/png',
    fileSize: 1, status: 'queued', extractedText: '', editedText: '', notes: [], errorCode: null,
    reviewed: false,
  }]; }],
  ['relationshipStage', (draft: AnalysisDraft) => { draft.relationshipStage = 'after_first_date'; }],
  ['meetingChannel', (draft: AnalysisDraft) => { draft.meetingChannel = 'blind_date'; }],
  ['inputFocus', (draft: AnalysisDraft) => { draft.guidedAnswers.inputFocus = 'mixed'; }],
  ['meetingCount', (draft: AnalysisDraft) => { draft.guidedAnswers.meetingCount = 'once'; }],
  ['meetingVibe', (draft: AnalysisDraft) => { draft.guidedAnswers.meetingVibe = 'good'; }],
  ['otherInitiative', (draft: AnalysisDraft) => { draft.guidedAnswers.otherInitiative = 'high'; }],
  ['afterMeetingContact', (draft: AnalysisDraft) => { draft.guidedAnswers.afterMeetingContact = 'ongoing'; }],
  ['desiredHelp', (draft: AnalysisDraft) => { draft.guidedAnswers.desiredHelp = 'ask_for_date'; }],
  ['otherStyle', (draft: AnalysisDraft) => { draft.guidedAnswers.otherStyle = ['fast_reply']; }],
  ['freeText', (draft: AnalysisDraft) => { draft.guidedAnswers.freeText = '실제로 만난 내용'; }],
] as const)('%s 변경은 fingerprint를 바꾼다', (_label, mutate) => {
  const before = analysisDraft();
  const after = analysisDraft();
  mutate(after);

  expect(analysisInputFingerprint(after)).not.toBe(analysisInputFingerprint(before));
});

test('현재 중복 제외가 바뀌어 병합 요청이 달라지면 fingerprint를 바꾼다', () => {
  const before = analysisDraft();
  before.primaryInput = 'capture';
  before.pastedText = '';
  before.images = [
    {
      id: 'a', order: 0, uri: 'a', fileName: 'a.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '나: 안녕\n상대: 반복', notes: [],
      errorCode: null, reviewed: true,
    },
    {
      id: 'b', order: 1, uri: 'b', fileName: 'b.png', mimeType: 'image/png', fileSize: 1,
      status: 'complete', extractedText: '', editedText: '상대: 반복\n나: 다음', notes: [],
      errorCode: null, reviewed: true,
    },
  ];
  const after = structuredClone(before);
  after.excludedDuplicateIds = [
    'duplicate:b:0:%EC%83%81%EB%8C%80%3A%20%EB%B0%98%EB%B3%B5',
  ];

  expect(analysisInputFingerprint(after)).not.toBe(analysisInputFingerprint(before));
});

test('저장 스냅샷과 UI 수명 값은 fingerprint에서 제외한다', () => {
  const before = analysisDraft();
  const after = analysisDraft();
  after.updatedAt = '2030-01-01T00:00:00.000Z';
  after.inputFocusTouched = true;
  after.createdConversation = {
    id: 'conversation-1', rawText: after.pastedText, situationContext: null,
    relationshipStage: 'before_meeting', meetingChannel: 'dating_app', userGoal: 'continue_chat',
    messages: [],
  };
  after.createdConversationFingerprint = 'old-fingerprint';

  expect(analysisInputFingerprint(after)).toBe(analysisInputFingerprint(before));
});
