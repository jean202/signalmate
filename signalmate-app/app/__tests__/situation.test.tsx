import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createEmptyDraft } from '../../lib/analysis/draft';
import type { AnalysisDraft } from '../../lib/analysis/types';
import { useAnalysis } from '../../providers/analysis-provider';
import SituationScreen from '../situation';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../../providers/analysis-provider', () => ({
  useAnalysis: jest.fn(),
}));

const mockedUseAnalysis = useAnalysis as jest.MockedFunction<typeof useAnalysis>;
let latestDraft: AnalysisDraft;

function renderSituation(initialDraft: AnalysisDraft) {
  mockedUseAnalysis.mockImplementation(() => {
    const [draft, setDraft] = useState(initialDraft);
    latestDraft = draft;
    return {
      hydrated: true,
      draft,
      result: null,
      updateDraft: setDraft,
      setResult: jest.fn(),
      resetDraft: jest.fn(),
      beginAnalysisRun: jest.fn(() => 1),
      isAnalysisRunActive: jest.fn(() => true),
      cancelAnalysisRun: jest.fn(),
      isDraftFingerprintCurrent: jest.fn(() => true),
    };
  });

  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 320, height: 700 },
      insets: { top: 20, right: 0, bottom: 20, left: 0 },
    }}>
      <SituationScreen />
    </SafeAreaProvider>,
  );
}

describe('SituationScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('관계 단계와 만난 경로를 선택해야 다음으로 진행한다', async () => {
    const draft = createEmptyDraft();
    draft.primaryInput = 'meeting_note';
    const screen = renderSituation(draft);

    await waitFor(() => expect(screen.getByRole('button', { name: '입력 요약 확인' }))
      .toBeDisabled());
    fireEvent.press(screen.getByRole('button', { name: '첫 만남 후' }));
    fireEvent.press(screen.getByRole('button', { name: '소개팅' }));

    expect(screen.getByRole('button', { name: '입력 요약 확인' })).toBeEnabled();
    fireEvent.press(screen.getByRole('button', { name: '입력 요약 확인' }));
    expect(mockPush).toHaveBeenCalledWith('/review');
  });

  test('모든 단일 선택과 상대 메시지 스타일 다중 선택을 GuidedAnswers 값으로 저장한다', async () => {
    const draft = createEmptyDraft();
    draft.primaryInput = 'capture';
    const screen = renderSituation(draft);

    fireEvent.press(screen.getByRole('button', { name: '두세 번 만남 후' }));
    fireEvent.press(screen.getByRole('button', { name: '데이팅 앱' }));
    fireEvent.press(screen.getByRole('button', { name: '채팅과 만남 혼합' }));
    fireEvent.press(screen.getByRole('button', { name: '2~3번' }));
    fireEvent.press(screen.getByRole('button', { name: '좋았음' }));
    fireEvent.press(screen.getByRole('button', { name: '높음' }));
    fireEvent.press(screen.getByRole('button', { name: '상대가 먼저' }));
    fireEvent.press(screen.getByRole('button', { name: '다음 만남 제안' }));
    fireEvent.press(screen.getByRole('button', { name: '답장이 빠른 편' }));
    fireEvent.press(screen.getByRole('button', { name: '이모지/이모티콘을 자주 사용' }));

    await waitFor(() => expect(latestDraft).toMatchObject({
      relationshipStage: 'after_second_date',
      meetingChannel: 'dating_app',
      guidedAnswers: {
        inputFocus: 'mixed',
        meetingCount: '2_3_times',
        meetingVibe: 'good',
        otherInitiative: 'high',
        afterMeetingContact: 'other_first',
        desiredHelp: 'ask_for_date',
        otherStyle: ['fast_reply', 'uses_emoji'],
      },
    }));
  });

  test.each([
    ['capture', 'chat'],
    ['text', 'chat'],
    ['meeting_note', 'meeting_note'],
  ] as const)('primaryInput이 %s이면 inputFocus 기본값은 %s다', async (primaryInput, inputFocus) => {
    const draft = createEmptyDraft();
    draft.primaryInput = primaryInput;
    renderSituation(draft);

    await waitFor(() => expect(latestDraft.guidedAnswers.inputFocus).toBe(inputFocus));
  });

  test('재방문 시 사용자가 고른 inputFocus를 기본값으로 덮어쓰지 않는다', async () => {
    const draft = createEmptyDraft();
    draft.primaryInput = 'meeting_note';
    draft.guidedAnswers.inputFocus = 'follow_up';
    draft.inputFocusTouched = true;
    const screen = renderSituation(draft);

    await waitFor(() => expect(latestDraft.guidedAnswers.inputFocus).toBe('follow_up'));
    expect(screen.getByRole('button', { name: '만남 뒤 연락 중심' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: true }));
  });

  test('만남 후기 자유 입력은 상태 자체가 2,000자를 넘지 않고 글자 수와 초과 안내를 표시한다', async () => {
    const draft = createEmptyDraft();
    draft.primaryInput = 'meeting_note';
    const screen = renderSituation(draft);

    fireEvent.changeText(screen.getByLabelText('직접 느낀 점'), '가'.repeat(2001));

    await waitFor(() => expect(latestDraft.guidedAnswers.freeText).toHaveLength(2000));
    expect(screen.getByText('2,000 / 2,000자')).toBeTruthy();
    expect(screen.getByText('2,000자까지 입력할 수 있어요')).toBeTruthy();
  });
});
