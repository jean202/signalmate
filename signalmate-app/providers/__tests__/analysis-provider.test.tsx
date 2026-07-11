import { Text } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { createEmptyDraft } from '../../lib/analysis/draft';
import { analysisInputFingerprint } from '../../lib/analysis/fingerprint';
import type { AnalysisDraft } from '../../lib/analysis/types';

jest.mock('../../lib/analysis/draft-storage', () => ({
  draftStorage: {
    load: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));
jest.mock('../../lib/analysis/image-cache', () => ({
  clearCachedImages: jest.fn(),
}));

import { AnalysisProvider, useAnalysis } from '../analysis-provider';
import { draftStorage } from '../../lib/analysis/draft-storage';
import { clearCachedImages } from '../../lib/analysis/image-cache';

const mockedDraftStorage = draftStorage as jest.Mocked<typeof draftStorage>;
const mockedClearCachedImages = clearCachedImages as jest.MockedFunction<typeof clearCachedImages>;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const savedDraft: AnalysisDraft = {
  ...createEmptyDraft('2026-07-10T12:00:00.000Z'),
  pastedText: '어제 즐거웠어요. 다음에는 어디 갈까요?',
};

describe('AnalysisProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    mockedDraftStorage.load.mockResolvedValue(null);
    mockedDraftStorage.save.mockResolvedValue(undefined);
    mockedDraftStorage.clear.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('저장된 초안을 복구한 뒤 자식 화면을 렌더링한다', async () => {
    mockedDraftStorage.load.mockResolvedValue(savedDraft);
    const Probe = () => <Text>{useAnalysis().draft.pastedText}</Text>;
    const { findByText } = render(<AnalysisProvider><Probe /></AnalysisProvider>);

    await findByText(savedDraft.pastedText);
  });

  test('저장소 복구가 실패해도 빈 초안으로 hydration을 끝낸다', async () => {
    mockedDraftStorage.load.mockRejectedValue(new Error('storage unavailable'));
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.draft).toMatchObject({ pastedText: '', images: [] });
  });

  test('늦게 끝난 복구는 reset 뒤의 빈 초안을 덮어쓰지 않는다', async () => {
    const load = createDeferred<AnalysisDraft | null>();
    mockedDraftStorage.load.mockReturnValue(load.promise);
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });

    await act(async () => result.current.resetDraft());
    await act(async () => { load.resolve(savedDraft); });

    expect(result.current.hydrated).toBe(true);
    expect(result.current.draft.pastedText).toBe('');
  });

  test('복구된 초안은 바로 저장하지 않고 이후 변경을 150ms 뒤에 저장한다', async () => {
    mockedDraftStorage.load.mockResolvedValue(savedDraft);
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => jest.advanceTimersByTime(151));
    expect(mockedDraftStorage.save).not.toHaveBeenCalled();

    act(() => result.current.updateDraft((draft) => ({ ...draft, pastedText: '수정한 대화' })));
    act(() => jest.advanceTimersByTime(149));
    expect(mockedDraftStorage.save).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    await act(async () => { await Promise.resolve(); });
    expect(mockedDraftStorage.save).toHaveBeenCalledWith(expect.objectContaining({
      pastedText: '수정한 대화',
      updatedAt: expect.any(String),
    }));
  });

  test('초안 변경은 updatedAt을 현재 시각으로 갱신한다', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    jest.setSystemTime(new Date('2026-07-11T09:30:00.000Z'));

    act(() => result.current.updateDraft((draft) => ({ ...draft, pastedText: '새 대화' })));

    expect(result.current.draft.updatedAt).toBe('2026-07-11T09:30:00.000Z');
  });

  test('분석 request 입력이 바뀌면 저장된 conversation과 fingerprint를 무효화한다', async () => {
    const restored = createEmptyDraft();
    restored.primaryInput = 'text';
    restored.pastedText = '나: 안녕\n상대: 반가워';
    restored.createdConversation = {
      id: 'conversation-1', rawText: restored.pastedText, situationContext: null,
      relationshipStage: 'before_meeting', meetingChannel: 'dating_app', userGoal: 'continue_chat',
      messages: [],
    };
    restored.createdConversationFingerprint = analysisInputFingerprint(restored);
    mockedDraftStorage.load.mockResolvedValue(restored);
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.draft.createdConversation).not.toBeNull());

    act(() => result.current.updateDraft((draft) => ({
      ...draft,
      pastedText: `${draft.pastedText}\n나: 다음에 봐`,
    })));

    expect(result.current.draft.createdConversation).toBeNull();
    expect(result.current.draft.createdConversationFingerprint).toBeNull();
  });

  test('request와 무관한 UI 메타데이터 변경은 저장 conversation을 유지한다', async () => {
    const restored = createEmptyDraft();
    restored.primaryInput = 'text';
    restored.pastedText = '나: 안녕\n상대: 반가워';
    restored.createdConversation = {
      id: 'conversation-1', rawText: restored.pastedText, situationContext: null,
      relationshipStage: 'before_meeting', meetingChannel: 'dating_app', userGoal: 'continue_chat',
      messages: [],
    };
    restored.createdConversationFingerprint = analysisInputFingerprint(restored);
    mockedDraftStorage.load.mockResolvedValue(restored);
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.draft.createdConversation).not.toBeNull());

    act(() => result.current.updateDraft((draft) => ({ ...draft, inputFocusTouched: true })));

    expect(result.current.draft.createdConversation?.id).toBe('conversation-1');
    expect(result.current.draft.createdConversationFingerprint)
      .toBe(analysisInputFingerprint(result.current.draft));
  });

  test('새 분석 실행 토큰은 이전 실행의 진행과 결과 소유권을 무효화한다', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    const first = result.current.beginAnalysisRun();
    expect(result.current.isAnalysisRunActive(first)).toBe(true);
    const second = result.current.beginAnalysisRun();

    expect(result.current.isAnalysisRunActive(first)).toBe(false);
    expect(result.current.isAnalysisRunActive(second)).toBe(true);
    act(() => result.current.cancelAnalysisRun(second));
    expect(result.current.isAnalysisRunActive(second)).toBe(false);
  });

  test('Provider의 현재 draft fingerprint를 비동기 경계에서 확인한다', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const fingerprint = analysisInputFingerprint(result.current.draft);

    expect(result.current.isDraftFingerprintCurrent(fingerprint)).toBe(true);
    act(() => result.current.updateDraft((draft) => ({ ...draft, pastedText: '변경된 입력' })));
    expect(result.current.isDraftFingerprintCurrent(fingerprint)).toBe(false);
  });

  test('reset은 시작된 저장 뒤에 clear를 실행해 오래된 저장값을 남기지 않는다', async () => {
    const save = createDeferred<void>();
    const operationOrder: string[] = [];
    let persistedText: string | null = null;
    mockedDraftStorage.save.mockImplementation(async (draft) => {
      operationOrder.push('save:start');
      await save.promise;
      persistedText = draft.pastedText;
      operationOrder.push('save:end');
    });
    mockedDraftStorage.clear.mockImplementation(async () => {
      operationOrder.push('clear');
      persistedText = null;
    });
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => result.current.updateDraft((draft) => ({ ...draft, pastedText: '오래된 대화' })));
    act(() => jest.advanceTimersByTime(150));
    await waitFor(() => expect(operationOrder).toEqual(['save:start']));

    let reset: Promise<void>;
    act(() => { reset = result.current.resetDraft(); });
    expect(operationOrder).toEqual(['save:start']);

    await act(async () => { save.resolve(); });
    await act(async () => { await reset!; });

    expect(operationOrder).toEqual(['save:start', 'save:end', 'clear']);
    expect(persistedText).toBeNull();
  });

  test('새 분석은 저장소와 이미지 캐시를 함께 비우고 결과를 초기화한다', async () => {
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.setResult({
      analysisId: 'result-1', overallSummary: '', signals: [], recommendations: [],
      recommendedAction: '', recommendedActionReason: '', confidenceLevel: 'low', warnings: [],
    }));

    await act(async () => result.current.resetDraft());

    expect(mockedDraftStorage.clear).toHaveBeenCalledTimes(1);
    expect(mockedClearCachedImages).toHaveBeenCalledTimes(1);
    expect(result.current.draft.pastedText).toBe('');
    expect(result.current.result).toBeNull();
  });

  test('정리 작업이 실패해도 컨텍스트를 새 분석 상태로 남긴다', async () => {
    const cleanupError = new Error('cache unavailable');
    mockedDraftStorage.clear.mockResolvedValue(undefined);
    mockedClearCachedImages.mockImplementation(() => { throw cleanupError; });
    const { result } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.updateDraft((draft) => ({ ...draft, pastedText: '지울 대화' })));

    let receivedError: unknown;
    await act(async () => {
      try {
        await result.current.resetDraft();
      } catch (error) {
        receivedError = error;
      }
    });

    expect(receivedError).toBe(cleanupError);
    expect(result.current.draft.pastedText).toBe('');
    expect(result.current.result).toBeNull();
  });

  test('지연된 reset 정리 중에도 메모리를 먼저 비우고 unmount 뒤 상태를 갱신하지 않는다', async () => {
    const clear = createDeferred<void>();
    mockedDraftStorage.clear.mockReturnValue(clear.promise);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const { result, unmount } = renderHook(() => useAnalysis(), { wrapper: AnalysisProvider });
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.updateDraft((draft) => ({ ...draft, pastedText: '지울 대화' })));

    let reset: Promise<void>;
    act(() => { reset = result.current.resetDraft(); });
    expect(result.current.draft.pastedText).toBe('');
    unmount();

    await act(async () => {
      clear.resolve();
      await reset!;
    });

    expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/unmounted component/i));
    consoleError.mockRestore();
  });
});
