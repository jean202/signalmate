import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import CaptureScreen from '../capture';
import { AnalysisProvider, useAnalysis } from '../../providers/analysis-provider';
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
const originalPlatform = Platform.OS;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

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

function CaptureLifecycleHarness() {
  const [visible, setVisible] = useState(true);
  const { draft } = useAnalysis();
  return (
    <>
      <Text testID="provider-ocr-status">{draft.images[0]?.status ?? 'missing'}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={visible ? '캡처 화면 숨기기' : '캡처 화면 다시 열기'}
        onPress={() => setVisible((current) => !current)}
      >
        <Text>{visible ? '캡처 화면 숨기기' : '캡처 화면 다시 열기'}</Text>
      </Pressable>
      {visible && <CaptureScreen />}
    </>
  );
}

function renderCaptureLifecycle(initialDraft: AnalysisDraft) {
  mockLoad.mockResolvedValue(initialDraft);
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 47, right: 0, bottom: 34, left: 0 },
    }}>
      <AnalysisProvider><CaptureLifecycleHarness /></AnalysisProvider>
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

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
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
        pickerAsset({ uri: 'file://source/h.png', fileName: 'h.png', fileSize: undefined }),
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
    expect(screen.getByText(/파일 크기를 확인할 수 없는/)).toBeTruthy();
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
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockedPicker.getPendingResultAsync.mockResolvedValue({
      canceled: false,
      assets: [
        pickerAsset({ fileName: 'same.png', fileSize: 777, uri: 'file://source/same.png' }),
        pickerAsset({ fileName: 'pending.png', fileSize: 888, uri: 'file://source/pending.png' }),
      ],
    });
    const existing = image({
      fileName: 'same.png',
      fileSize: 777,
      mimeType: 'image/png',
      sourceKey: 'uri:file://source/same.png',
    });

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
  });

  test('pending과 picker가 겹쳐도 직렬 처리하고 재진입 없이 20장과 캐시를 맞춘다', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const pending = createDeferred<Awaited<ReturnType<typeof ImagePicker.getPendingResultAsync>>>();
    const picker = createDeferred<Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>>();
    mockedPicker.getPendingResultAsync.mockReturnValue(pending.promise);
    mockedPicker.launchImageLibraryAsync.mockReturnValue(picker.promise);
    const existing = Array.from({ length: 19 }, (_, index) => image({
      id: `existing-${index}`,
      order: index,
      fileName: `existing-${index}.png`,
      sourceKey: `asset:existing-${index}`,
    }));
    const selected = pickerAsset({ assetId: 'selected', fileName: 'selected.png', uri: 'file://source/selected.png' });
    const screen = renderCapture(draftWith(existing));
    await screen.findByText('19 / 20장');

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));
    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));
    expect(mockedPicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);

    await act(async () => picker.resolve({ canceled: false, assets: [selected] }));
    await screen.findByText('20 / 20장');
    await act(async () => pending.resolve({
      canceled: false,
      assets: [
        selected,
        pickerAsset({ assetId: 'pending-overflow', fileName: 'overflow.png', uri: 'file://source/overflow.png' }),
      ],
    }));

    await waitFor(() => expect(mockedPicker.getPendingResultAsync).toHaveBeenCalledTimes(1));
    expect(screen.getAllByTestId('capture-file-name')).toHaveLength(20);
    expect(screen.getAllByText('selected.png')).toHaveLength(1);
    expect(screen.queryByText('overflow.png')).toBeNull();
    expect(mockedCachePickedImage).toHaveBeenCalledTimes(1);
    expect(mockedDeleteCachedImage).not.toHaveBeenCalled();
  });

  test('이름과 크기와 MIME이 같아도 source URI가 다르면 모두 추가한다', async () => {
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        pickerAsset({ assetId: null, uri: 'file://source/first/chat.png' }),
        pickerAsset({ assetId: null, uri: 'file://source/second/chat.png' }),
      ],
    });
    const screen = renderCapture();
    await waitFor(() => expect(screen.getByRole('button', { name: '캡처 추가' })).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));

    await screen.findByText('2 / 20장');
    expect(screen.getAllByTestId('capture-file-name')).toHaveLength(2);
    expect(mockedCachePickedImage).toHaveBeenCalledTimes(2);
  });

  test('재시작 뒤 같은 assetId의 pending 자산은 다시 추가하지 않는다', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    mockedPicker.getPendingResultAsync.mockResolvedValue({
      canceled: false,
      assets: [pickerAsset({ assetId: 'stable-asset', uri: 'file://new-provider-uri/chat.png' })],
    });
    const existing = image({ sourceKey: 'asset:stable-asset' });

    const screen = renderCapture(draftWith([existing]));
    await screen.findByText('1 / 20장');

    await waitFor(() => expect(mockedPicker.getPendingResultAsync).toHaveBeenCalledTimes(1));
    expect(mockedCachePickedImage).not.toHaveBeenCalled();
    expect(screen.getAllByTestId('capture-file-name')).toHaveLength(1);
  });

  test('일부 캐시 복사가 실패해도 성공한 자산은 순서대로 보존한다', async () => {
    mockedCachePickedImage
      .mockImplementationOnce((_uri, _id, fileName) => `file://cache/${fileName}`)
      .mockImplementationOnce(() => { throw new Error('copy failed'); })
      .mockImplementationOnce((_uri, _id, fileName) => `file://cache/${fileName}`);
    mockedPicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        pickerAsset({ assetId: 'a', fileName: 'a.png', uri: 'file://source/a.png' }),
        pickerAsset({ assetId: 'b', fileName: 'b.png', uri: 'file://source/b.png' }),
        pickerAsset({ assetId: 'c', fileName: 'c.png', uri: 'file://source/c.png' }),
      ],
    });
    const screen = renderCapture();
    await waitFor(() => expect(screen.getByRole('button', { name: '캡처 추가' })).toBeTruthy());

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));

    await screen.findByText('2 / 20장');
    expect(screen.getAllByTestId('capture-file-name').map((node) => node.props.children))
      .toEqual(['a.png', 'c.png']);
    expect(screen.getByText(/이미지를 보관하지 못했어요/)).toBeTruthy();
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

  test('캐시 삭제가 실패하면 초안 항목을 유지하고 안전한 안내를 표시한다', async () => {
    mockedDeleteCachedImage.mockImplementationOnce(() => { throw new Error('raw delete failure'); });
    const target = image({ id: 'keep', fileName: 'keep.png' });
    const screen = renderCapture(draftWith([target]));
    await screen.findByText('keep.png');

    fireEvent.press(screen.getByRole('button', { name: 'keep.png 삭제' }));

    expect(mockedDeleteCachedImage).toHaveBeenCalledWith(target.uri);
    expect(screen.getByText('keep.png')).toBeTruthy();
    expect(screen.getByText('이미지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeTruthy();
  });

  test('320pt 폭을 위해 파일 정보와 44pt 이동·삭제 제어를 별도 행에 둔다', async () => {
    const target = image({ id: 'layout', fileName: 'very-long-capture-file-name-for-mobile.png' });
    const screen = renderCapture(draftWith([target]));
    const infoRow = await screen.findByTestId('capture-info-row-layout');
    const actionRow = screen.getByTestId('capture-action-row-layout');

    expect(StyleSheet.flatten(screen.getByTestId('capture-item-layout').props.style))
      .toEqual(expect.objectContaining({ minHeight: 148 }));
    expect(StyleSheet.flatten(infoRow.props.style)).toEqual(expect.objectContaining({
      flexDirection: 'row',
      width: '100%',
    }));
    expect(StyleSheet.flatten(actionRow.props.style)).toEqual(expect.objectContaining({
      flexDirection: 'row',
      minHeight: 44,
    }));
    for (const name of ['위로 이동', '아래로 이동', '삭제']) {
      expect(StyleSheet.flatten(screen.getByRole('button', {
        name: `very-long-capture-file-name-for-mobile.png ${name}`,
      }).props.style)).toEqual(expect.objectContaining({ width: 44, height: 44 }));
    }
  });

  test('picker가 unmount 뒤 완료되면 자산을 캐시에 복사하거나 상태를 갱신하지 않는다', async () => {
    const picker = createDeferred<Awaited<ReturnType<typeof ImagePicker.launchImageLibraryAsync>>>();
    mockedPicker.launchImageLibraryAsync.mockReturnValue(picker.promise);
    const screen = renderCapture();
    await waitFor(() => expect(screen.getByRole('button', { name: '캡처 추가' })).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));

    screen.unmount();
    await act(async () => picker.resolve({ canceled: false, assets: [pickerAsset()] }));

    expect(mockedCachePickedImage).not.toHaveBeenCalled();
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

  test('OCR이 unmount 뒤 완료되어도 로컬 상태 오류나 원문 로그를 남기지 않는다', async () => {
    const extraction = createDeferred<{ rawText: string; messageCount: number; notes: string[] }>();
    mockedExtractImage.mockReturnValue(extraction.promise);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    const consoleLog = jest.spyOn(console, 'log').mockImplementation();
    const screen = renderCapture(draftWith([image({ id: 'slow', fileName: 'slow.png' })]));
    await screen.findByText('slow.png');
    fireEvent.press(screen.getByRole('button', { name: '텍스트 추출' }));
    await waitFor(() => expect(mockedExtractImage).toHaveBeenCalledTimes(1));

    screen.unmount();
    await act(async () => extraction.resolve({ rawText: '원문 비공개', messageCount: 1, notes: [] }));

    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  test('CaptureScreen만 unmount하면 extracting을 queued로 복구하고 재마운트 후 다시 추출한다', async () => {
    const firstExtraction = createDeferred<{ rawText: string; messageCount: number; notes: string[] }>();
    mockedExtractImage
      .mockReturnValueOnce(firstExtraction.promise)
      .mockResolvedValueOnce({ rawText: '상대: 재추출 완료', messageCount: 1, notes: [] });
    const screen = renderCaptureLifecycle(draftWith([
      image({ id: 'recover', fileName: 'recover.png' }),
    ]));
    await screen.findByText('recover.png');

    fireEvent.press(screen.getByRole('button', { name: '텍스트 추출' }));
    await waitFor(() => expect(screen.getByTestId('provider-ocr-status').props.children).toBe('extracting'));
    fireEvent.press(screen.getByRole('button', { name: '캡처 화면 숨기기' }));

    await waitFor(() => expect(screen.getByTestId('provider-ocr-status').props.children).toBe('queued'));
    await act(async () => firstExtraction.resolve({ rawText: '늦은 원문', messageCount: 1, notes: [] }));
    expect(screen.getByTestId('provider-ocr-status').props.children).toBe('queued');

    fireEvent.press(screen.getByRole('button', { name: '캡처 화면 다시 열기' }));
    await screen.findByText('recover.png');
    fireEvent.press(screen.getByRole('button', { name: '텍스트 추출' }));

    await waitFor(() => expect(mockedExtractImage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('provider-ocr-status').props.children).toBe('complete'));
  });
});
