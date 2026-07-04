import { readdir } from "node:fs/promises";
import path from "node:path";

export type SupportedImageMimeType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const MIME_BY_EXTENSION: Record<string, SupportedImageMimeType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function getImageMimeType(filePath: string): SupportedImageMimeType | null {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

export async function collectImageFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => getImageMimeType(filePath) !== null)
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b), "en", { numeric: true }));
}

export function buildCaptureId(params: {
  id?: string;
  idPrefix?: string;
  index: number;
}): string {
  if (params.id) return params.id;
  if (!params.idPrefix) {
    throw new Error("--id 또는 --id-prefix가 필요합니다.");
  }
  return `${params.idPrefix}-${String(params.index + 1).padStart(4, "0")}`;
}
