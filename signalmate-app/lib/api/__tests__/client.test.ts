const mockFetch = jest.fn();
const mockFileUris: string[] = [];

jest.mock('expo/fetch', () => ({
  fetch: (...args: unknown[]) => mockFetch(...args),
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;

    constructor(uri: string) {
      this.uri = uri;
      mockFileUris.push(uri);
    }
  },
}));

import type { AnalysisResult, AnalysisSignal, ConversationSnapshot } from '../../analysis/types';
import {
  ApiError,
  createConversation,
  extractImage,
  reduceAnalysisEvent,
  streamAnalysis,
  type AnalysisStreamEvent,
} from '../client';

const validRequest = {
  title: '모바일 분석',
  sourceType: 'mobile_manual',
  relationshipStage: 'before_meeting',
  meetingChannel: 'blind_date',
  userGoal: 'continue_chat',
  saveMode: 'temporary',
  rawText: '나: 안녕\n상대: 안녕',
};

const conversation: ConversationSnapshot = {
  id: 'conv-1',
  rawText: '나: 안녕\n상대: 안녕',
  situationContext: null,
  relationshipStage: 'before_meeting',
  meetingChannel: 'blind_date',
  userGoal: 'continue_chat',
  messages: [
    { senderRole: 'self', messageText: '안녕', sentAt: null, sequenceNo: 1 },
    { senderRole: 'other', messageText: '안녕', sentAt: null, sequenceNo: 2 },
  ],
};

function signal(id: string, title = '답장이 이어져요'): AnalysisSignal {
  return {
    id,
    signalType: 'positive',
    signalKey: `signal-${id}`,
    title,
    description: '상대가 대화를 이어가고 있어요.',
    evidenceText: '상대: 안녕',
    confidenceLevel: 'medium',
    displayOrder: 1,
  };
}

const recommendation = {
  id: 'rec-1',
  recommendationType: 'next_message' as const,
  title: '가볍게 이어가기',
  content: '오늘 하루 어땠어요?',
  rationale: '부담이 적은 질문이에요.',
  toneLabel: '가벼운 톤',
  displayOrder: 1,
};

function emptyResult(): AnalysisResult {
  return {
    analysisId: '',
    overallSummary: '',
    signals: [],
    recommendations: [],
    recommendedAction: '',
    recommendedActionReason: '',
    confidenceLevel: 'low',
    warnings: [],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function streamResponse(parts: Uint8Array[], status = 200): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }), {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function encodeFrames(...events: AnalysisStreamEvent[]): Uint8Array {
  return new TextEncoder().encode(events.map((event) => (
    `event: progress\ndata: ${JSON.stringify(event)}\n\n`
  )).join(''));
}

describe('validated API envelopes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFileUris.length = 0;
  });

  test('이미지 추출 성공 응답을 반환한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {
      success: true,
      data: { rawText: '나: 안녕\n상대: 안녕', messageCount: 2, notes: ['발신자 확인 필요'] },
      error: null,
    }));

    await expect(extractImage('file://cache/chat.png')).resolves.toEqual({
      rawText: '나: 안녕\n상대: 안녕',
      messageCount: 2,
      notes: ['발신자 확인 필요'],
    });
    expect(mockFileUris).toEqual(['file://cache/chat.png']);
  });

  test('대화 생성 성공 응답에서 data.conversation을 반환한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse(201, {
      success: true,
      data: {
        conversation: {
          ...conversation,
          saveMode: 'temporary',
          messageCount: conversation.messages.length,
        },
      },
      error: null,
    }));

    await expect(createConversation(validRequest)).resolves.toMatchObject(conversation);
  });

  test('success가 true여도 conversation이 없으면 응답 오류를 던진다', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, {
      success: true,
      data: {},
      error: null,
    }));

    await expect(createConversation(validRequest)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });

  test('JSON null envelope를 응답 형식 오류로 변환한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse(200, null));

    await expect(createConversation(validRequest)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INVALID_RESPONSE',
      status: 200,
    });
  });

  test('실패 envelope의 서버 오류 코드와 상태를 보존한다', async () => {
    mockFetch.mockResolvedValue(jsonResponse(400, {
      success: false,
      data: null,
      error: { code: 'VALIDATION_ERROR', message: '입력을 확인해 주세요.' },
    }));

    await expect(createConversation(validRequest)).rejects.toEqual(
      new ApiError('VALIDATION_ERROR', '입력을 확인해 주세요.', 400),
    );
  });
});

