/**
 * 실제 캡쳐 추출 텍스트를 마스킹된 learning/captures JSON으로 저장하는 로컬 CLI.
 *
 * 원본 이미지는 받지 않고, 붙여넣은 원문도 파일로 저장하지 않는다.
 */
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { isAnthropicAvailable } from "@/lib/ai/anthropic-client";
import { extractChatFromImage } from "@/lib/ai/vision/extract-from-image";
import {
  buildCaptureId,
  collectImageFiles,
  getImageMimeType,
} from "../lib/image-input";
import {
  buildMaskedCapture,
  parseManualReplacementRules,
  type ManualReplacementRule,
} from "../lib/mask-capture";

type CliOptions = {
  id?: string;
  idPrefix?: string;
  image?: string;
  imageDir?: string;
  out?: string;
  force: boolean;
  help: boolean;
};

type PromptReader = {
  question(prompt: string): Promise<string>;
  close(): void;
};

type MaskSessionDefaults = {
  manualRules: ManualReplacementRule[];
  invalidReplacementLines: string[];
  context: Record<string, string>;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }
  validateOptions(options);

  const imageInputs = await resolveImageInputs(options);
  if (imageInputs.length > 0 && !isAnthropicAvailable()) {
    throw new Error("이미지 입력에는 ANTHROPIC_API_KEY가 필요합니다.");
  }

  const rl = await createPromptReader();
  try {
    if (imageInputs.length === 0) {
      const captureId = buildCaptureId({ id: options.id, index: 0 });
      await processCapture({
        rl,
        options,
        captureId,
        rawText: await readMultiline(
          rl,
          "캡쳐 추출 텍스트를 붙여넣고, 마지막 줄에 __END__ 를 입력하세요.",
          "__END__",
        ),
        defaultSource: "수동 마스킹 캡쳐",
        outputPath: resolveOutputPath(options, captureId),
      });
      return;
    }

    const sharedDefaults =
      imageInputs.length > 1 ? await readSharedDefaults(rl) : undefined;

    for (const [index, imagePath] of imageInputs.entries()) {
      const captureId = buildCaptureId({
        id: imageInputs.length === 1 ? options.id : undefined,
        idPrefix: options.idPrefix,
        index,
      });
      console.log(`\n=== 이미지 ${index + 1}/${imageInputs.length}: ${imagePath} ===`);
      const rawText = await extractTextFromImageFile(imagePath);
      console.log("\n--- 이미지에서 추출한 텍스트 ---");
      console.log(rawText);
      await processCapture({
        rl,
        options,
        captureId,
        rawText,
        defaultSource: path.basename(imagePath),
        outputPath: resolveOutputPath(options, captureId),
        sharedDefaults,
      });
    }
  } finally {
    rl.close();
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { force: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--id") {
      options.id = argv[index + 1];
      index += 1;
    } else if (arg === "--id-prefix") {
      options.idPrefix = argv[index + 1];
      index += 1;
    } else if (arg === "--image") {
      options.image = argv[index + 1];
      index += 1;
    } else if (arg === "--image-dir") {
      options.imageDir = argv[index + 1];
      index += 1;
    } else if (arg === "--out") {
      options.out = argv[index + 1];
      index += 1;
    }
  }
  return options;
}

function printUsage() {
  console.log(`사용법:
  npm run learn:mask -- --id 0004
  npm run learn:mask -- --id 0004 --image /absolute/path/chat.png
  npm run learn:mask -- --image-dir /absolute/path/captures --id-prefix gangho
  npm run learn:mask -- --id 0004 --out learning/captures/0004.json

주의:
  - 원본 캡쳐 이미지는 저장하지 않습니다.
  - 붙여넣은 원문과 이미지 추출 원문은 저장하지 않고, 미리보기로 검수한 마스킹 JSON만 저장합니다.
  - 이미지 입력은 ANTHROPIC_API_KEY가 필요합니다.
  - 저장 후 시스템 결과를 보기 전에 myLabel을 직접 채우세요.`);
}

function validateOptions(options: CliOptions) {
  if (options.image && options.imageDir) {
    throw new Error("--image와 --image-dir는 동시에 사용할 수 없습니다.");
  }
  if (!options.imageDir && !options.id) {
    throw new Error("--id가 필요합니다.");
  }
  if (options.imageDir && !options.idPrefix) {
    throw new Error("--image-dir를 쓸 때는 --id-prefix가 필요합니다.");
  }
}

async function resolveImageInputs(options: CliOptions): Promise<string[]> {
  if (options.image) return [path.resolve(process.cwd(), options.image)];
  if (options.imageDir) {
    const files = await collectImageFiles(path.resolve(process.cwd(), options.imageDir));
    if (files.length === 0) {
      throw new Error("지원하는 이미지 파일이 없습니다. PNG, JPG, JPEG, WEBP, GIF만 지원합니다.");
    }
    return files;
  }
  return [];
}

function resolveOutputPath(options: CliOptions, captureId: string): string {
  if (!options.out) {
    return path.resolve(process.cwd(), `learning/captures/${captureId}.json`);
  }
  const resolved = path.resolve(process.cwd(), options.out);
  if (options.imageDir) {
    return path.join(resolved, `${captureId}.json`);
  }
  return resolved;
}

async function extractTextFromImageFile(imagePath: string): Promise<string> {
  const mimeType = getImageMimeType(imagePath);
  if (!mimeType) {
    throw new Error(`지원하지 않는 이미지 형식입니다: ${imagePath}`);
  }
  const buffer = await readFile(imagePath);
  const result = await extractChatFromImage({
    imageBase64: buffer.toString("base64"),
    mimeType,
  });
  return result.rawText;
}

