import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createEmptyDraft } from '../../lib/analysis/draft';
import { analysisInputFingerprint } from '../../lib/analysis/fingerprint';
import { duplicateCandidateId } from '../../lib/analysis/input-builder';
import { clearCachedImages } from '../../lib/analysis/image-cache';
import type { AnalysisDraft, AnalysisResult, ConversationSnapshot } from '../../lib/analysis/types';
import { createConversation, streamAnalysis } from '../../lib/api/client';
import { useAnalysis } from '../../providers/analysis-provider';
import ReviewScreen from '../review';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockUpdateDraft = jest.fn();
const mockSetResult = jest.fn();
const mockResetDraft = jest.fn();
let activeRunId = 0;
let externalUpdateDraft: ((updater: (draft: AnalysisDraft) => AnalysisDraft) => void) | null = null;
const mockFocusCleanups = new Set<() => void>();
const mockFocusEffects = new Set<() => void | (() => void)>();
const mockBeginAnalysisRun = () => { activeRunId += 1; return activeRunId; };
const mockIsAnalysisRunActive = (runId: number) => runId === activeRunId;
const mockCancelAnalysisRun = (runId: number) => { if (runId === activeRunId) activeRunId += 1; };
const mockIsDraftFingerprintCurrent = (fingerprint: string) => (
  analysisInputFingerprint(latestDraft) === fingerprint
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    const React = require('react');
    React.useEffect(() => {
      mockFocusEffects.add(effect);
      const cleanup = effect();
      if (cleanup) mockFocusCleanups.add(cleanup);
      return () => {
        if (cleanup) {
          mockFocusCleanups.delete(cleanup);
          cleanup();
        }
        mockFocusEffects.delete(effect);
      };
    }, [effect]);
  },
}));
jest.mock('../../providers/analysis-provider', () => ({
  useAnalysis: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  createConversation: jest.fn(),
  streamAnalysis: jest.fn(),
}));
jest.mock('../../lib/analysis/image-cache', () => ({
  clearCachedImages: jest.fn(),
}));

const mockedUseAnalysis = useAnalysis as jest.MockedFunction<typeof useAnalysis>;
const mockedCreateConversation = createConversation as jest.MockedFunction<typeof createConversation>;
const mockedStreamAnalysis = streamAnalysis as jest.MockedFunction<typeof streamAnalysis>;
const mockedClearCachedImages = clearCachedImages as jest.MockedFunction<typeof clearCachedImages>;
let latestDraft: AnalysisDraft;

const conversation: ConversationSnapshot = {
  id: 'conversation-1',
  rawText: '',
  situationContext: '상대가 먼저 다음 장소를 이야기했고 분위기도 편안했습니다.',
  relationshipStage: 'after_first_date',
  meetingChannel: 'blind_date',
  userGoal: 'continue_chat',
  messages: [],
};
const result: AnalysisResult = {
  analysisId: 'analysis-1',
  overallSummary: '분석 요약',
  signals: [],
  recommendations: [],
  recommendedAction: 'keep_light',
  recommendedActionReason: '가볍게 이어가세요.',
  confidenceLevel: 'medium',
  warnings: [],
};

function validSituationDraft(): AnalysisDraft {
  const draft = createEmptyDraft('2026-07-11T00:00:00.000Z');
  draft.primaryInput = 'meeting_note';
  draft.relationshipStage = 'after_first_date';
  draft.meetingChannel = 'blind_date';
  draft.guidedAnswers.inputFocus = 'meeting_note';
  draft.guidedAnswers.freeText = '상대가 먼저 다음 장소를 이야기했고 분위기도 편안했습니다.';
  return draft;
}

function renderReview(initialDraft = validSituationDraft()) {
  mockedUseAnalysis.mockImplementation(() => {
    const [draft, setDraft] = useState(initialDraft);
    latestDraft = draft;
    externalUpdateDraft = setDraft;
    return {
      hydrated: true,
      draft,
      result: null,
      updateDraft: (updater) => {
        mockUpdateDraft(updater);
        setDraft(updater);
      },
      setResult: mockSetResult,
      resetDraft: mockResetDraft,
      beginAnalysisRun: mockBeginAnalysisRun,
      isAnalysisRunActive: mockIsAnalysisRunActive,
      cancelAnalysisRun: mockCancelAnalysisRun,
      isDraftFingerprintCurrent: mockIsDraftFingerprintCurrent,
    };
  });
  return render(
    <SafeAreaProvider initialMetrics={{
      frame: { x: 0, y: 0, width: 320, height: 700 },
      insets: { top: 20, right: 0, bottom: 20, left: 0 },
    }}>
      <ReviewScreen />
    </SafeAreaProvider>,
  );
}

