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

async function readError(response: Response): Promise<ApiErrorEnvelope> {
  return (await response.json()) as ApiErrorEnvelope;
}

function jsonRequest(body: unknown, contentType = "application/json"): Request {
  return new Request("http://localhost/api/v1/conversations/extract-from-image", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body),
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