async function createPromptReader(): Promise<PromptReader> {
  if (process.stdin.isTTY) {
    return createInterface({ input: process.stdin, output: process.stdout });
  }

  const input = await readAllStdin();
  const lines = input.split(/\r?\n/);
  let index = 0;
  return {
    async question(prompt: string) {
      process.stdout.write(prompt);
      const line = lines[index] ?? "";
      index += 1;
      process.stdout.write(`${line}\n`);
      return line;
    },
    close() {},
  };
}

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function processCapture(params: {
  rl: PromptReader;
  options: CliOptions;
  captureId: string;
  rawText: string;
  defaultSource: string;
  outputPath: string;
  sharedDefaults?: MaskSessionDefaults;
}) {
  if (!params.options.force && (await exists(params.outputPath))) {
    throw new Error(`${params.outputPath} already exists. 덮어쓰려면 --force를 사용하세요.`);
  }

  const defaults =
    params.sharedDefaults ??
    (await readCaptureDefaults(params.rl, {
      relationshipStage: "unknown",
      meetingChannel: "dating_app",
      userGoal: "build_rapport",
    }));

  const source = await questionWithDefault(params.rl, "source", params.defaultSource);

  const result = buildMaskedCapture({
    id: params.captureId,
    rawText: params.rawText,
    source,
    relationshipStage: defaults.relationshipStage,
    meetingChannel: defaults.meetingChannel,
    userGoal: defaults.userGoal,
    context: defaults.context,
    manualRules: defaults.manualRules,
  });

  if (result.capture.messages.length === 0) {
    throw new Error("파싱된 메시지가 없습니다. '나:' 또는 '상대:' 형식인지 확인하세요.");
  }

  printWarnings(defaults.invalidReplacementLines, result.skippedLines, defaults.manualRules);
  const json = `${JSON.stringify(result.capture, null, 2)}\n`;
  console.log("\n--- 저장될 JSON 미리보기 ---");
  console.log(json);
  const confirmation = await params.rl.question("검수했고 저장하려면 '저장'을 입력하세요: ");
  if (confirmation.trim() !== "저장") {
    console.log("저장하지 않았습니다.");
    return;
  }

  await mkdir(path.dirname(params.outputPath), { recursive: true });
  await writeFile(params.outputPath, json, "utf8");
  console.log(`저장 완료: ${path.relative(process.cwd(), params.outputPath)}`);
  console.log("시스템 결과를 보기 전에 myLabel을 직접 채운 뒤 learn:eval에 넣으세요.");
}

async function readSharedDefaults(rl: PromptReader): Promise<MaskSessionDefaults> {
  console.log("\n=== 폴더 공통 마스킹 설정 ===");
  console.log("아래 치환 규칙과 context는 이번 폴더의 모든 이미지에 재사용됩니다.");
  return readCaptureDefaults(rl, {
    relationshipStage: "early_chat",
    meetingChannel: "acquaintance_intro",
    userGoal: "build_rapport",
  });
}

async function readCaptureDefaults(
  rl: PromptReader,
  defaultValues: {
    relationshipStage: string;
    meetingChannel: string;
    userGoal: string;
  },
): Promise<MaskSessionDefaults> {
  const replacementLines = await readUntilBlank(
    rl,
    "추가 치환 규칙을 입력하세요. 예: 삼성전자=[직장]. 빈 줄이면 종료.",
  );
  const { rules, invalidLines } = parseManualReplacementRules(replacementLines);
  const context = parseKeyValueLines(
    await readUntilBlank(
      rl,
      "context를 key=value로 입력하세요. 예: job=대기업 / 사무직. 빈 줄이면 종료.",
    ),
  );

  return {
    manualRules: rules,
    invalidReplacementLines: invalidLines,
    context,
    relationshipStage: await questionWithDefault(
      rl,
      "relationshipStage",
      defaultValues.relationshipStage,
    ),
    meetingChannel: await questionWithDefault(rl, "meetingChannel", defaultValues.meetingChannel),
    userGoal: await questionWithDefault(rl, "userGoal", defaultValues.userGoal),
  };
}

async function readMultiline(
  rl: PromptReader,
  prompt: string,
  terminator: string,
): Promise<string> {
  console.log(prompt);
  const lines: string[] = [];
  while (true) {
    const line = await rl.question("> ");
    if (line.trim() === terminator) break;
    lines.push(line);
  }
  return lines.join("\n");
}

async function readUntilBlank(
  rl: PromptReader,
  prompt: string,
): Promise<string[]> {
  console.log(prompt);
  const lines: string[] = [];
  while (true) {
    const line = await rl.question("> ");
    if (!line.trim()) break;
    lines.push(line);
  }
  return lines;
}

async function questionWithDefault(
  rl: PromptReader,
  label: string,
  defaultValue: string,
): Promise<string> {
  const answer = await rl.question(`${label} [${defaultValue}]: `);
  return answer.trim() || defaultValue;
}

function parseKeyValueLines(lines: string[]): Record<string, string> {
  const context: Record<string, string> = {};
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key && value) context[key] = value;
  }
  return context;
}

function printWarnings(
  invalidReplacementLines: string[],
  skippedChatLines: string[],
  rules: ManualReplacementRule[],
) {
  if (rules.length > 0) {
    console.log(`수동 치환 ${rules.length}개를 적용했습니다.`);
  }
  if (invalidReplacementLines.length > 0) {
    console.warn(`무시한 치환 규칙: ${invalidReplacementLines.join(", ")}`);
  }
  if (skippedChatLines.length > 0) {
    console.warn("메시지로 파싱하지 않은 줄:");
    for (const line of skippedChatLines) {
      console.warn(`- ${line}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
