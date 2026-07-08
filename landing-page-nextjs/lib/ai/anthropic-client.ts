import Anthropic from "@anthropic-ai/sdk";
import type {
  Message,
  MessageParam,
  ThinkingConfigParam,
} from "@anthropic-ai/sdk/resources/messages";
import { createLogger } from "@/lib/logger";

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

const logger = createLogger("ai.anthropic_client");

function createClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  // SDK는 기본적으로 429/5xx 에러를 max_retries=2로 자동 재시도합니다.
  // 운영 환경 안정성을 위해 5로 늘립니다 (지수 backoff).
  return new Anthropic({
    apiKey,
    maxRetries: 5,
    // 최대 타임아웃: 분석 한 단계당 60초. SSE 스트리밍이라 충분.
    timeout: 60_000,
  });
}

export function getAnthropicClient(): Anthropic {
  if (!globalForAnthropic.anthropic) {
    globalForAnthropic.anthropic = createClient();
  }
  return globalForAnthropic.anthropic;
}

export function isAnthropicAvailable(): boolean {
  return typeof process.env.ANTHROPIC_API_KEY === "string" && process.env.ANTHROPIC_API_KEY.length > 0;
}

/** 개발 시 Haiku 4.5 (가성비), 프로덕션 시 Sonnet 4.6 */
export function getModelName(): string {
  const configuredModel = process.env.ANTHROPIC_MODEL?.trim();
  if (configuredModel) return configuredModel;

  return process.env.NODE_ENV === "production"
    ? "claude-sonnet-4-6"
    : "claude-haiku-4-5-20251001";
}

/**
 * 모델이 adaptive thinking을 지원하는지 확인합니다.
 * Sonnet 4.6+ / Opus 4.6+ 만 지원. Haiku 4.5는 미지원.
 */
export function supportsAdaptiveThinking(model?: string): boolean {
  const m = model ?? getModelName();
  return m.includes("sonnet-4-6") || m.includes("opus-4-6") || m.includes("opus-4-7");
}

/**
 * 모델별 prompt cache 가능한 최소 prefix 토큰 수.
 * - Haiku 4.5: 4096
 * - Sonnet 4.6: 2048
 * - 그 외: 보수적으로 4096
 *
 * 시스템 프롬프트 + few-shot 합산이 이 미만이면 캐시는 silently skip 됩니다 (에러 X).
 */
export function getMinCacheableTokens(model?: string): number {
  const m = model ?? getModelName();
  if (m.includes("sonnet-4-6")) return 2048;
  if (m.includes("haiku-4-5")) return 4096;
  return 4096;
}

type InferenceStage =
  | "signal_enhancer"
  | "recommendation_generator"
  | "deep_report"
  | "agent_iteration";

const DEFAULT_STAGE_TIMEOUT_MS: Record<InferenceStage, number> = {
  signal_enhancer: 20_000,
  recommendation_generator: 25_000,
  deep_report: 35_000,
  agent_iteration: 8_000,
};

const STAGE_TIMEOUT_ENV: Record<InferenceStage, string> = {
  signal_enhancer: "ANTHROPIC_SIGNAL_TIMEOUT_MS",
  recommendation_generator: "ANTHROPIC_RECOMMENDATION_TIMEOUT_MS",
  deep_report: "ANTHROPIC_DEEP_REPORT_TIMEOUT_MS",
  agent_iteration: "ANTHROPIC_AGENT_ITERATION_TIMEOUT_MS",
};

const STAGE_THINKING_ENV: Record<InferenceStage, string> = {
  signal_enhancer: "ANTHROPIC_THINKING_SIGNAL_ENHANCER",
  recommendation_generator: "ANTHROPIC_THINKING_RECOMMENDATION",
  deep_report: "ANTHROPIC_THINKING_DEEP_REPORT",
  agent_iteration: "ANTHROPIC_THINKING_AGENT",
};

// recommendation_generator: 핵심 추론 단계 — thinking으로 품질 ↑.
// agent_iteration: 도구 선택을 모델이 직접 결정 — thinking 효과 가장 큼.
// signal_enhancer: 첫 결과 표시 속도가 중요 — thinking 끔 (env로 켤 수 있음).
const STAGE_DEFAULT_THINKING: Record<InferenceStage, string> = {
  signal_enhancer: "off",
  recommendation_generator: "enabled",
  deep_report: "enabled",
  agent_iteration: "enabled",
};

const STAGE_THINKING_BUDGET_TOKENS: Record<InferenceStage, number> = {
  signal_enhancer: 1024,
  recommendation_generator: 2048,
  deep_report: 2048,
  agent_iteration: 1024,
};

export function getInferenceTimeoutMs(stage: InferenceStage): number {
  return readPositiveIntEnv(STAGE_TIMEOUT_ENV[stage], DEFAULT_STAGE_TIMEOUT_MS[stage]);
}

export function buildInferenceOptions(
  model = getModelName(),
  stage?: InferenceStage,
): {
  temperature?: number;
  thinking?: ThinkingConfigParam;
} {
  const thinkingMode = resolveThinkingMode(stage);

  if (!thinkingMode || thinkingMode === "false" || thinkingMode === "off") {
    return { temperature: 0.2 };
  }

  if (!supportsAdaptiveThinking(model)) {
    return { temperature: 0.2 };
  }

  if (thinkingMode === "enabled") {
    const budget_tokens = stage
      ? STAGE_THINKING_BUDGET_TOKENS[stage]
      : 1024;
    return {
      thinking: {
        type: "enabled",
        budget_tokens,
        display: "omitted",
      },
    };
  }

  return {
    thinking: {
      type: "adaptive",
      display: "omitted",
    },
  };
}

