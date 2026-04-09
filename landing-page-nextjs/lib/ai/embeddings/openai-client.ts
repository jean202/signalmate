import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as {
  openai: OpenAI | undefined;
};

function createClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  return new OpenAI({ apiKey });
}

export function getOpenAIClient(): OpenAI {
  if (!globalForOpenAI.openai) {
    globalForOpenAI.openai = createClient();
  }
  return globalForOpenAI.openai;
}

export function isOpenAIAvailable(): boolean {
  return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.length > 0;
}

/** text-embedding-3-small: 1536차원, $0.02/1M tokens */
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
