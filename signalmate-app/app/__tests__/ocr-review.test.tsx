import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OcrReviewScreen from '../ocr-review';
import { createEmptyDraft } from '../../lib/analysis/draft';
import type { AnalysisDraft, ImageDraftItem } from '../../lib/analysis/types';
import { useAnalysis } from '../../providers/analysis-provider';

const mockPush = jest.fn();
const mockUpdateDraft = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('lucide-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Icon = (props: object) => React.createElement(View, props);
  return { ChevronLeft: Icon, ChevronRight: Icon, Plus: Icon, Trash2: Icon };
});
jest.mock('../../providers/analysis-provider', () => ({
  useAnalysis: jest.fn(),
}));

const mockedUseAnalysis = useAnalysis as jest.MockedFunction<typeof useAnalysis>;

function image(overrides: Partial<ImageDraftItem> = {}): ImageDraftItem {
  const id = overrides.id ?? 'image-1';
  return {
    id,
    order: 0,
    uri: `file://cache/${id}.png`,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    fileSize: 100,
    status: 'complete',
    extractedText: '나: 원본 내용',
    editedText: '나: 원본 내용',
    notes: [],
    errorCode: null,
    reviewed: false,
    ...overrides,
  };
}

function draftWith(overrides: Partial<AnalysisDraft> = {}): AnalysisDraft {
  return {
    ...createEmptyDraft('2026-07-11T00:00:00.000Z'),
    primaryInput: 'capture',
    images: [
      image(),
      image({
        id: 'image-2',
        order: 1,
        extractedText: '상대: 반복\n나: 다음 내용',
        editedText: '상대: 반복\n나: 다음 내용',
      }),
      image({ id: 'failed', order: 2, status: 'failed', editedText: '실패 원문' }),
    ],
    ...overrides,
  };
}

function renderReview(draft = draftWith()) {
  mockedUseAnalysis.mockReturnValue({
    hydrated: true,
    draft,
    result: null,
    updateDraft: mockUpdateDraft,
    setResult: jest.fn(),
    resetDraft: jest.fn(),
  });
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 320, height: 700 },
      insets: { top: 20, right: 0, bottom: 20, left: 0 },
    }}>
      <OcrReviewScreen />
    </SafeAreaProvider>,
  );
}

function lastUpdatedDraft(base: AnalysisDraft): AnalysisDraft {
  const updater = mockUpdateDraft.mock.calls.at(-1)?.[0];
  if (!updater) throw new Error('초안 갱신 함수가 호출되지 않았습니다.');
  return updater(base);
}

describe('OcrReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('현재 이미지 텍스트를 수정하고 검수 완료로 표시하며 extractedText는 보존한다', () => {
    const savedDraft = draftWith();
    const screen = renderReview(savedDraft);

    fireEvent.changeText(screen.getByLabelText('1번 캡처 추출 텍스트'), '나: 수정한 내용');
    fireEvent.press(screen.getByRole('button', { name: '이 캡처 검수 완료' }));

    expect(lastUpdatedDraft(savedDraft).images[0]).toMatchObject({
      editedText: '나: 수정한 내용',
      extractedText: '나: 원본 내용',
      reviewed: true,
    });
  });

  test('complete 이미지만 이전과 다음으로 이동한다', () => {
    const screen = renderReview();

    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '이전 캡처' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));

    fireEvent.press(screen.getByRole('button', { name: '다음 캡처' }));

    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getByLabelText('2번 캡처 추출 텍스트')).toBeTruthy();
    expect(screen.getByRole('button', { name: '다음 캡처' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));
  });

  test('모든 complete 이미지가 reviewed일 때만 다음 단계로 이동한다', () => {
    const incompleteScreen = renderReview();
    expect(incompleteScreen.getByRole('button', { name: '상황 정보 입력' }).props.accessibilityState)
      .toEqual(expect.objectContaining({ disabled: true }));
    incompleteScreen.unmount();

    const reviewedDraft = draftWith({
      images: draftWith().images.map((item) => (
        item.status === 'complete' ? { ...item, reviewed: true } : item
      )),
    });
    const completeScreen = renderReview(reviewedDraft);
    fireEvent.press(completeScreen.getByRole('button', { name: '상황 정보 입력' }));

    expect(mockPush).toHaveBeenCalledWith('/situation');
  });

  test('전체 적용은 complete 이미지 editedText와 pastedText만 치환한다', () => {
    const savedDraft = draftWith({
      pastedText: '진하님: 붙여넣기',
      replacementRules: [{ id: 'rule-1', source: '진하님', replacement: '[내이름]' }],
      images: [
        image({ extractedText: '진하님: 원본', editedText: '진하님: 편집본' }),
        image({ id: 'queued', order: 1, status: 'queued', editedText: '진하님: 대기' }),
      ],
    });
    const screen = renderReview(savedDraft);

    fireEvent.press(screen.getByRole('button', { name: '치환 규칙 전체 적용' }));

    const nextDraft = lastUpdatedDraft(savedDraft);
    expect(nextDraft.images[0]).toMatchObject({
      extractedText: '진하님: 원본',
      editedText: '[내이름]: 편집본',
    });
    expect(nextDraft.images[1].editedText).toBe('진하님: 대기');
    expect(nextDraft.pastedText).toBe('[내이름]: 붙여넣기');
  });

  test('중복 후보는 체크박스로 표시하고 선택한 id만 제외 목록에 토글한다', () => {
    const savedDraft = draftWith({
      images: [
        image({ editedText: '나: 안녕\n상대: 반복' }),
        image({ id: 'image-2', order: 1, editedText: '상대: 반복\n나: 다음' }),
      ],
    });
    const screen = renderReview(savedDraft);
    const checkbox = screen.getByRole('checkbox', { name: '중복 제외: 상대: 반복' });

    expect(checkbox.props.accessibilityState).toEqual(expect.objectContaining({ checked: false }));
    fireEvent.press(checkbox);

    const excludedDraft = lastUpdatedDraft(savedDraft);
    expect(excludedDraft.excludedDuplicateIds).toEqual(['image-2:0']);
    expect(excludedDraft.images).toEqual(savedDraft.images);

    mockUpdateDraft.mockClear();
    const selectedScreen = renderReview({ ...savedDraft, excludedDuplicateIds: ['image-2:0'] });
    fireEvent.press(selectedScreen.getByRole('checkbox', { name: '중복 제외: 상대: 반복' }));
    expect(lastUpdatedDraft({ ...savedDraft, excludedDuplicateIds: ['image-2:0'] }).excludedDuplicateIds)
      .toEqual([]);
  });

  test('320pt 화면을 위한 고정 비율 미리보기와 최소 220pt 편집 영역을 제공한다', () => {
    const screen = renderReview();
    const previewStyle = StyleSheet.flatten(screen.getByTestId('ocr-image-preview').props.style);
    const editorStyle = StyleSheet.flatten(screen.getByLabelText('1번 캡처 추출 텍스트').props.style);

    expect(previewStyle).toEqual(expect.objectContaining({ width: '100%', aspectRatio: expect.any(Number) }));
    expect(editorStyle.minHeight).toBeGreaterThanOrEqual(220);
  });
});
