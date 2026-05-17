export const SUPPORTED_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

export const MAX_IMAGE_UPLOAD_FILES = 6;
export const MAX_ORIGINAL_IMAGE_BYTES = 10 * 1024 * 1024;
export const TARGET_UPLOAD_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_UPLOAD_IMAGE_DIMENSION = 1800;

type SupportedUploadMimeType = (typeof SUPPORTED_UPLOAD_MIME_TYPES)[number];

export type ImageSelectionValidation =
  | { ok: true; files: File[] }
  | {
      ok: false;
      reason: "empty" | "too_many" | "unsupported_type" | "too_large";
      message: string;
      fileName?: string;
    };

export type PreparedUploadImage = {
  file: File;
  originalBytes: number;
  uploadBytes: number;
  wasCompressed: boolean;
};

export function isSupportedUploadMimeType(mimeType: string): mimeType is SupportedUploadMimeType {
  return (SUPPORTED_UPLOAD_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function validateImageFileSelection(files: File[]): ImageSelectionValidation {
  if (files.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "올릴 이미지를 선택해주세요.",
    };
  }

  if (files.length > MAX_IMAGE_UPLOAD_FILES) {
    return {
      ok: false,
      reason: "too_many",
      message: `한 번에 최대 ${MAX_IMAGE_UPLOAD_FILES}장까지 올릴 수 있어요.`,
    };
  }

  for (const file of files) {
    if (!isSupportedUploadMimeType(file.type)) {
      return {
        ok: false,
        reason: "unsupported_type",
        fileName: file.name,
        message: "PNG, JPEG, WEBP, GIF 이미지만 올릴 수 있어요.",
      };
    }

    if (file.size > MAX_ORIGINAL_IMAGE_BYTES) {
      return {
        ok: false,
        reason: "too_large",
        fileName: file.name,
        message: `이미지는 장당 최대 ${formatFileSize(MAX_ORIGINAL_IMAGE_BYTES)}까지 가능해요.`,
      };
    }
  }

  return { ok: true, files };
}

export async function prepareImageForUpload(file: File): Promise<PreparedUploadImage> {
  if (!canCompressImage(file) || file.size <= TARGET_UPLOAD_IMAGE_BYTES) {
    return {
      file,
      originalBytes: file.size,
      uploadBytes: file.size,
      wasCompressed: false,
    };
  }

  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    return {
      file,
      originalBytes: file.size,
      uploadBytes: file.size,
      wasCompressed: false,
    };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return {
      file,
      originalBytes: file.size,
      uploadBytes: file.size,
      wasCompressed: false,
    };
  }

  try {
    const largestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, MAX_UPLOAD_IMAGE_DIMENSION / largestSide);
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));
    const outputType = file.type === "image/webp" ? "image/webp" : "image/jpeg";

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      return {
        file,
        originalBytes: file.size,
        uploadBytes: file.size,
        wasCompressed: false,
      };
    }

    if (outputType === "image/jpeg") {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, targetWidth, targetHeight);
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    let bestBlob: Blob | null = null;
    for (const quality of [0.86, 0.74, 0.62, 0.5]) {
      const blob = await canvasToBlob(canvas, outputType, quality);
      if (!blob) continue;

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= TARGET_UPLOAD_IMAGE_BYTES) {
        break;
      }
    }

    if (!bestBlob || bestBlob.size >= file.size) {
      return {
        file,
        originalBytes: file.size,
        uploadBytes: file.size,
        wasCompressed: false,
      };
    }

    const optimizedFile = new File([bestBlob], buildOptimizedFileName(file.name, outputType), {
      type: outputType,
      lastModified: file.lastModified,
    });

    return {
      file: optimizedFile,
      originalBytes: file.size,
      uploadBytes: optimizedFile.size,
      wasCompressed: true,
    };
  } finally {
    bitmap.close();
  }
}

export function mergeExtractedChatText(currentText: string, additions: string[]): string {
  const segments = [currentText, ...additions]
    .map((segment) => segment.trim())
    .filter(Boolean);

  return segments.join("\n");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }

  const megabytes = bytes / 1024 / 1024;
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)}MB`;
}

function canCompressImage(file: File): boolean {
  return file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp";
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function buildOptimizedFileName(fileName: string, mimeType: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, "") || "chat-capture";
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  return `${baseName}-optimized.${extension}`;
}
