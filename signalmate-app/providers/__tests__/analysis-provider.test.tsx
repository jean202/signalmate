import { Text } from 'react-native';
import { act, render, renderHook, waitFor } from '@testing-library/react-native';
import { createEmptyDraft } from '../../lib/analysis/draft';
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

const savedDraft: AnalysisDraft = {
  ...createEmptyDraft('2026-07-10T12:00:00.000Z'),
  pastedText: '어제 즐거웠어요. 다음에는 어디 갈까요?',
};

describe('AnalysisProvider', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
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
});
