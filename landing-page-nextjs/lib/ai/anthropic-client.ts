import Anthropic from "@anthropic-ai/sdk";

const globalForAnthropic = globalThis as unknown as {
  anthropic: Anthropic | undefined;
};

function createClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }

  return new Anthropic({ apiKey });
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
  return process.env.NODE_ENV === "production"
    ? "claude-sonnet-4-6"
    : "claude-haiku-4-5-20251001";
}
