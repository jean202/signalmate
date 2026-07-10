import { fetch } from 'expo/fetch';
import { File } from 'expo-file-system';

import type {
  AnalysisRecommendation,
  AnalysisResult,
  AnalysisSignal,
  ConversationSnapshot,
} from '../analysis/types';
import { SseDecoder, type SseFrame } from './sse';

const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL
  ?? 'https://landing-page-nextjs-rust-six.vercel.app/api/v1'
).replace(/\/$/, '');

type ConfidenceLevel = AnalysisResult['confidenceLevel'];

export type AnalysisStreamEvent =
  | {
      type: 'rule_complete';
      signals: AnalysisSignal[];
      overallSummary: string;
      positiveSignalCount: number;
      ambiguousSignalCount: number;
      cautionSignalCount: number;
      recommendedAction: string;
      recommendedActionReason: string;
      confidenceLevel: ConfidenceLevel;
    }
  | {
      type: 'signals_enhanced';
      signals: AnalysisSignal[];
      overallSummary: string;
    }
  | {
      type: 'recommendations_ready';
      recommendations: AnalysisRecommendation[];
      recommendedActionReason: string;
    }
  | {
      type: 'stage_warning';
      stage: string;
      message: string;
    }
  | {
      type: 'complete';
      analysisId: string;
      modelName: string;
    };

export type AnalysisProgressCallback = (event: AnalysisStreamEvent) => void;

export type ExtractedImage = {
  rawText: string;
  messageCount: number;
  notes: string[];
};

export type CreatedConversation = ConversationSnapshot & {
  saveMode: 'temporary' | 'saved';
  messageCount: number;
};

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiEnvelope = {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isSignal(value: unknown): value is AnalysisSignal {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.signalType === 'positive'
      || value.signalType === 'ambiguous'
      || value.signalType === 'caution')
    && typeof value.signalKey === 'string'
    && typeof value.title === 'string'
    && typeof value.description === 'string'
    && typeof value.evidenceText === 'string'
    && isConfidenceLevel(value.confidenceLevel)
    && typeof value.displayOrder === 'number'
    && Number.isFinite(value.displayOrder);
}

function isSignalArray(value: unknown): value is AnalysisSignal[] {
  return Array.isArray(value) && value.every(isSignal);
}

function isRecommendation(value: unknown): value is AnalysisRecommendation {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && (value.recommendationType === 'next_message'
      || value.recommendationType === 'tone_guide'
      || value.recommendationType === 'avoid_phrase')
    && typeof value.title === 'string'
    && typeof value.content === 'string'
    && typeof value.rationale === 'string'
    && (value.toneLabel === null || typeof value.toneLabel === 'string')
    && typeof value.displayOrder === 'number'
    && Number.isFinite(value.displayOrder);
}

function isRecommendationArray(value: unknown): value is AnalysisRecommendation[] {
  return Array.isArray(value) && value.every(isRecommendation);
}

function parseAnalysisStreamEvent(value: unknown): AnalysisStreamEvent | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;

  switch (value.type) {
    case 'rule_complete':
      return isSignalArray(value.signals)
        && typeof value.overallSummary === 'string'
        && isCount(value.positiveSignalCount)
        && isCount(value.ambiguousSignalCount)
        && isCount(value.cautionSignalCount)
        && typeof value.recommendedAction === 'string'
        && typeof value.recommendedActionReason === 'string'
        && isConfidenceLevel(value.confidenceLevel)
        ? {
            type: value.type,
            signals: value.signals,
            overallSummary: value.overallSummary,
            positiveSignalCount: value.positiveSignalCount,
            ambiguousSignalCount: value.ambiguousSignalCount,
            cautionSignalCount: value.cautionSignalCount,
            recommendedAction: value.recommendedAction,
            recommendedActionReason: value.recommendedActionReason,
            confidenceLevel: value.confidenceLevel,
          }
        : null;
    case 'signals_enhanced':
      return isSignalArray(value.signals) && typeof value.overallSummary === 'string'
        ? {
            type: value.type,
            signals: value.signals,
            overallSummary: value.overallSummary,
          }
        : null;
    case 'recommendations_ready':
      return isRecommendationArray(value.recommendations)
        && typeof value.recommendedActionReason === 'string'
        ? {
            type: value.type,
            recommendations: value.recommendations,
            recommendedActionReason: value.recommendedActionReason,
          }
        : null;
    case 'stage_warning':
      return typeof value.stage === 'string' && typeof value.message === 'string'
        ? { type: value.type, stage: value.stage, message: value.message }
        : null;
    case 'complete':
      return typeof value.analysisId === 'string' && typeof value.modelName === 'string'
        ? { type: value.type, analysisId: value.analysisId, modelName: value.modelName }
        : null;
    default:
      return null;
  }
}

function isConversationMessage(value: unknown): value is ConversationSnapshot['messages'][number] {
  if (!isRecord(value)) return false;
  return (value.senderRole === 'self'
      || value.senderRole === 'other'
      || value.senderRole === 'unknown')
    && typeof value.messageText === 'string'
    && (value.sentAt === null || typeof value.sentAt === 'string')
    && typeof value.sequenceNo === 'number'
    && Number.isInteger(value.sequenceNo);
}

function isConversation(value: unknown): value is CreatedConversation {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.rawText === 'string'
    && (value.situationContext === null || typeof value.situationContext === 'string')
    && typeof value.relationshipStage === 'string'
    && typeof value.meetingChannel === 'string'
    && typeof value.userGoal === 'string'
    && (value.saveMode === 'temporary' || value.saveMode === 'saved')
    && isCount(value.messageCount)
    && Array.isArray(value.messages)
    && value.messages.every(isConversationMessage)
    && value.messageCount === value.messages.length;
}