describe('ReviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClearCachedImages.mockReset();
    activeRunId = 0;
    externalUpdateDraft = null;
    mockFocusCleanups.clear();
    mockFocusEffects.clear();
    mockedCreateConversation.mockResolvedValue(conversation as Awaited<ReturnType<typeof createConversation>>);
    mockedStreamAnalysis.mockResolvedValue(result);
  });

  test('만남 후기만 20자 이상이면 분석 버튼을 활성화한다', () => {
    const screen = renderReview();

    expect(screen.getByText('채팅 메시지 0개')).toBeTruthy();
    expect(screen.getByText('만남 후기 32자')).toBeTruthy();
    expect(screen.getByRole('button', { name: '분석하기' })).toBeEnabled();
  });

  test('현재 중복 후보만 계산해 실제 요약 수치를 표시한다', () => {
    const draft = validSituationDraft();
    draft.primaryInput = 'capture';
    draft.guidedAnswers.inputFocus = 'mixed';
    draft.images = [
      {
        id: 'image-1', order: 0, uri: 'file://1.png', fileName: '1.png', mimeType: 'image/png',
        fileSize: 1, status: 'complete', extractedText: '', editedText: '나: 안녕\n상대: 반복',
        notes: [], errorCode: null, reviewed: true,
      },
      {
        id: 'image-2', order: 1, uri: 'file://2.png', fileName: '2.png', mimeType: 'image/png',
        fileSize: 1, status: 'complete', extractedText: '', editedText: '상대: 반복\n나: 다음',
        notes: [], errorCode: null, reviewed: false,
      },
    ];
    draft.replacementRules = [
      { id: 'active', source: '민수', replacement: '[상대이름]' },
      { id: 'delete', source: '010-1234-5678', replacement: '' },
      { id: 'empty', source: '', replacement: '[빈값]' },
    ];
    draft.excludedDuplicateIds = [
      duplicateCandidateId('image-2', 0, '상대: 반복'),
      duplicateCandidateId('image-2', 0, '상대: 반복'),
      'duplicate:stale:0:old',
    ];
    const screen = renderReview(draft);

    expect(screen.getByText('채팅 메시지 3개')).toBeTruthy();
    expect(screen.getByText('완료 이미지 2장 · 검수 1장')).toBeTruthy();
    expect(screen.getByText('관계 단계 첫 만남 후')).toBeTruthy();
    expect(screen.getByText('만난 경로 소개팅')).toBeTruthy();
    expect(screen.getByText('분석 전 자동 치환 2개')).toBeTruthy();
    expect(screen.getByText('중복 제외 1개')).toBeTruthy();
  });

  test('검증 오류를 사용자가 수정할 화면 명령과 연결한다', () => {
    const draft = createEmptyDraft();
    draft.primaryInput = 'capture';
    draft.images = [{
      id: 'image-1', order: 0, uri: 'file://1.png', fileName: '1.png', mimeType: 'image/png',
      fileSize: 1, status: 'complete', extractedText: '', editedText: '텍스트만 있음',
      notes: [], errorCode: null, reviewed: false,
    }];
    const screen = renderReview(draft);

    expect(screen.getByRole('button', { name: '관계 단계 수정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '만난 경로 수정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '대화 내용 수정' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '캡처 검수하기' })).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: '관계 단계 수정' }));
    fireEvent.press(screen.getByRole('button', { name: '대화 내용 수정' }));
    fireEvent.press(screen.getByRole('button', { name: '캡처 검수하기' }));
    expect(mockPush.mock.calls).toEqual([['/situation'], ['/ocr-review'], ['/ocr-review']]);
  });

  test('이름 기반 대화는 최종 확인 화면에서 내 이름을 바로 입력한다', async () => {
    const draft = validSituationDraft();
    draft.primaryInput = 'text';
    draft.guidedAnswers.inputFocus = 'chat';
    draft.guidedAnswers.freeText = '';
    draft.pastedText = '민수: 안녕\n진하: 반가워';
    draft.selfName = '';
    const screen = renderReview(draft);

    expect(screen.getByRole('button', { name: '분석하기' })).toBeDisabled();
    fireEvent.changeText(screen.getByLabelText('대화 속 내 이름'), '진하');

    await waitFor(() => expect(screen.getByRole('button', { name: '분석하기' })).toBeEnabled());
    expect(latestDraft.selfName).toBe('진하');
    expect(screen.queryByText('이름이 표시된 대화에서는 내 이름을 입력해 주세요.')).toBeNull();
  });

  test('정보 더하기 명령은 기존 초안을 지우지 않고 각 입력 화면으로 이동한다', () => {
    const screen = renderReview();

    fireEvent.press(screen.getByRole('button', { name: '캡처 추가' }));
    fireEvent.press(screen.getByRole('button', { name: '텍스트 추가' }));
    fireEvent.press(screen.getByRole('button', { name: '만남 정보 수정' }));

    expect(mockPush.mock.calls).toEqual([['/capture'], ['/'], ['/situation']]);
    expect(mockResetDraft).not.toHaveBeenCalled();
    expect(latestDraft.guidedAnswers.freeText).toContain('상대가 먼저');
  });

  test('대화 생성 직후 로컬 conversation을 저장하고 같은 값으로 분석한 뒤 결과로 이동한다', async () => {
    const calls: string[] = [];
    mockedClearCachedImages.mockImplementation(() => { calls.push('cache'); });
    mockedCreateConversation.mockImplementation(async () => {
      calls.push('create');
      return conversation as Awaited<ReturnType<typeof createConversation>>;
    });
    mockedStreamAnalysis.mockImplementation(async (snapshot) => {
      calls.push(`stream:${snapshot.id}`);
      return result;
    });
    mockSetResult.mockImplementation(() => { calls.push('result'); });
    mockReplace.mockImplementation(() => { calls.push('replace'); });
    const screen = renderReview();

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
    expect(calls).toEqual(['create', 'stream:conversation-1', 'cache', 'result', 'replace']);
    expect(latestDraft.createdConversation).toEqual(conversation);
    expect(mockedStreamAnalysis).toHaveBeenCalledWith(conversation, expect.any(Function));
  });

  test('분석 완료 뒤 결과를 노출하기 전에 원본 캡처 캐시를 삭제한다', async () => {
    const calls: string[] = [];
    mockedClearCachedImages.mockImplementation(() => { calls.push('cache'); });
    mockSetResult.mockImplementation(() => { calls.push('result'); });
    mockReplace.mockImplementation(() => { calls.push('replace'); });
    const draft = validSituationDraft();
    draft.images = [{
      id: 'image-1', order: 0, uri: 'file://cache/image-1.png', fileName: 'image-1.png',
      mimeType: 'image/png', fileSize: 1, status: 'complete', extractedText: '나: 안녕',
      editedText: '나: 안녕', notes: [], errorCode: null, reviewed: true,
    }];
    const screen = renderReview(draft);

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
    expect(calls).toEqual(['cache', 'result', 'replace']);
  });

  test('원본 캐시 삭제 실패는 성공한 분석 결과에 경고를 남기고 결과로 이동한다', async () => {
    mockedClearCachedImages.mockImplementation(() => { throw new Error('private cache error'); });
    const screen = renderReview();

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
    expect(mockedStreamAnalysis).toHaveBeenCalledTimes(1);
    expect(mockSetResult).toHaveBeenCalledWith(expect.objectContaining({
      warnings: ['원본 캡처 임시 파일을 자동 삭제하지 못했어요. 새 분석을 시작하면 다시 정리합니다.'],
    }));
    expect(screen.queryByRole('button', { name: '분석 다시 시도' })).toBeNull();
  });

  test('분석 실패 뒤 생성된 대화와 입력을 유지하고 분석만 재시도한다', async () => {
    mockedStreamAnalysis
      .mockRejectedValueOnce(new Error('network raw detail'))
      .mockResolvedValueOnce(result);
    const screen = renderReview();

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));
    const retry = await screen.findByRole('button', { name: '분석 다시 시도' });

    expect(screen.queryByText('network raw detail')).toBeNull();
    expect(latestDraft.createdConversation).toEqual(conversation);
    expect(latestDraft.guidedAnswers.freeText).toContain('상대가 먼저');
    fireEvent.press(retry);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);
    expect(mockedStreamAnalysis).toHaveBeenCalledTimes(2);
    expect(mockedStreamAnalysis).toHaveBeenLastCalledWith(conversation, expect.any(Function));
    expect(mockResetDraft).not.toHaveBeenCalled();
  });

  test('Provider에 저장된 conversation이 있으면 생성하지 않고 바로 재시도한다', async () => {
    const draft = validSituationDraft();
    draft.createdConversation = conversation;
    draft.createdConversationFingerprint = analysisInputFingerprint(draft);
    const screen = renderReview(draft);

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
    expect(mockedCreateConversation).not.toHaveBeenCalled();
    expect(mockedStreamAnalysis).toHaveBeenCalledWith(conversation, expect.any(Function));
  });

  test('저장 conversation fingerprint가 현재 입력과 다르면 새 대화를 생성한다', async () => {
    const draft = validSituationDraft();
    draft.createdConversation = conversation;
    draft.createdConversationFingerprint = 'analysis-input-v1:stale';
    const screen = renderReview(draft);

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);
  });

  test('create 대기 중 입력 fingerprint가 바뀌면 snapshot 저장과 stream을 중단한다', async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof createConversation>>) => void;
    mockedCreateConversation.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const screen = renderReview();
    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

    act(() => externalUpdateDraft?.((draft) => ({
      ...draft,
      guidedAnswers: { ...draft.guidedAnswers, freeText: `${draft.guidedAnswers.freeText} 변경` },
    })));
    await act(async () => { resolveCreate(conversation as Awaited<ReturnType<typeof createConversation>>); });

    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(mockedStreamAnalysis).not.toHaveBeenCalled();
    expect(mockSetResult).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  test.each(['resolve', 'reject'] as const)(
    'blur 뒤 create %s는 UI, draft, result, router를 갱신하지 않는다',
    async (settlement) => {
      let resolveCreate!: (value: Awaited<ReturnType<typeof createConversation>>) => void;
      let rejectCreate!: (reason: unknown) => void;
      mockedCreateConversation.mockReturnValue(new Promise((resolve, reject) => {
        resolveCreate = resolve;
        rejectCreate = reject;
      }));
      const screen = renderReview();
      fireEvent.press(screen.getByRole('button', { name: '분석하기' }));

      act(() => { [...mockFocusCleanups].forEach((cleanup) => cleanup()); });
      await act(async () => {
        if (settlement === 'resolve') {
          resolveCreate(conversation as Awaited<ReturnType<typeof createConversation>>);
        } else {
          rejectCreate(new Error('late failure'));
          await Promise.resolve();
        }
      });

      expect(mockUpdateDraft).not.toHaveBeenCalled();
      expect(mockedStreamAnalysis).not.toHaveBeenCalled();
      expect(mockSetResult).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.queryByRole('button', { name: '분석 다시 시도' })).toBeNull();
    },
  );

  test('실행 중 blur 뒤 다시 focus하면 취소된 running 상태를 해제한다', async () => {
    mockedCreateConversation.mockReturnValue(new Promise(() => {}));
    const screen = renderReview();
    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));
    expect(screen.getByRole('button', { name: '분석하기' })).toBeDisabled();

    act(() => { [...mockFocusCleanups].forEach((cleanup) => cleanup()); });
    act(() => {
      [...mockFocusEffects].forEach((effect) => {
        const cleanup = effect();
        if (cleanup) mockFocusCleanups.add(cleanup);
      });
    });

    await waitFor(() => expect(screen.getByRole('button', { name: '분석하기' })).toBeEnabled());
  });

  test('연속 탭으로 분석을 동시에 실행하지 않는다', async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof createConversation>>) => void;
    mockedCreateConversation.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const screen = renderReview();
    const button = screen.getByRole('button', { name: '분석하기' });

    fireEvent.press(button);
    fireEvent.press(button);
    expect(mockedCreateConversation).toHaveBeenCalledTimes(1);

    await act(async () => { resolveCreate(conversation as Awaited<ReturnType<typeof createConversation>>); });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/result'));
  });

  test('SSE 이벤트에 맞춰 진행 문구를 바꾼다', async () => {
    let resolveStream!: (value: AnalysisResult) => void;
    mockedStreamAnalysis.mockImplementation((_snapshot, onProgress) => {
      onProgress?.({
        type: 'rule_complete', signals: [], overallSummary: '', positiveSignalCount: 0,
        ambiguousSignalCount: 0, cautionSignalCount: 0, recommendedAction: '',
        recommendedActionReason: '', confidenceLevel: 'low',
      });
      return new Promise((resolve) => { resolveStream = resolve; });
    });
    const screen = renderReview();

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));
    expect(await screen.findByText('관계 신호를 읽는 중')).toBeTruthy();

    act(() => {
      const progress = mockedStreamAnalysis.mock.calls[0]?.[1];
      progress?.({ type: 'recommendations_ready', recommendations: [], recommendedActionReason: '' });
    });
    expect(screen.getByText('다음 행동을 만드는 중')).toBeTruthy();

    await act(async () => { resolveStream(result); });
  });

  test('unmount 뒤 비동기 완료가 화면 상태나 라우터를 갱신하지 않는다', async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof createConversation>>) => void;
    mockedCreateConversation.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    const screen = renderReview();

    fireEvent.press(screen.getByRole('button', { name: '분석하기' }));
    screen.unmount();
    await act(async () => { resolveCreate(conversation as Awaited<ReturnType<typeof createConversation>>); });

    expect(mockUpdateDraft).not.toHaveBeenCalled();
    expect(mockedStreamAnalysis).not.toHaveBeenCalled();
    expect(mockSetResult).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
