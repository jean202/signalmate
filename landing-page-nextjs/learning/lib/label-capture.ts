import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Capture, CaptureLabel } from "./capture";

const TEMPERATURES = new Set<CaptureLabel["temperature"]>([
  "cold",
  "neutral",
  "warm",
  "hot",
]);

export type DatasetJsonlResult = {
  jsonl: string;
  included: number;
  skipped: string[];
};

export function isTemperature(value: string): value is CaptureLabel["temperature"] {
  return TEMPERATURES.has(value as CaptureLabel["temperature"]);
}

export async function collectCaptureFiles(
  capturesDir: string,
  prefix: string,
): Promise<string[]> {
  const entries = await readdir(capturesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.startsWith(`${prefix}-`) && name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => path.join(capturesDir, name));
}

export function upsertLabel(capture: Capture, label: CaptureLabel): Capture {
  return {
    ...capture,
    myLabel: label,
  };
}

export function formatMessagesForReview(capture: Capture): string {
  return capture.messages
    .map((message) => `${message.sender === "me" ? "나" : "상대"}: ${message.text}`)
    .join("\n");
}

export async function buildDatasetJsonl(files: string[]): Promise<DatasetJsonlResult> {
  const lines: string[] = [];
  const skipped: string[] = [];

  for (const file of files) {
    const capture = JSON.parse(await readFile(file, "utf8")) as Capture;
    if (!capture.myLabel) {
      skipped.push(capture.id || path.basename(file));
      continue;
    }
    lines.push(JSON.stringify(capture));
  }

  return {
    jsonl: lines.length > 0 ? `${lines.join("\n")}\n` : "",
    included: lines.length,
    skipped,
  };
}
