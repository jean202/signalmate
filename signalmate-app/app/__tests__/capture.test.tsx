import { Platform } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CaptureScreen from '../capture';
import { AnalysisProvider } from '../../providers/analysis-provider';
import { createEmptyDraft } from '../../lib/analysis/draft';
import type { AnalysisDraft, ImageDraftItem } from '../../lib/analysis/types';
import { cachePickedImage, deleteCachedImage } from '../../lib/analysis/image-cache';
import { extractImage } from '../../lib/api/client';

const mockPush = jest.fn();
const mockLoad = jest.fn<Promise<AnalysisDraft | null>, []>();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  getPendingResultAsync: jest.fn(),
}));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return { ArrowDown: Icon, ArrowUp: Icon, Plus: Icon, RefreshCw: Icon, Trash2: Icon };
});
jest.mock('../../lib/analysis/draft-storage', () => ({
  draftStorage: {
    load: () => mockLoad(),
    save: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../lib/analysis/image-cache', () => ({
  cachePickedImage: jest.fn((uri: string, _id: string, fileName: string) => `file://cache/${fileName}`),
  deleteCachedImage: jest.fn(),
  clearCachedImages: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  extractImage: jest.fn(),
}));

const mockedPicker = ImagePicker as jest.Mocked<typeof ImagePicker>;
const mockedCachePickedImage = cachePickedImage as jest.MockedFunction<typeof cachePickedImage>;
const mockedDeleteCachedImage = deleteCachedImage as jest.MockedFunction<typeof deleteCachedImage>;
const mockedExtractImage = extractImage as jest.MockedFunction<typeof extractImage>;

function image(overrides: Partial<ImageDraftItem> = {}): ImageDraftItem {
  const id = overrides.id ?? 'image-1';
  return {
    id,
    order: 0,
    uri: `file://cache/${id}.png`,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    fileSize: 100,
    status: 'queued',
    extractedText: '',
    editedText: '',
    notes: [],
    errorCode: null,
    reviewed: false,
    ...overrides,
  };
}

function draftWith(images: ImageDraftItem[] = []): AnalysisDraft {
  return { ...createEmptyDraft(), primaryInput: 'capture', images };
}

function pickerAsset(overrides: Record<string, unknown> = {}) {
  return {
    assetId: null,
    base64: null,
    duration: null,
    exif: null,
    fileName: 'chat.png',
    fileSize: 100,
    height: 1200,
    mimeType: 'image/png',
    pairedVideoAsset: null,
    type: 'image' as const,
    uri: 'file://source/chat.png',
    width: 800,
    ...overrides,
  };
}

function renderCapture(initialDraft = draftWith()) {
  mockLoad.mockResolvedValue(initialDraft);
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, right: 0, bottom: 34, left: 0 },
    }}>
      <AnalysisProvider><CaptureScreen /></AnalysisProvider>
    </SafeAreaProvider>,
  );
}

