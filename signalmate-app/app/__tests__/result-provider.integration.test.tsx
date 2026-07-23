import { useEffect } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { AnalysisResult } from '../../lib/analysis/types';

const mockReplace = jest.fn();
const mockUsePreventRemove = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@react-navigation/native', () => ({
  usePreventRemove: (preventRemove: boolean, callback: (event: unknown) => void) => (
    mockUsePreventRemove(preventRemove, callback)
  ),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  Copy: () => null,
}));

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

import ResultScreen from '../result';
import { AnalysisProvider, useAnalysis } from '../../providers/analysis-provider';
import { draftStorage } from '../../lib/analysis/draft-storage';
import { clearCachedImages } from '../../lib/analysis/image-cache';

const mockedDraftStorage = draftStorage as jest.Mocked<typeof draftStorage>;
const mockedClearCachedImages = clearCachedImages as jest.MockedFunction<typeof clearCachedImages>;

const analysisResult: AnalysisResult = {
  analysisId: 'integration-result',
  overallSummary: '실제 Provider에서 읽은 종합 판단이에요.',
  signals: [{
    id: 'meeting',
    signalType: 'positive',
    signalKey: 'meeting_positive_vibe',
    title: '만남 분위기가 좋았어요',
    description: '상대가 다음 장소를 먼저 제안했어요.',
    evidenceText: '함께 산책하자고 먼저 말했어요.',
    confidenceLevel: 'high',
    displayOrder: 1,
  }],
  recommendations: [{
    id: 'message',
    recommendationType: 'next_message',
    title: '보내볼 메시지',
    content: '다음 주말에 같이 걸을까요?',
    rationale: '만남에서 나온 제안을 이어갈 수 있어요.',
    toneLabel: null,
    displayOrder: 1,
  }],
  recommendedAction: '다음 만남 제안하기',
  recommendedActionReason: '구체적인 날짜를 하나 제안해 보세요.',
  confidenceLevel: 'high',
  warnings: [],
};

function ResultWithSeed() {
  const { setResult } = useAnalysis();
  useEffect(() => {
    setResult(analysisResult);
  }, [setResult]);
  return <ResultScreen />;
}

describe('ResultScreen with AnalysisProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedDraftStorage.load.mockResolvedValue(null);
    mockedDraftStorage.save.mockResolvedValue(undefined);
    mockedDraftStorage.clear.mockResolvedValue(undefined);
  });

  test('실제 AnalysisProvider의 result를 렌더링한다', async () => {
    const screen = render(
      <AnalysisProvider>
        <ResultWithSeed />
      </AnalysisProvider>,
    );

    expect(await screen.findByText('실제 Provider에서 읽은 종합 판단이에요.')).toBeTruthy();
    expect(screen.getByText('만남 분위기가 좋았어요')).toBeTruthy();
    expect(screen.getByText('다음 주말에 같이 걸을까요?')).toBeTruthy();
    expect(mockUsePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
  });

  test('새 분석은 실제 Provider 저장소와 캐시를 초기화한 뒤 이동한다', async () => {
    const screen = render(
      <AnalysisProvider>
        <ResultWithSeed />
      </AnalysisProvider>,
    );
    await screen.findByText('실제 Provider에서 읽은 종합 판단이에요.');

    fireEvent.press(screen.getByRole('button', { name: '새 분석 시작' }));

    await waitFor(() => expect(mockedDraftStorage.clear).toHaveBeenCalledTimes(1));
    expect(mockedClearCachedImages).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mockUsePreventRemove).toHaveBeenLastCalledWith(false, expect.any(Function)));
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('실제 Provider 초기화가 실패하면 result와 제거 차단을 유지한다', async () => {
    mockedDraftStorage.clear.mockRejectedValueOnce(new Error('private storage error'));
    const screen = render(
      <AnalysisProvider>
        <ResultWithSeed />
      </AnalysisProvider>,
    );
    await screen.findByText('실제 Provider에서 읽은 종합 판단이에요.');

    fireEvent.press(screen.getByRole('button', { name: '새 분석 시작' }));

    expect(await screen.findByText('새 분석을 준비하지 못했어요')).toBeTruthy();
    expect(screen.getByText('실제 Provider에서 읽은 종합 판단이에요.')).toBeTruthy();
    expect(screen.queryByText('private storage error')).toBeNull();
    expect(mockUsePreventRemove).toHaveBeenLastCalledWith(true, expect.any(Function));
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
