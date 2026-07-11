import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet } from 'react-native';

import type { AnalysisResult } from '../../lib/analysis/types';

const mockReplace = jest.fn();
const mockResetDraft = jest.fn<Promise<void>, []>();
let mockResult: AnalysisResult | null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('lucide-react-native', () => ({
  Check: () => null,
  Copy: () => null,
}));

jest.mock('../../providers/analysis-provider', () => ({
  useAnalysis: () => ({ result: mockResult, resetDraft: mockResetDraft }),
}));

import ResultScreen from '../result';

const result: AnalysisResult = {
  analysisId: 'analysis-1',
  overallSummary: '만남에서 확인된 호감과 채팅의 신중함을 함께 볼 필요가 있어요.',
  signals: [
    {
      id: 'chat', signalType: 'ambiguous', signalKey: 'warm_tone', title: '답장은 따뜻해요',
      description: '대화를 이어가려는 표현이 보여요.', evidenceText: '상대: 다음에 또 이야기해요.',
      confidenceLevel: 'medium', displayOrder: 30,
    },
    {
      id: 'follow-up', signalType: 'caution', signalKey: 'post_meeting_followup_caution',
      title: '후속 연락은 느렸어요', description: '만남 뒤 답장 간격이 길어졌어요.',
      evidenceText: '만남 다음 날 저녁에 첫 답장이 왔어요.', confidenceLevel: 'high', displayOrder: 20,
    },
    {
      id: 'meeting', signalType: 'positive', signalKey: 'meeting_positive_vibe',
      title: '만남 분위기가 좋았어요', description: '상대가 다음 장소를 먼저 제안했어요.',
      evidenceText: '카페 뒤에 산책을 먼저 제안했어요.', confidenceLevel: 'high', displayOrder: 10,
    },
    {
      id: 'uncertain', signalType: 'ambiguous', signalKey: 'limited_signal',
      title: '표본이 적어요', description: '한 번의 만남만으로 단정하기 어려워요.',
      evidenceText: '확인된 만남은 한 번이에요.', confidenceLevel: 'low', displayOrder: 40,
    },
  ],
  recommendations: [
    {
      id: 'tone', recommendationType: 'tone_guide', title: '톤 가이드',
      content: '가볍고 구체적으로 제안하세요.', rationale: '부담을 줄일 수 있어요.', toneLabel: '담백하게',
      displayOrder: 1,
    },
    {
      id: 'message', recommendationType: 'next_message', title: '보내볼 메시지',
      content: '다음 주말에 같이 가볼래요?', rationale: '구체적인 일정으로 반응을 확인할 수 있어요.',
      toneLabel: null, displayOrder: 9,
    },
  ],
  recommendedAction: '다음 만남을 가볍게 제안하기',
  recommendedActionReason: '상대의 호응을 확인할 수 있도록 구체적인 일정 하나를 제안해 보세요.',
  confidenceLevel: 'medium',
  warnings: ['일부 신호는 제한된 대화만으로 판단했어요.'],
};

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('ResultScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResult = result;
    mockResetDraft.mockResolvedValue(undefined);
    (Clipboard.setStringAsync as jest.Mock).mockResolvedValue(undefined);
  });

  test('결과 섹션을 신호 우선 순서로 표시한다', () => {
    const screen = render(<ResultScreen />);
    const headings = screen.getAllByRole('header').map((node) => node.props.children);

    expect(headings.indexOf('실제 만남 신호')).toBeLessThan(headings.indexOf('채팅 신호'));
    expect(headings.indexOf('채팅 신호')).toBeLessThan(headings.indexOf('판단이 어려운 부분'));
    expect(headings.indexOf('판단이 어려운 부분')).toBeLessThan(headings.indexOf('종합 판단'));
    expect(headings.indexOf('종합 판단')).toBeLessThan(headings.indexOf('추천하는 다음 행동'));
    expect(headings.indexOf('추천하는 다음 행동')).toBeLessThan(headings.indexOf('추천 메시지'));
    expect(headings.indexOf('추천 메시지')).toBeLessThan(headings.indexOf('서버 안내'));
    expect(screen.getByText('만남에서 확인된 신호')).toBeTruthy();
    expect(screen.getByText('만남 뒤 연락')).toBeTruthy();
  });

  test('신호 행에 유형 표시선과 제목·설명·근거·신뢰도를 표시한다', () => {
    const screen = render(<ResultScreen />);
    const row = screen.getByTestId('signal-row-meeting');
    const rowStyle = StyleSheet.flatten(row.props.style);

    expect(rowStyle.borderLeftWidth).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('만남 분위기가 좋았어요')).toBeTruthy();
    expect(screen.getByText('상대가 다음 장소를 먼저 제안했어요.')).toBeTruthy();
    expect(screen.getByText('카페 뒤에 산책을 먼저 제안했어요.')).toBeTruthy();
    expect(screen.getAllByText('신뢰도 높음').length).toBeGreaterThan(0);
  });

  test('추천 메시지를 다른 추천보다 먼저 보여주고 시스템 클립보드에 복사한다', async () => {
    const screen = render(<ResultScreen />);
    const recommendations = screen.getAllByTestId('recommendation-row');

    expect(recommendations[0].findByProps({ children: '다음 주말에 같이 가볼래요?' })).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '추천 메시지 복사' }));
    });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('다음 주말에 같이 가볼래요?');
    expect(screen.getByRole('button', { name: '추천 메시지 복사 완료' })).toBeTruthy();
  });

  test('복사 버튼은 44pt 이상 터치 영역을 가진다', () => {
    const screen = render(<ResultScreen />);
    const button = screen.getByRole('button', { name: '추천 메시지 복사' });
    const style = StyleSheet.flatten(button.props.style);

    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
  });

  test('실제 만남·후속 연락·불확실성 신호가 없으면 빈 섹션을 생략한다', () => {
    mockResult = { ...result, signals: [result.signals[0]], warnings: [] };
    const screen = render(<ResultScreen />);

    expect(screen.queryByRole('header', { name: '실제 만남 신호' })).toBeNull();
    expect(screen.getByRole('header', { name: '채팅 신호' })).toBeTruthy();
    expect(screen.queryByRole('header', { name: '판단이 어려운 부분' })).toBeNull();
    expect(screen.queryByRole('header', { name: '서버 안내' })).toBeNull();
  });

  test('추천 메시지가 없으면 다음 행동을 이어갈 안내를 표시한다', () => {
    mockResult = { ...result, recommendations: result.recommendations.filter((item) => item.recommendationType !== 'next_message') };
    const screen = render(<ResultScreen />);

    expect(screen.getByText('추천 메시지를 만들지 못했어요')).toBeTruthy();
    expect(screen.getByText('추천하는 다음 행동을 참고해 직접 메시지를 작성해 보세요.')).toBeTruthy();
  });

  test('결과가 없으면 안전한 빈 상태에서 새 분석으로 돌아간다', async () => {
    mockResult = null;
    const screen = render(<ResultScreen />);

    expect(screen.getByText('분석 결과를 찾지 못했어요')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '새 분석으로 돌아가기' }));
    });

    expect(mockResetDraft).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('새 분석은 초기화 완료 뒤 이동하고 연속 탭을 한 번만 처리한다', async () => {
    const reset = deferred();
    mockResetDraft.mockReturnValue(reset.promise);
    const screen = render(<ResultScreen />);
    const button = screen.getByRole('button', { name: '새 분석 시작' });

    fireEvent.press(button);
    fireEvent.press(button);
    expect(mockResetDraft).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => reset.resolve());
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  test('초기화 실패 시 이동하지 않고 원문 없는 오류 안내와 재시도를 제공한다', async () => {
    mockResetDraft.mockRejectedValueOnce(new Error('private draft content'));
    const screen = render(<ResultScreen />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: '새 분석 시작' }));
    });

    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText('새 분석을 준비하지 못했어요')).toBeTruthy();
    expect(screen.queryByText('private draft content')).toBeNull();
    expect(screen.getByRole('button', { name: '새 분석 다시 시도' })).toBeEnabled();
  });

  test('초기화 중 화면이 사라지면 완료 뒤 이동하지 않는다', async () => {
    const reset = deferred();
    mockResetDraft.mockReturnValue(reset.promise);
    const screen = render(<ResultScreen />);

    fireEvent.press(screen.getByRole('button', { name: '새 분석 시작' }));
    screen.unmount();
    await act(async () => reset.resolve());

    expect(mockReplace).not.toHaveBeenCalled();
  });
});
