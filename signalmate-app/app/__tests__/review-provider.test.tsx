import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createEmptyDraft } from '../../lib/analysis/draft';
import type { AnalysisResult, ConversationSnapshot } from '../../lib/analysis/types';
import { createConversation, streamAnalysis } from '../../lib/api/client';
import { draftStorage } from '../../lib/analysis/draft-storage';
import { AnalysisProvider, useAnalysis } from '../../providers/analysis-provider';
import ReviewScreen from '../review';

const mockReplace = jest.fn();
const mockFocusEntries: Array<{
  effect: () => void | (() => void);
  cleanup?: () => void;
}> = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: mockReplace }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      const entry: typeof mockFocusEntries[number] = { effect };
      const cleanup = effect();
      if (cleanup) entry.cleanup = cleanup;
      mockFocusEntries.push(entry);
      return () => {
        entry.cleanup?.();
        const index = mockFocusEntries.indexOf(entry);
        if (index >= 0) mockFocusEntries.splice(index, 1);
      };
    }, [effect]);
  },
}));
jest.mock('../../lib/api/client', () => ({
  createConversation: jest.fn(),
  streamAnalysis: jest.fn(),
}));
jest.mock('../../lib/analysis/draft-storage', () => ({
  draftStorage: { load: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));
jest.mock('../../lib/analysis/image-cache', () => ({ clearCachedImages: jest.fn() }));

const mockedCreateConversation = createConversation as jest.MockedFunction<typeof createConversation>;
const mockedStreamAnalysis = streamAnalysis as jest.MockedFunction<typeof streamAnalysis>;
const mockedDraftStorage = draftStorage as jest.Mocked<typeof draftStorage>;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function blurReview(index: number) {
  const entry = mockFocusEntries[index];
  if (!entry) throw new Error(`Review focus ${index} is not registered.`);
  entry.cleanup?.();
  entry.cleanup = undefined;
}

function focusReview(index: number) {
  const entry = mockFocusEntries[index];
  if (!entry) throw new Error(`Review focus ${index} is not registered.`);
  const cleanup = entry.effect();
  if (cleanup) entry.cleanup = cleanup;
}

const conversation: ConversationSnapshot = {
  id: 'conversation-1', rawText: '', situationContext: '충분히 긴 만남 후기입니다.',
  relationshipStage: 'after_first_date', meetingChannel: 'blind_date', userGoal: 'continue_chat',
  messages: [],
};

function analysisResult(analysisId: string): AnalysisResult {
  return {
    analysisId, overallSummary: '', signals: [], recommendations: [], recommendedAction: '',
    recommendedActionReason: '', confidenceLevel: 'medium', warnings: [],
  };
}

function validDraft() {
  const draft = createEmptyDraft();
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '상대가 먼저 다음 장소를 이야기했고 분위기도 편안했습니다.';
  return draft;
}

function DraftControls() {
  const { draft, result, updateDraft } = useAnalysis();
  return (
    <>
      <Text testID="provider-conversation">{draft.createdConversation?.id ?? 'none'}</Text>
      <Text testID="provider-result">{result?.analysisId ?? 'none'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="후기 수정"
        onPress={() => updateDraft((current) => ({
          ...current,
          guidedAnswers: {
            ...current.guidedAnswers,
            freeText: `${current.guidedAnswers.freeText} 수정`,
          },
        }))}
      >
        <Text>후기 수정</Text>
      </Pressable>
    </>
  );
}

function renderWithProvider(reviewCount = 1) {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 320, height: 700 },
      insets: { top: 20, right: 0, bottom: 20, left: 0 },
    }}>
      <AnalysisProvider>
        <DraftControls />
        {Array.from({ length: reviewCount }, (_, index) => <ReviewScreen key={index} />)}
      </AnalysisProvider>
    </SafeAreaProvider>,
  );
}