async function readEnvelope<T>(
  response: Response,
  pick: (data: unknown) => T | null,
): Promise<T> {
  let parsedBody: unknown;

  try {
    parsedBody = await response.json() as unknown;
  } catch {
    throw new ApiError(
      'INVALID_RESPONSE',
      '서버 응답 형식을 확인하지 못했어요.',
      response.status,
    );
  }

  if (!isRecord(parsedBody)) {
    throw new ApiError(
      'INVALID_RESPONSE',
      '서버 응답 형식을 확인하지 못했어요.',
      response.status,
    );
  }
  const body = parsedBody as ApiEnvelope;

  if (!response.ok || body.success !== true) {
    throw new ApiError(
      body.error?.code ?? 'HTTP_ERROR',
      body.error?.message ?? '요청에 실패했어요.',
      response.status,
    );
  }

  if (body.error !== null) {
    throw new ApiError(
      'INVALID_RESPONSE',
      '서버 응답 형식을 확인하지 못했어요.',
      response.status,
    );
  }

  const value = pick(body.data);
  if (value === null) {
    throw new ApiError(
      'INVALID_RESPONSE',
      '서버 응답 형식을 확인하지 못했어요.',
      response.status,
    );
  }
  return value;
}

export async function extractImage(uri: string): Promise<ExtractedImage> {
  const form = new FormData();
  form.append('image', new File(uri));
  const response = await fetch(`${API_BASE_URL}/conversations/extract-from-image`, {
    method: 'POST',
    body: form,
  });

  return readEnvelope(response, (data) => {
    if (!isRecord(data)
      || typeof data.rawText !== 'string'
      || typeof data.messageCount !== 'number'
      || !Number.isFinite(data.messageCount)
      || !isStringArray(data.notes)) {
      return null;
    }
    return {
      rawText: data.rawText,
      messageCount: data.messageCount,
      notes: data.notes,
    };
  });
}

export async function createConversation(request: unknown): Promise<CreatedConversation> {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  return readEnvelope(response, (data) => {
    if (!isRecord(data) || !isConversation(data.conversation)) return null;
    return data.conversation;
  });
}

export function reduceAnalysisEvent(
  result: AnalysisResult,
  event: AnalysisStreamEvent,
): AnalysisResult {
  switch (event.type) {
    case 'rule_complete':
      return {
        ...result,
        signals: event.signals,
        overallSummary: event.overallSummary,
        recommendedAction: event.recommendedAction,
        recommendedActionReason: event.recommendedActionReason,
        confidenceLevel: event.confidenceLevel,
      };
    case 'signals_enhanced':
      return {
        ...result,
        signals: event.signals,
        overallSummary: event.overallSummary,
      };
    case 'recommendations_ready':
      return {
        ...result,
        recommendations: event.recommendations,
        recommendedActionReason: event.recommendedActionReason,
      };
    case 'stage_warning':
      return { ...result, warnings: [...result.warnings, event.message] };
    case 'complete':
      return { ...result, analysisId: event.analysisId };
  }
}

function emptyAnalysisResult(): AnalysisResult {
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

function analysisErrorFromFrame(frame: SseFrame): ApiError | null {
  if (frame.event !== 'error') return null;
  const message = isRecord(frame.data) && typeof frame.data.message === 'string'
    ? frame.data.message
    : '분석에 실패했어요.';
  return new ApiError('ANALYSIS_FAILED', message, 502);
}

export async function streamAnalysis(
  conversation: CreatedConversation,
  onProgress?: AnalysisProgressCallback,
): Promise<AnalysisResult> {
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversation.id}/analyses/stream`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        conversationInline: {
          rawText: conversation.rawText,
          relationshipStage: conversation.relationshipStage,
          meetingChannel: conversation.meetingChannel,
          userGoal: conversation.userGoal,
          situationContext: conversation.situationContext,
          messages: conversation.messages,
        },
      }),
    },
  );

  if (!response.ok || !response.body) {
    throw new ApiError(
      'STREAM_UNAVAILABLE',
      '분석 연결을 시작하지 못했어요.',
      response.status,
    );
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const sseDecoder = new SseDecoder();
  let result = emptyAnalysisResult();
  let complete = false;
  let ruleComplete = false;
  let streamFinished = false;

  const incompleteStreamError = () => new ApiError(
    'INCOMPLETE_STREAM',
    '분석 연결이 완료되기 전에 끊겼어요.',
    502,
  );

  const consumeFrames = (frames: SseFrame[]) => {
    for (const frame of frames) {
      const analysisError = analysisErrorFromFrame(frame);
      if (analysisError) throw analysisError;
      if (frame.event !== 'progress') continue;

      const event = parseAnalysisStreamEvent(frame.data);
      if (!event) continue;
      if (event.type === 'complete' && !ruleComplete) throw incompleteStreamError();
      onProgress?.(event);
      result = reduceAnalysisEvent(result, event);
      if (event.type === 'rule_complete') ruleComplete = true;
      if (event.type === 'complete') complete = true;
    }
  };

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        streamFinished = true;
        break;
      }
      consumeFrames(sseDecoder.push(textDecoder.decode(next.value, { stream: true })));
    }

    const trailingText = textDecoder.decode();
    if (trailingText) consumeFrames(sseDecoder.push(trailingText));

    if (!complete || !ruleComplete) throw incompleteStreamError();
    return result;
  } catch (error) {
    if (!streamFinished) {
      try {
        await reader.cancel(error);
      } catch {
        // Preserve the analysis error when stream cancellation also fails.
      }
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
