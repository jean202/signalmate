/**
 * 실제 캡쳐 추출 텍스트를 마스킹된 learning/captures JSON으로 저장하는 로컬 CLI.
 *
 * 원본 이미지는 받지 않고, 붙여넣은 원문도 파일로 저장하지 않는다.
 */
import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import {
  buildMaskedCapture,
  parseManualReplacementRules,
  type ManualReplacementRule,
} from "../lib/mask-capture";

type CliOptions = {
  id?: string;
  out?: string;
  force: boolean;
  help: boolean;
};

type PromptReader = {
  question(prompt: string): Promise<string>;
  close(): void;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.id) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const outputPath = path.resolve(
    process.cwd(),
    options.out ?? `learning/captures/${options.id}.json`,
  );
  if (!options.force && (await exists(outputPath))) {
    throw new Error(`${outputPath} already exists. 덮어쓰려면 --force를 사용하세요.`);
  }

  const rl = await createPromptReader();
  try {
    const rawText = await readMultiline(
      rl,
      "캡쳐 추출 텍스트를 붙여넣고, 마지막 줄에 __END__ 를 입력하세요.",
      "__END__",
    );
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

    const source = await questionWithDefault(rl, "source", "수동 마스킹 캡쳐");
    const relationshipStage = await questionWithDefault(rl, "relationshipStage", "unknown");
    const meetingChannel = await questionWithDefault(rl, "meetingChannel", "dating_app");
    const userGoal = await questionWithDefault(rl, "userGoal", "build_rapport");

    const result = buildMaskedCapture({
      id: options.id,
      rawText,
      source,
      relationshipStage,
      meetingChannel,
      userGoal,
      context,
      manualRules: rules,
    });

    if (result.capture.messages.length === 0) {
      throw new Error("파싱된 메시지가 없습니다. '나:' 또는 '상대:' 형식인지 확인하세요.");
    }

    printWarnings(invalidLines, result.skippedLines, rules);
    const json = `${JSON.stringify(result.capture, null, 2)}\n`;
    console.log("\n--- 저장될 JSON 미리보기 ---");
    console.log(json);
    const confirmation = await rl.question("검수했고 저장하려면 '저장'을 입력하세요: ");
    if (confirmation.trim() !== "저장") {
      console.log("저장하지 않았습니다.");
      return;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, json, "utf8");
    console.log(`저장 완료: ${path.relative(process.cwd(), outputPath)}`);
    console.log("시스템 결과를 보기 전에 myLabel을 직접 채운 뒤 learn:eval에 넣으세요.");
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
  npm run learn:mask -- --id 0004 --out learning/captures/0004.json

주의:
  - 원본 캡쳐 이미지는 저장하지 않습니다.
  - 붙여넣은 원문도 저장하지 않고, 미리보기로 검수한 마스킹 JSON만 저장합니다.
  - 저장 후 시스템 결과를 보기 전에 myLabel을 직접 채우세요.`);
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