describe('ReviewScreen with AnalysisProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFocusEntries.length = 0;
    mockedDraftStorage.load.mockResolvedValue(validDraft());
    mockedDraftStorage.save.mockResolvedValue(undefined);
    mockedDraftStorage.clear.mockResolvedValue(undefined);
    mockedCreateConversation.mockResolvedValue(conversation as Awaited<ReturnType<typeof createConversation>>);
  });

  test('create 성공 후 stream 실패에서 입력 미변경 재시도는 snapshot을 재사용한다', async () => {
    mockedStreamAnalysis
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(analysisResult('analysis-retry'));
    const screen = renderWithProvider();
    const analyze = await screen.findByRole('button', { name: '분석하기' });

    fireEvent.press(analyze);
    fireEvent.press(await screen.findByRole('button', { name: '분석 다시 시도' }));

    await waitFor(() => expect(screen.getByTestId('provider-result').props.children)
      .toBe('analysis-retry'));
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);
    expect(mockedStreamAnalysis).toHaveBeenCalledTimes(2);
  });

  test('stream 실패 뒤 입력을 수정하면 snapshot을 무효화하고 새 conversation을 만든다', async () => {
    mockedStreamAnalysis
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(analysisResult('analysis-new-input'));
    const screen = renderWithProvider();
    fireEvent.press(await screen.findByRole('button', { name: '분석하기' }));
    const retry = await screen.findByRole('button', { name: '분석 다시 시도' });

    fireEvent.press(screen.getByRole('button', { name: '후기 수정' }));
    expect(screen.getByTestId('provider-conversation').props.children).toBe('none');
    fireEvent.press(retry);

    await waitFor(() => expect(screen.getByTestId('provider-result').props.children)
      .toBe('analysis-new-input'));
    expect(mockedCreateConversation).toHaveBeenCalledTimes(2);
  });

  test('두 Review 실행 중 이전 stream이 늦게 끝나도 최신 결과를 덮어쓰지 않는다', async () => {
    let resolveOld!: (value: AnalysisResult) => void;
    mockedStreamAnalysis
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(analysisResult('analysis-new'));
    const screen = renderWithProvider(2);
    const buttons = await screen.findAllByRole('button', { name: '분석하기' });

    fireEvent.press(buttons[0]);
    await waitFor(() => expect(mockedStreamAnalysis).toHaveBeenCalledTimes(1));
    fireEvent.press(buttons[1]);
    await waitFor(() => expect(screen.getByTestId('provider-result').props.children)
      .toBe('analysis-new'));

    await act(async () => { resolveOld(analysisResult('analysis-old')); });
    expect(screen.getByTestId('provider-result').props.children).toBe('analysis-new');
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['blur', 'resolve'],
    ['blur', 'reject'],
    ['unmount', 'resolve'],
    ['unmount', 'reject'],
  ] as const)('stream 대기 중 %s 후 %s는 후속 부작용이 없다', async (lifecycle, settlement) => {
    const stream = createDeferred<AnalysisResult>();
    mockedStreamAnalysis.mockReturnValue(stream.promise);
    const screen = renderWithProvider();
    fireEvent.press(await screen.findByRole('button', { name: '분석하기' }));
    await waitFor(() => expect(mockedStreamAnalysis).toHaveBeenCalledTimes(1));

    if (lifecycle === 'blur') act(() => blurReview(0));
    else screen.unmount();

    await act(async () => {
      if (settlement === 'resolve') stream.resolve(analysisResult('analysis-late'));
      else stream.reject(new Error('late stream failure'));
      await Promise.resolve();
    });

    expect(mockReplace).not.toHaveBeenCalled();
    if (lifecycle === 'blur') {
      expect(screen.getByTestId('provider-result').props.children).toBe('none');
      expect(screen.getByTestId('provider-conversation').props.children).toBe('conversation-1');
      expect(screen.queryByRole('button', { name: '분석 다시 시도' })).toBeNull();
    }
  });

  test.each(['resolve', 'reject'] as const)(
    '두 번째 Review가 시작되면 첫 create late %s를 폐기하고 두 번째만 완료한다',
    async (settlement) => {
      const firstCreate = createDeferred<Awaited<ReturnType<typeof createConversation>>>();
      const secondCreate = createDeferred<Awaited<ReturnType<typeof createConversation>>>();
      mockedCreateConversation
        .mockReturnValueOnce(firstCreate.promise)
        .mockReturnValueOnce(secondCreate.promise);
      mockedStreamAnalysis.mockResolvedValue(analysisResult('analysis-second'));
      const screen = renderWithProvider(2);
      const buttons = await screen.findAllByRole('button', { name: '분석하기' });

      fireEvent.press(buttons[0]);
      fireEvent.press(buttons[1]);
      expect(mockedCreateConversation).toHaveBeenCalledTimes(2);

      await act(async () => {
        if (settlement === 'resolve') {
          firstCreate.resolve({ ...conversation, id: 'conversation-old' } as Awaited<ReturnType<typeof createConversation>>);
        } else {
          firstCreate.reject(new Error('late create failure'));
        }
        await Promise.resolve();
      });
      expect(screen.getByTestId('provider-conversation').props.children).toBe('none');
      expect(mockedStreamAnalysis).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();

      await act(async () => {
        secondCreate.resolve({ ...conversation, id: 'conversation-second' } as Awaited<ReturnType<typeof createConversation>>);
      });
      await waitFor(() => expect(screen.getByTestId('provider-result').props.children)
        .toBe('analysis-second'));
      expect(screen.getByTestId('provider-conversation').props.children).toBe('conversation-second');
      expect(mockedStreamAnalysis).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledTimes(1);
    },
  );

  test('blur로 취소한 뒤 재진입한 Review에서 새 실행이 성공한다', async () => {
    const canceledCreate = createDeferred<Awaited<ReturnType<typeof createConversation>>>();
    mockedCreateConversation
      .mockReturnValueOnce(canceledCreate.promise)
      .mockResolvedValueOnce(conversation as Awaited<ReturnType<typeof createConversation>>);
    mockedStreamAnalysis.mockResolvedValue(analysisResult('analysis-after-refocus'));
    const screen = renderWithProvider();
    fireEvent.press(await screen.findByRole('button', { name: '분석하기' }));

    act(() => blurReview(0));
    act(() => focusReview(0));
    const analyze = await screen.findByRole('button', { name: '분석하기' });
    expect(analyze).toBeEnabled();
    fireEvent.press(analyze);

    await waitFor(() => expect(screen.getByTestId('provider-result').props.children)
      .toBe('analysis-after-refocus'));
    await act(async () => {
      canceledCreate.resolve({ ...conversation, id: 'conversation-canceled' } as Awaited<ReturnType<typeof createConversation>>);
    });
    expect(screen.getByTestId('provider-result').props.children).toBe('analysis-after-refocus');
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  test.each(['success', 'failed'] as const)(
    '이전 stream late reject는 새 실행의 %s 상태를 덮지 않는다',
    async (newOutcome) => {
      const oldStream = createDeferred<AnalysisResult>();
      mockedStreamAnalysis.mockReturnValueOnce(oldStream.promise);
      if (newOutcome === 'success') {
        mockedStreamAnalysis.mockResolvedValueOnce(analysisResult('analysis-current'));
      } else {
        mockedStreamAnalysis.mockRejectedValueOnce(new Error('current failure'));
      }
      const screen = renderWithProvider(2);
      const buttons = await screen.findAllByRole('button', { name: '분석하기' });
      fireEvent.press(buttons[0]);
      await waitFor(() => expect(mockedStreamAnalysis).toHaveBeenCalledTimes(1));
      fireEvent.press(buttons[1]);

      if (newOutcome === 'success') {
        await waitFor(() => expect(screen.getByTestId('provider-result').props.children)
          .toBe('analysis-current'));
      } else {
        await waitFor(() => expect(screen.getAllByRole('button', { name: '분석 다시 시도' }))
          .toHaveLength(1));
      }

      await act(async () => { oldStream.reject(new Error('old late failure')); });
      if (newOutcome === 'success') {
        expect(screen.getByTestId('provider-result').props.children).toBe('analysis-current');
        expect(screen.queryAllByRole('button', { name: '분석 다시 시도' })).toHaveLength(0);
      } else {
        expect(screen.getAllByRole('button', { name: '분석 다시 시도' })).toHaveLength(1);
      }
    },
  );
});