describe('CaptureScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLoad.mockResolvedValue(draftWith());
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true, assets: null });
    mockedPicker.getPendingResultAsync.mockResolvedValue(null);
  });

  test('사진 선택기는 남은 수만큼 이미지와 선택 순서를 정확히 요청하고 취소는 초안을 바꾸지 않는다', async () => {
    const screen = renderCapture(draftWith([image({ id: 'one' }), image({ id: 'two', order: 1 })]));
    await screen.findByText('one.png');

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));

    await waitFor(() => expect(mockedPicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 18,
      orderedSelection: true,
      quality: 1,
    }));
    expect(mockedCachePickedImage).not.toHaveBeenCalled();
    expect(screen.getByText('2 / 20장')).toBeTruthy();
    expect(screen.getByRole('button', { name: '검수하기' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));
  });

  test('PNG/JPEG/WEBP/GIF 10MB 이하만 캐시에 선택 순서대로 추가한다', async () => {
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        pickerAsset({ uri: 'file://source/a.png', fileName: 'a.png', mimeType: undefined }),
        pickerAsset({ uri: 'file://source/b.jpg', fileName: 'b.jpg', mimeType: 'image/jpeg' }),
        pickerAsset({ uri: 'file://source/c.webp', fileName: 'c.webp', mimeType: 'image/webp' }),
        pickerAsset({ uri: 'file://source/d.gif', fileName: 'd.gif', mimeType: 'image/gif' }),
        pickerAsset({ uri: 'file://source/e.heic', fileName: 'e.heic', mimeType: 'image/heic' }),
        pickerAsset({ uri: 'file://source/f.avif', fileName: 'f.avif', mimeType: undefined }),
        pickerAsset({ uri: 'file://source/g.png', fileName: 'g.png', fileSize: 10 * 1024 * 1024 + 1 }),
      ],
    });
    const screen = renderCapture();
    await waitFor(() => expect(screen.getByRole('button', { name: '캡처 추가' })).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));

    await screen.findByText('4 / 20장');
    expect(screen.getAllByTestId('capture-file-name').map((node) => node.props.children))
      .toEqual(['a.png', 'b.jpg', 'c.webp', 'd.gif']);
    expect(screen.getByText(/HEIC와 AVIF/)).toBeTruthy();
    expect(screen.getByText(/10MB 이하/)).toBeTruthy();
    expect(mockedCachePickedImage).toHaveBeenCalledTimes(4);
  });

  test('20장까지만 추가하고 가득 차면 선택기를 다시 열지 않는다', async () => {
    const existing = Array.from({ length: 19 }, (_, index) => image({
      id: `existing-${index}`,
      order: index,
      fileName: `existing-${index}.png`,
    }));
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [pickerAsset({ fileName: 'last.png' }), pickerAsset({ fileName: 'overflow.png' })],
    });
    const screen = renderCapture(draftWith(existing));
    await screen.findByText('19 / 20장');

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));
    await screen.findByText('20 / 20장');
    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));

    expect(mockedPicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('overflow.png')).toBeNull();
  });

  test('Android pending 결과를 한 번만 소비하고 기존 항목과 중복 추가하지 않는다', async () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockedPicker.getPendingResultAsync.mockResolvedValue({
      canceled: false,
      assets: [
        pickerAsset({ fileName: 'same.png', fileSize: 777, uri: 'file://source/same.png' }),
        pickerAsset({ fileName: 'pending.png', fileSize: 888, uri: 'file://source/pending.png' }),
      ],
    });
    const existing = image({ fileName: 'same.png', fileSize: 777, mimeType: 'image/png' });

    const screen = renderCapture(draftWith([existing]));
    await screen.findByText('2 / 20장');

    expect(mockedPicker.getPendingResultAsync).toHaveBeenCalledTimes(1);
    expect(mockedCachePickedImage).toHaveBeenCalledTimes(1);
    expect(mockedCachePickedImage).toHaveBeenCalledWith(
      'file://source/pending.png',
      expect.any(String),
      'pending.png',
      'image/png',
    );
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  });

  test('아이콘으로 순서를 바꾸고 삭제하면 캐시와 초안을 함께 정리한다', async () => {
    const first = image({ id: 'first', fileName: 'first.png' });
    const second = image({ id: 'second', fileName: 'second.png', order: 1 });
    const screen = renderCapture(draftWith([first, second]));
    await screen.findByText('first.png');

    expect(screen.getByRole('button', { name: 'first.png 위로 이동' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));
    fireEvent.press(screen.getByRole('button', { name: 'second.png 위로 이동' }));
    expect(screen.getAllByTestId('capture-file-name').map((node) => node.props.children))
      .toEqual(['second.png', 'first.png']);

    fireEvent.press(screen.getByRole('button', { name: 'first.png 삭제' }));
    expect(mockedDeleteCachedImage).toHaveBeenCalledWith(first.uri);
    expect(screen.queryByText('first.png')).toBeNull();
  });

  test('한 장 OCR 실패 뒤에도 성공한 장의 텍스트를 보존하고 검수를 허용한다', async () => {
    mockedExtractImage
      .mockResolvedValueOnce({ rawText: '나: 안녕', messageCount: 1, notes: ['말풍선 1개'] })
      .mockRejectedValueOnce(new Error('raw provider failure'));
    const screen = renderCapture(draftWith([
      image({ id: 'success', fileName: 'success.png' }),
      image({ id: 'failure', fileName: 'failure.png', order: 1 }),
    ]));
    await screen.findByText('success.png');

    fireEvent.press(screen.getByRole('button', { name: '텍스트 추출' }));

    await screen.findByText('1장 완료');
    expect(screen.getByText('1장 재시도 필요')).toBeTruthy();
    expect(screen.getByText('추출 완료')).toBeTruthy();
    expect(screen.getByText('추출 실패')).toBeTruthy();
    expect(screen.getByRole('button', { name: '검수하기' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: false }));
    fireEvent.press(screen.getByRole('button', { name: '검수하기' }));
    expect(mockPush).toHaveBeenCalledWith('/ocr-review');
  });

  test('재시도는 실패 항목만 다시 OCR하고 성공 항목은 유지한다', async () => {
    mockedExtractImage.mockResolvedValue({ rawText: '상대: 다시 읽음', messageCount: 1, notes: [] });
    const screen = renderCapture(draftWith([
      image({ id: 'done', fileName: 'done.png', status: 'complete', extractedText: '나: 보존', editedText: '나: 보존' }),
      image({ id: 'failed', fileName: 'failed.png', order: 1, status: 'failed', errorCode: 'OCR_FAILED' }),
    ]));
    await screen.findByText('1장 재시도 필요');

    fireEvent.press(screen.getByRole('button', { name: '실패한 1장 재시도' }));

    await waitFor(() => expect(mockedExtractImage).toHaveBeenCalledTimes(1));
    expect(mockedExtractImage).toHaveBeenCalledWith(expect.stringContaining('failed'));
    await screen.findByText('2장 완료');
  });
});