function resolveThinkingMode(stage?: InferenceStage): string {
  // 우선순위: stage별 env > 전역 env > stage default > "off"
  const stageEnv = stage
    ? process.env[STAGE_THINKING_ENV[stage]]?.trim().toLowerCase()
    : undefined;
  if (stageEnv) return stageEnv;

  const globalEnv = (
    process.env.ANTHROPIC_THINKING_MODE ??
    process.env.ANTHROPIC_ENABLE_THINKING ??
    ""
  )
    .trim()
    .toLowerCase();
  if (globalEnv) return globalEnv;

  return stage ? STAGE_DEFAULT_THINKING[stage] : "off";
}

/**
 * 추론에 thinking을 사용할 때, max_tokens는 thinking budget 위에 응답 토큰을
 * 합산해야 합니다 (Anthropic API 요구사항).
 *
 * - thinking 비활성: baseMaxTokens 그대로
 * - thinking 활성: baseMaxTokens + budget_tokens (+ 마진 256)
 */
export function resolveMaxTokens(
  baseMaxTokens: number,
  stage: InferenceStage,
  model = getModelName(),
): number {
  const options = buildInferenceOptions(model, stage);
  if (!options.thinking) return baseMaxTokens;

  const budget =
    options.thinking.type === "enabled"
      ? options.thinking.budget_tokens
      : STAGE_THINKING_BUDGET_TOKENS[stage];
  return baseMaxTokens + budget + 256;
}

export function withEphemeralCacheBreakpoint(message: MessageParam): MessageParam {
  const cache_control = { type: "ephemeral" as const };

  if (typeof message.content === "string") {
    return {
      ...message,
      content: [
        {
          type: "text",
          text: message.content,
          cache_control,
        },
      ],
    };
  }

  if (!Array.isArray(message.content) || message.content.length === 0) {
    return message;
  }

  const lastBlockIndex = message.content.length - 1;
  return {
    ...message,
    content: message.content.map((block, index) =>
      index === lastBlockIndex && typeof block === "object" && block !== null
        ? ({ ...block, cache_control } as typeof block)
        : block,
    ),
  };
}

export function withEphemeralCacheOnLastMessage(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return messages;

  return messages.map((message, index) =>
    index === messages.length - 1 ? withEphemeralCacheBreakpoint(message) : message,
  );
}

export class RetryableLLMResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableLLMResponseError";
  }
}

export class NonRetryableLLMResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableLLMResponseError";
  }
}

export function extractToolInput<T>(
  response: Message,
  toolName: string,
  label: string,
): T {
  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use" && block.name === toolName,
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new RetryableLLMResponseError(
      `Claude did not return ${toolName} for ${label}. ` +
        `stop_reason=${response.stop_reason}, content_types=${response.content.map((b) => b.type).join(",")}`,
    );
  }

  return toolUseBlock.input as T;
}

type RetryOptions = {
  /** 추가 재시도 횟수 (SDK 자동 재시도 외 추가). 기본 1회. */
  extraRetries?: number;
  /** 어느 단계인지 로깅용. */
  label?: string;
  /** 전체 단계 시간 예산. 재시도를 포함한 총 wall-clock 제한. */
  timeoutMs?: number;
  /** SDK 내부 재시도 횟수. 단계 예산을 지키기 위해 기본값은 0. */
  sdkMaxRetries?: number;
  /** 테스트/운영 튜닝용 재시도 backoff 시작값. */
  retryBaseDelayMs?: number;
  /** 실제 재시도가 예약될 때 호출됩니다. */
  onRetry?: (info: { retryCount: number; delayMs: number; error: unknown }) => void;
};

/**
 * Anthropic API 호출 + tool_use 응답 검증 wrapper.
 *
 * SDK가 이미 429/5xx를 자동 재시도하지만, tool_use block 누락처럼
 * SDK가 알 수 없는 응답 형식 오류는 호출자가 RetryableLLMResponseError로
 * 던지면 여기서 한 번 더 재시도합니다.
 */
export async function callWithRetry<T>(
  fn: (requestOptions: Anthropic.RequestOptions) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.extraRetries ?? 1;
  const label = options.label ?? "anthropic";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retryBaseDelayMs =
    options.retryBaseDelayMs ?? readPositiveIntEnv("ANTHROPIC_RETRY_BASE_DELAY_MS", 500);
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw lastError ?? new Error(`[${label}] timed out after ${timeoutMs}ms`);
    }

    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), remainingMs);

    try {
      return await fn({
        maxRetries: options.sdkMaxRetries ?? 0,
        timeout: remainingMs,
        signal: abortController.signal,
      });
    } catch (error) {
      lastError = abortController.signal.aborted
        ? new Error(`[${label}] timed out after ${timeoutMs}ms`)
        : error;

      // 4xx (BadRequest, Auth, NotFound 등) 클라이언트 에러는 재시도해도 동일하게 실패하므로 중단.
      if (
        error instanceof NonRetryableLLMResponseError ||
        error instanceof Anthropic.BadRequestError ||
        error instanceof Anthropic.AuthenticationError ||
        error instanceof Anthropic.PermissionDeniedError ||
        error instanceof Anthropic.NotFoundError
      ) {
        throw error;
      }

      const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
      logger.warn("attempt_failed", {
        label,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        errorMessage: errorMsg,
      });

      if (attempt < maxRetries) {
        // 지수 backoff: 500ms → 1s → 2s ...
        const remainingAfterFailure = deadline - Date.now();
        const delay = Math.min(retryBaseDelayMs * Math.pow(2, attempt), remainingAfterFailure);
        if (delay <= 0) {
          throw lastError;
        }
        options.onRetry?.({
          retryCount: attempt + 1,
          delayMs: delay,
          error: lastError,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
