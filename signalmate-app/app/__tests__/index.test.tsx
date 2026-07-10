import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnalysisProvider } from '../../providers/analysis-provider';
import { createEmptyDraft } from '../../lib/analysis/draft';
import HomeScreen from '../index';

const mockPush = jest.fn();
const mockLoad = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../../lib/analysis/draft-storage', () => ({
  draftStorage: {
    load: () => mockLoad(),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../lib/analysis/image-cache', () => ({
  clearCachedImages: jest.fn(),
}));

function renderHome() {
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, right: 0, bottom: 34, left: 0 },
    }}>
      <AnalysisProvider><HomeScreen /></AnalysisProvider>
    </SafeAreaProvider>,
  );
}

describe('HomeScreen', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockLoad.mockResolvedValue(null);
  });

  test('캡처, 텍스트, 만남 후기 중 하나를 주 입력으로 선택한다', async () => {
    const screen = renderHome();

    await waitFor(() => expect(screen.getByRole('button', { name: '캡처' })).toBeTruthy());
    expect(screen.getByRole('button', { name: '텍스트' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '만남 후기' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '만남 후기' }));
    expect(screen.getByRole('button', { name: '만남 후기' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ selected: true }));
  });

  test('텍스트 선택 시 초안을 편집하고 상황 화면으로 이동한다', async () => {
    const screen = renderHome();
    await waitFor(() => expect(screen.getByRole('button', { name: '텍스트' })).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: '텍스트' }));
    fireEvent.changeText(
      screen.getByPlaceholderText('대화 내용을 붙여넣으세요'),
      '나: 안녕\n상대: 반가워',
    );
    fireEvent.press(screen.getByRole('button', { name: '상황 정보 입력' }));

    expect(screen.getByDisplayValue('나: 안녕\n상대: 반가워')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledWith('/situation');
  });

  test('캡처와 만남 후기 선택은 각각 다음 입력 화면으로 이동한다', async () => {
    const screen = renderHome();
    await waitFor(() => expect(screen.getByRole('button', { name: '캡처' })).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: '캡처 시작' }));
    expect(mockPush).toHaveBeenLastCalledWith('/capture');

    fireEvent.press(screen.getByRole('button', { name: '만남 후기' }));
    fireEvent.press(screen.getByRole('button', { name: '상황 정보 입력' }));
    expect(mockPush).toHaveBeenLastCalledWith('/situation');
  });

  test('저장된 초안이 있으면 이어서 작성과 새로 시작 명령을 표시한다', async () => {
    mockLoad.mockResolvedValue({
      ...createEmptyDraft(),
      primaryInput: 'text',
      pastedText: '저장된 대화',
    });

    const screen = renderHome();

    expect(await screen.findByRole('button', { name: '이어서 작성' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로 시작' })).toBeTruthy();
    expect(screen.queryByText('채팅 분석 시작하기')).toBeNull();
  });
});
