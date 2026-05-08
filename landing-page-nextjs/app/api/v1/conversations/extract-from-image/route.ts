/**
 * POST /api/v1/conversations/extract-from-image
 *
 * 카카오톡/메시지 캡처 이미지를 받아서 Claude Vision으로 대화를 추출합니다.
 * multipart/form-data 또는 application/json (base64) 모두 지원.
 *
 * 응답:
 *   { success: true, data: { rawText, messageCount, notes } }
 */
import { errorResponse, successResponse } from "@/lib/api-response";
import { isAnthropicAvailable } from "@/lib/ai/anthropic-client";
import {
  extractChatFromImage,
  isSupportedImageMimeType,
} from "@/lib/ai/vision/extract-from-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 이미지 1장당 최대 10MB. Claude Vision은 5MB까지 권장이지만,
// 클라이언트 리사이즈를 거치지 않은 원본도 한 번은 받을 수 있게 여유.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isAnthropicAvailable()) {
    return errorResponse(
      503,
      "VISION_UNAVAILABLE",
      "Claude API 키가 설정되지 않아 이미지 추출을 사용할 수 없어요.",
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  let imageBase64: string;
  let mimeType: string;

  try {
    if (contentType.startsWith("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("image");
      if (!(file instanceof File)) {
        return errorResponse(400, "MISSING_IMAGE", "image 파일이 필요해요.");
      }

      if (file.size > MAX_IMAGE_BYTES) {
        return errorResponse(
          413,
          "IMAGE_TOO_LARGE",
          `이미지가 너무 커요. 최대 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB까지 가능해요.`,
        );
      }

      mimeType = file.type;
      const arrayBuffer = await file.arrayBuffer();
      imageBase64 = Buffer.from(arrayBuffer).toString("base64");
    } else if (contentType.includes("application/json")) {
      const body = (await request.json()) as {
        imageBase64?: string;
        mimeType?: string;
      };

      if (!body.imageBase64 || !body.mimeType) {
        return errorResponse(
          400,
          "MISSING_FIELDS",
          "imageBase64와 mimeType이 필요해요.",
        );
      }

      // base64 길이 기반 추정 (정확한 byte 계산은 padding 제외)
      const estimatedBytes = Math.floor((body.imageBase64.length * 3) / 4);
      if (estimatedBytes > MAX_IMAGE_BYTES) {
        return errorResponse(
          413,
          "IMAGE_TOO_LARGE",
          `이미지가 너무 커요. 최대 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)}MB까지 가능해요.`,
        );
      }

      imageBase64 = body.imageBase64;
      mimeType = body.mimeType;
    } else {
      return errorResponse(
        415,
        "UNSUPPORTED_CONTENT_TYPE",
        "multipart/form-data 또는 application/json만 지원해요.",
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(400, "INVALID_REQUEST", `요청을 읽지 못했어요: ${message}`);
  }

  if (!isSupportedImageMimeType(mimeType)) {
    return errorResponse(
      400,
      "UNSUPPORTED_IMAGE_TYPE",
      "PNG, JPEG, WEBP, GIF 형식만 지원해요.",
    );
  }

  try {
    const result = await extractChatFromImage({
      imageBase64,
      mimeType,
    });
    return successResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[extract-from-image] vision failed:", message);
    return errorResponse(
      502,
      "VISION_EXTRACTION_FAILED",
      "이미지에서 대화를 읽지 못했어요. 더 또렷한 캡처로 다시 시도해주세요.",
    );
  }
}
