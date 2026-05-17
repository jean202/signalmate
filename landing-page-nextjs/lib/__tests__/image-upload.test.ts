import { describe, expect, it } from "vitest";
import {
  MAX_IMAGE_UPLOAD_FILES,
  MAX_ORIGINAL_IMAGE_BYTES,
  formatFileSize,
  isSupportedUploadMimeType,
  mergeExtractedChatText,
  validateImageFileSelection,
} from "@/lib/image-upload";

function makeFile(name: string, type: string, size = 128): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateImageFileSelection", () => {
  it("accepts multiple supported images within limits", () => {
    const files = [
      makeFile("first.png", "image/png"),
      makeFile("second.jpg", "image/jpeg"),
      makeFile("third.webp", "image/webp"),
    ];

    const result = validateImageFileSelection(files);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files).toEqual(files);
    }
  });

  it("rejects more than the maximum upload count", () => {
    const files = Array.from({ length: MAX_IMAGE_UPLOAD_FILES + 1 }, (_, index) =>
      makeFile(`capture-${index}.png`, "image/png"),
    );

    const result = validateImageFileSelection(files);

    expect(result).toMatchObject({
      ok: false,
      reason: "too_many",
    });
  });

  it("rejects unsupported image formats", () => {
    const result = validateImageFileSelection([
      makeFile("chat.svg", "image/svg+xml"),
    ]);

    expect(result).toMatchObject({
      ok: false,
      reason: "unsupported_type",
      fileName: "chat.svg",
    });
  });

  it("rejects images over the original size limit", () => {
    const result = validateImageFileSelection([
      makeFile("large.png", "image/png", MAX_ORIGINAL_IMAGE_BYTES + 1),
    ]);

    expect(result).toMatchObject({
      ok: false,
      reason: "too_large",
      fileName: "large.png",
    });
  });
});

describe("image upload helpers", () => {
  it("matches the server-supported mime types", () => {
    expect(isSupportedUploadMimeType("image/png")).toBe(true);
    expect(isSupportedUploadMimeType("image/jpeg")).toBe(true);
    expect(isSupportedUploadMimeType("image/webp")).toBe(true);
    expect(isSupportedUploadMimeType("image/gif")).toBe(true);
    expect(isSupportedUploadMimeType("image/heic")).toBe(false);
  });

  it("merges extracted chat text in upload order", () => {
    const merged = mergeExtractedChatText("나: 먼저 입력한 줄", [
      "상대: 첫 번째 캡처",
      "나: 두 번째 캡처\n상대: 두 번째 답장",
    ]);

    expect(merged).toBe(
      "나: 먼저 입력한 줄\n상대: 첫 번째 캡처\n나: 두 번째 캡처\n상대: 두 번째 답장",
    );
  });

  it("formats byte sizes for upload copy", () => {
    expect(formatFileSize(900)).toBe("1KB");
    expect(formatFileSize(1024 * 1024)).toBe("1MB");
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe("2.5MB");
  });
});
