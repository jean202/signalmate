import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../extract-from-image/route";

const visionMocks = vi.hoisted(() => ({
  isAnthropicAvailable: vi.fn(),
  extractChatFromImage: vi.fn(),
  isSupportedImageMimeType: vi.fn(),
}));

vi.mock("@/lib/ai/anthropic-client", () => ({
  isAnthropicAvailable: visionMocks.isAnthropicAvailable,
}));

vi.mock("@/lib/ai/vision/extract-from-image", () => ({
  extractChatFromImage: visionMocks.extractChatFromImage,
  isSupportedImageMimeType: visionMocks.isSupportedImageMimeType,
}));

type ApiErrorEnvelope = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
};

type ApiSuccessEnvelope<T> = {
  success: true;
  data: T;
  error: null;
};

async function readError(response: Response): Promise<ApiErrorEnvelope> {
  return (await response.json()) as ApiErrorEnvelope;
}

async function readSuccess<T>(response: Response): Promise<ApiSuccessEnvelope<T>> {
  return (await response.json()) as ApiSuccessEnvelope<T>;
}

function jsonRequest(body: unknown, contentType = "application/json"): Request {
  return new Request("http://localhost/api/v1/conversations/extract-from-image", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function multipartRequest(file: File): Request {
  const formData = new FormData();
  formData.append("image", file);

  return new Request("http://localhost/api/v1/conversations/extract-from-image", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/v1/conversations/extract-from-image", () => {
  beforeEach(() => {
    visionMocks.isAnthropicAvailable.mockReset();
    visionMocks.extractChatFromImage.mockReset();
    visionMocks.isSupportedImageMimeType.mockReset();

    visionMocks.isAnthropicAvailable.mockReturnValue(true);
    visionMocks.isSupportedImageMimeType.mockImplementation((mimeType: string) =>
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mimeType),
    );
  });

  it("returns extracted chat text for a valid JSON image payload", async () => {
    visionMocks.extractChatFromImage.mockResolvedValueOnce({
      rawText: "[오후 8:10] 나: 오늘 잘 들어갔어요?\n[오후 8:13] 상대: 네!",
      messageCount: 2,
      notes: "카카오톡 캡처",
    });

    const response = await POST(
      jsonRequest({
        imageBase64: "base64-image",
        mimeType: "image/png",
      }),
    );
    const payload = await readSuccess<{
      rawText: string;
      messageCount: number;
      notes?: string;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      success: true,
      data: {
        rawText: "[오후 8:10] 나: 오늘 잘 들어갔어요?\n[오후 8:13] 상대: 네!",
        messageCount: 2,
        notes: "카카오톡 캡처",
      },
      error: null,
    });
    expect(visionMocks.extractChatFromImage).toHaveBeenCalledWith({
      imageBase64: "base64-image",
      mimeType: "image/png",
    });
  });

  it("accepts a multipart image upload and sends base64 to Vision", async () => {
    visionMocks.extractChatFromImage.mockResolvedValueOnce({
      rawText: "나: 안녕\n상대: 안녕하세요",
      messageCount: 2,
    });

    const response = await POST(
      multipartRequest(new File(["hello-image"], "capture.png", { type: "image/png" })),
    );
    const payload = await readSuccess<{
      rawText: string;
      messageCount: number;
    }>(response);

    expect(response.status).toBe(200);
    expect(payload.data.messageCount).toBe(2);
    expect(visionMocks.extractChatFromImage).toHaveBeenCalledWith({
      imageBase64: Buffer.from("hello-image").toString("base64"),
      mimeType: "image/png",
    });
  });

  it("returns 503 when Claude Vision is not configured", async () => {
    visionMocks.isAnthropicAvailable.mockReturnValue(false);

    const response = await POST(
      jsonRequest({ imageBase64: "abc", mimeType: "image/png" }),
    );
    const payload = await readError(response);

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("VISION_UNAVAILABLE");
    expect(visionMocks.extractChatFromImage).not.toHaveBeenCalled();
  });

  it("returns 415 for unsupported request content types", async () => {
    const response = await POST(
      jsonRequest("plain text body", "text/plain"),
    );
    const payload = await readError(response);

    expect(response.status).toBe(415);
    expect(payload.error.code).toBe("UNSUPPORTED_CONTENT_TYPE");
    expect(visionMocks.extractChatFromImage).not.toHaveBeenCalled();
  });

  it("returns 400 when JSON payload is missing image fields", async () => {
    const response = await POST(jsonRequest({ imageBase64: "abc" }));
    const payload = await readError(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("MISSING_FIELDS");
    expect(visionMocks.extractChatFromImage).not.toHaveBeenCalled();
  });

  it("returns 400 for unsupported image mime types", async () => {
    visionMocks.isSupportedImageMimeType.mockReturnValue(false);

    const response = await POST(
      jsonRequest({ imageBase64: "abc", mimeType: "image/svg+xml" }),
    );
    const payload = await readError(response);

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe("UNSUPPORTED_IMAGE_TYPE");
    expect(visionMocks.extractChatFromImage).not.toHaveBeenCalled();
  });

  it("returns 502 when Vision extraction fails", async () => {
    visionMocks.extractChatFromImage.mockRejectedValueOnce(new Error("vision timeout"));

    const response = await POST(
      jsonRequest({ imageBase64: "abc", mimeType: "image/png" }),
    );
    const payload = await readError(response);

    expect(response.status).toBe(502);
    expect(payload.error.code).toBe("VISION_EXTRACTION_FAILED");
    expect(visionMocks.extractChatFromImage).toHaveBeenCalledWith({
      imageBase64: "abc",
      mimeType: "image/png",
    });
  });
});
