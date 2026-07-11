import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnalysisProvider } from '../../providers/analysis-provider';
import { createEmptyDraft } from '../../lib/analysis/draft';
import HomeScreen from '../index';

const mockPush = jest.fn();
const mockLoad = jest.fn();
const mockSave = jest.fn();
const mockClear = jest.fn();
const mockClearCachedImages = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('../../lib/analysis/draft-storage', () => ({
  draftStorage: {
    load: () => mockLoad(),
    save: (...args: unknown[]) => mockSave(...args),
    clear: () => mockClear(),
  },
}));
jest.mock('../../lib/analysis/image-cache', () => ({
  clearCachedImages: () => mockClearCachedImages(),
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const restoredDraft = {
  ...createEmptyDraft(),
  primaryInput: 'text' as const,
  pastedText: '저장된 대화',
};

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
    jest.clearAllMocks();
    mockPush.mockReset();
    mockLoad.mockReset();
    mockSave.mockReset().mockResolvedValue(undefined);
    mockClear.mockReset().mockResolvedValue(undefined);
    mockClearCachedImages.mockReset();
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
    mockLoad.mockResolvedValue(restoredDraft);

    const screen = renderHome();

    expect(await screen.findByRole('button', { name: '이어서 작성' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로 시작' })).toBeTruthy();
    expect(screen.queryByText('채팅 분석 시작하기')).toBeNull();
  });

  test('새로 시작 중에는 중복 탭을 차단하고 접근성 상태를 표시한다', async () => {
    const clear = deferred();
    mockLoad.mockResolvedValue(restoredDraft);
    mockClear.mockReturnValue(clear.promise);
    const screen = renderHome();
    const button = await screen.findByRole('button', { name: '새로 시작' });

    fireEvent.press(button);
    fireEvent.press(button);

    expect(button).toBeDisabled();
    expect(button.props.accessibilityState).toEqual({ busy: true, disabled: true });
    await waitFor(() => expect(mockClear).toHaveBeenCalledTimes(1));

    await act(async () => clear.resolve());
    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  test('새로 시작 실패 시 기존 초안과 이어서 작성을 유지하고 재시도를 제공한다', async () => {
    mockLoad.mockResolvedValue(restoredDraft);
    mockClear.mockRejectedValueOnce(new Error('private clear error'));
    const screen = renderHome();

    fireEvent.press(await screen.findByRole('button', { name: '새로 시작' }));

    expect(await screen.findByRole('alert', {
      name: '새로 시작하지 못했어요. 기존 초안은 유지했습니다. 잠시 후 다시 시도해 주세요.',
    })).toBeTruthy();
    expect(screen.getByRole('button', { name: '이어서 작성' })).toBeTruthy();
    expect(screen.getByDisplayValue('저장된 대화')).toBeTruthy();
    expect(screen.getByRole('button', { name: '새로 시작 다시 시도' })).toBeTruthy();
    expect(screen.queryByText('private clear error')).toBeNull();
  });

  test('새로 시작 재시도 성공 시 실패 안내와 기존 초안을 비운다', async () => {
    mockLoad.mockResolvedValue(restoredDraft);
    mockClear
      .mockRejectedValueOnce(new Error('private clear error'))
      .mockResolvedValueOnce(undefined);
    const screen = renderHome();

    fireEvent.press(await screen.findByRole('button', { name: '새로 시작' }));
    const retry = await screen.findByRole('button', { name: '새로 시작 다시 시도' });
    fireEvent.press(retry);

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.queryByRole('button', { name: '이어서 작성' })).toBeNull();
    expect(screen.queryByDisplayValue('저장된 대화')).toBeNull();
    expect(mockClear).toHaveBeenCalledTimes(2);
  });

  test.each(['resolve', 'reject'] as const)('unmount 뒤 reset %s는 상태나 오류 원문을 기록하지 않는다', async (settle) => {
    const clear = deferred();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockLoad.mockResolvedValue(restoredDraft);
    mockClear.mockReturnValue(clear.promise);
    const screen = renderHome();

    fireEvent.press(await screen.findByRole('button', { name: '새로 시작' }));
    screen.unmount();
    await act(async () => {
      if (settle === 'resolve') clear.resolve();
      else clear.reject(new Error('private clear error'));
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
