import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractChatFromImage,
  isSupportedImageMimeType,
} from "@/lib/ai/vision/extract-from-image";
import { trackUsage } from "@/lib/ai/token-tracker";

const anthropicMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai/anthropic-client")>();

  return {
    ...actual,
    getAnthropicClient: () => ({
      messages: {
        create: anthropicMocks.create,
      },
    }),
    getModelName: () => "claude-haiku-4-5-20251001",
  };
});

vi.mock("@/lib/ai/token-tracker", () => ({
  trackUsage: vi.fn().mockResolvedValue(undefined),
}));

const FAKE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGP4DwABAQEAG7buVgAAAABJRU5ErkJggg==";

describe("extractChatFromImage", () => {
  beforeEach(() => {
    anthropicMocks.create.mockReset();
    vi.mocked(trackUsage).mockClear();
    vi.stubEnv("ANTHROPIC_RETRY_BASE_DELAY_MS", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns extracted chat text when Claude responds with submit_extracted_chat", async () => {
    anthropicMocks.create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "submit_extracted_chat",
          input: {
            rawText:
              "[오후 8:10] 나: 오늘 잘 들어갔어요?\n[오후 8:13] 상대: 네 덕분에요 :)",
            messageCount: 2,
            notes: "날짜는 11월 15일",
          },
        },
      ],
      usage: { input_tokens: 1500, output_tokens: 80 },
    });

    const result = await extractChatFromImage({
      imageBase64: FAKE_BASE64,
      mimeType: "image/png",
    });

    expect(result.rawText).toContain("[오후 8:10] 나: 오늘 잘 들어갔어요?");
    expect(result.messageCount).toBe(2);
    expect(result.notes).toBe("날짜는 11월 15일");
    expect(trackUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chainStep: "vision_extract",
        success: true,
        inputTokens: 1500,
        outputTokens: 80,
      }),
    );
  });

  it("uses the vision stage timeout budget for Claude requests", async () => {
    vi.stubEnv("ANTHROPIC_VISION_TIMEOUT_MS", "1000");
    anthropicMocks.create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tool-1",
          name: "submit_extracted_chat",
          input: {
            rawText: "나: 안녕하세요\n상대: 네 안녕하세요",
            messageCount: 2,
          },
        },
      ],
      usage: { input_tokens: 1500, output_tokens: 80 },
    });

    await extractChatFromImage({
      imageBase64: FAKE_BASE64,
      mimeType: "image/png",
    });

    const requestOptions = anthropicMocks.create.mock.calls[0]?.[1];
    expect(requestOptions.timeout).toBeGreaterThan(0);
    expect(requestOptions.timeout).toBeLessThanOrEqual(1000);
  });

  it("rejects when the rawText returned by Claude is empty", async () => {
    anthropicMocks.create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tool-2",
          name: "submit_extracted_chat",
          input: {
            rawText: "   \n  \n",
            messageCount: 0,
          },
        },
      ],
      usage: { input_tokens: 1000, output_tokens: 10 },
    });

    await expect(
      extractChatFromImage({
        imageBase64: FAKE_BASE64,
        mimeType: "image/png",
      }),
    ).rejects.toThrow("did not return any extracted text");

    expect(trackUsage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chainStep: "vision_extract",
        success: false,
      }),
    );
  });

  it("falls back messageCount to line count when missing", async () => {
    anthropicMocks.create.mockResolvedValueOnce({
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "tool-3",
          name: "submit_extracted_chat",
          input: {
            rawText: "나: 안녕하세요\n상대: 네 안녕하세요\n나: 오늘 어땠어요?",
            // messageCount 누락
          },
        },
      ],
      usage: { input_tokens: 1200, output_tokens: 50 },
    });

    const result = await extractChatFromImage({
      imageBase64: FAKE_BASE64,
      mimeType: "image/png",
    });

    expect(result.messageCount).toBe(3);
  });

  it("rejects unsupported mime types early", async () => {
    await expect(
      extractChatFromImage({
        imageBase64: FAKE_BASE64,
        mimeType: "image/svg+xml",
      }),
    ).rejects.toThrow("Unsupported image type");

    expect(anthropicMocks.create).not.toHaveBeenCalled();
  });
});

describe("isSupportedImageMimeType", () => {
  it("accepts standard image mime types", () => {
    expect(isSupportedImageMimeType("image/png")).toBe(true);
    expect(isSupportedImageMimeType("image/jpeg")).toBe(true);
    expect(isSupportedImageMimeType("image/webp")).toBe(true);
    expect(isSupportedImageMimeType("image/gif")).toBe(true);
  });

  it("rejects other mime types", () => {
    expect(isSupportedImageMimeType("image/svg+xml")).toBe(false);
    expect(isSupportedImageMimeType("application/pdf")).toBe(false);
    expect(isSupportedImageMimeType("text/plain")).toBe(false);
  });
});