describe('analysis event reduction', () => {
  test('rule_complete 결과를 초기 분석 결과에 반영한다', () => {
    const event: AnalysisStreamEvent = {
      type: 'rule_complete',
      signals: [signal('rule')],
      overallSummary: '규칙 분석 요약',
      positiveSignalCount: 1,
      ambiguousSignalCount: 0,
      cautionSignalCount: 0,
      recommendedAction: 'keep_light',
      recommendedActionReason: '가볍게 이어가세요.',
      confidenceLevel: 'medium',
    };

    expect(reduceAnalysisEvent(emptyResult(), event)).toMatchObject({
      signals: [signal('rule')],
      overallSummary: '규칙 분석 요약',
      recommendedAction: 'keep_light',
      recommendedActionReason: '가볍게 이어가세요.',
      confidenceLevel: 'medium',
    });
  });

  test('signals_enhanced가 기존 시그널과 요약을 교체한다', () => {
    const current = reduceAnalysisEvent(emptyResult(), {
      type: 'rule_complete',
      signals: [signal('rule')],
      overallSummary: '규칙 분석 요약',
      positiveSignalCount: 1,
      ambiguousSignalCount: 0,
      cautionSignalCount: 0,
      recommendedAction: 'keep_light',
      recommendedActionReason: '가볍게 이어가세요.',
      confidenceLevel: 'medium',
    });

    expect(reduceAnalysisEvent(current, {
      type: 'signals_enhanced',
      signals: [signal('enhanced', '보강된 시그널')],
      overallSummary: '보강된 요약',
    })).toMatchObject({
      signals: [signal('enhanced', '보강된 시그널')],
      overallSummary: '보강된 요약',
    });
  });

  test('recommendations_ready가 추천과 추천 이유를 반영한다', () => {
    expect(reduceAnalysisEvent(emptyResult(), {
      type: 'recommendations_ready',
      recommendations: [recommendation],
      recommendedActionReason: '이 문장이 현재 흐름에 맞아요.',
    })).toMatchObject({
      recommendations: [recommendation],
      recommendedActionReason: '이 문장이 현재 흐름에 맞아요.',
    });
  });

  test('stage_warning을 기존 경고 뒤에 누적한다', () => {
    const current = { ...emptyResult(), warnings: ['첫 번째 경고'] };

    expect(reduceAnalysisEvent(current, {
      type: 'stage_warning',
      stage: 'signal_enhancer',
      message: '기본 분석 결과로 이어갑니다.',
    }).warnings).toEqual(['첫 번째 경고', '기본 분석 결과로 이어갑니다.']);
  });
});

describe('streamAnalysis', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  test('검증된 progress 이벤트를 알리고 complete 결과를 반환한다', async () => {
    const events: AnalysisStreamEvent[] = [
      {
        type: 'rule_complete',
        signals: [signal('rule')],
        overallSummary: '규칙 분석 요약',
        positiveSignalCount: 1,
        ambiguousSignalCount: 0,
        cautionSignalCount: 0,
        recommendedAction: 'keep_light',
        recommendedActionReason: '가볍게 이어가세요.',
        confidenceLevel: 'medium',
      },
      {
        type: 'signals_enhanced',
        signals: [signal('enhanced')],
        overallSummary: '보강된 요약',
      },
      {
        type: 'recommendations_ready',
        recommendations: [recommendation],
        recommendedActionReason: '이 문장이 현재 흐름에 맞아요.',
      },
      {
        type: 'stage_warning',
        stage: 'quality_gate',
        message: '기본 추천으로 이어갑니다.',
      },
      { type: 'complete', analysisId: 'analysis-1', modelName: 'hybrid-v1' },
    ];
    mockFetch.mockResolvedValue(streamResponse([encodeFrames(...events)]));
    const progress: AnalysisStreamEvent[] = [];

    await expect(streamAnalysis(conversation, (event) => progress.push(event))).resolves.toEqual({
      analysisId: 'analysis-1',
      overallSummary: '보강된 요약',
      signals: [signal('enhanced')],
      recommendations: [recommendation],
      recommendedAction: 'keep_light',
      recommendedActionReason: '이 문장이 현재 흐름에 맞아요.',
      confidenceLevel: 'medium',
      warnings: ['기본 추천으로 이어갑니다.'],
    });
    expect(progress).toEqual(events);
  });

  test('UTF-8 문자가 바이트 청크 중간에서 갈려도 한글 결과를 복원한다', async () => {
    const bytes = encodeFrames(
      {
        type: 'rule_complete',
        signals: [signal('utf8')],
        overallSummary: '안녕하세요',
        positiveSignalCount: 1,
        ambiguousSignalCount: 0,
        cautionSignalCount: 0,
        recommendedAction: 'keep_light',
        recommendedActionReason: '천천히 이어가세요.',
        confidenceLevel: 'high',
      },
      { type: 'complete', analysisId: 'analysis-utf8', modelName: 'hybrid-v1' },
    );
    const firstMultibyte = bytes.findIndex((byte) => byte > 0x7f);
    mockFetch.mockResolvedValue(streamResponse([
      bytes.slice(0, firstMultibyte + 1),
      bytes.slice(firstMultibyte + 1),
    ]));

    await expect(streamAnalysis(conversation)).resolves.toMatchObject({
      analysisId: 'analysis-utf8',
      overallSummary: '안녕하세요',
      recommendedActionReason: '천천히 이어가세요.',
    });
  });

  test('error 프레임을 분석 실패 ApiError로 변환한다', async () => {
    const bytes = new TextEncoder().encode(
      'event: error\ndata: {"message":"분석 중 문제가 발생했습니다."}\n\n',
    );
    mockFetch.mockResolvedValue(streamResponse([bytes]));

    await expect(streamAnalysis(conversation)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'ANALYSIS_FAILED',
      message: '분석 중 문제가 발생했습니다.',
      status: 502,
    });
  });

  test('complete 프레임 없이 닫힌 스트림을 거부한다', async () => {
    mockFetch.mockResolvedValue(streamResponse([encodeFrames({
      type: 'stage_warning',
      stage: 'agent',
      message: '하이브리드 분석으로 이어갑니다.',
    })]));

    await expect(streamAnalysis(conversation)).rejects.toMatchObject({
      name: 'ApiError',
      code: 'INCOMPLETE_STREAM',
      status: 502,
    });
  });

  test('형식이 잘못된 progress 이벤트는 callback과 결과에서 제외한다', async () => {
    const invalid = new TextEncoder().encode(
      'event: progress\ndata: {"type":"stage_warning","message":3}\n\n',
    );
    const complete: AnalysisStreamEvent = {
      type: 'complete', analysisId: 'analysis-valid', modelName: 'hybrid-v1',
    };
    mockFetch.mockResolvedValue(streamResponse([invalid, encodeFrames(complete)]));
    const progress: AnalysisStreamEvent[] = [];

    await expect(streamAnalysis(conversation, (event) => progress.push(event))).resolves.toMatchObject({
      analysisId: 'analysis-valid',
      warnings: [],
    });
    expect(progress).toEqual([complete]);
  });
});
