/**
 * 마스킹된 캡쳐 JSON을 사람이 블라인드 라벨링하고 dataset.jsonl을 갱신하는 로컬 CLI.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import type { Capture, CaptureLabel } from "../lib/capture";
import {
  buildDatasetJsonl,
  collectCaptureFiles,
  formatMessagesForReview,
  isTemperature,
  upsertLabel,
} from "../lib/label-capture";

type CliOptions = {
  prefix?: string;
  capturesDir: string;
  dataset: string;
  all: boolean;
  help: boolean;
};

type PromptReader = {
  question(prompt: string): Promise<string>;
  close(): void;
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help || !options.prefix) {
    printUsage();
    process.exit(options.help ? 0 : 1);
  }

  const capturesDir = path.resolve(process.cwd(), options.capturesDir);
  const files = await collectCaptureFiles(capturesDir, options.prefix);
  if (files.length === 0) {
    throw new Error(`${options.prefix}-*.json 캡쳐가 없습니다.`);
  }

  const rl = await createPromptReader();
  try {
    let labeledCount = 0;
    for (const [index, file] of files.entries()) {
      const capture = JSON.parse(await readFile(file, "utf8")) as Capture;
      if (capture.myLabel && !options.all) {
        console.log(`${index + 1}/${files.length} ${capture.id}: 이미 myLabel 있음 — 건너뜁니다.`);
        continue;
      }

      console.log(`\n=== ${index + 1}/${files.length} ${capture.id} ===`);
      if (capture.source) console.log(`source: ${capture.source}`);
      if (capture.context) console.log(`context: ${JSON.stringify(capture.context)}`);
      console.log("\n--- 대화 ---");
      console.log(formatMessagesForReview(capture));

      const label = await readLabel(rl, capture.myLabel);
      const updated = upsertLabel(capture, label);
      await writeFile(file, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
      labeledCount += 1;
      console.log(`저장 완료: ${path.relative(process.cwd(), file)}`);
    }

    const dataset = await buildDatasetJsonl(files);
    const datasetPath = path.resolve(process.cwd(), options.dataset);
    await mkdir(path.dirname(datasetPath), { recursive: true });
    await writeFile(datasetPath, dataset.jsonl, "utf8");
    console.log(
      `\ndataset 갱신 완료: ${path.relative(process.cwd(), datasetPath)} (${dataset.included}개 포함, ${dataset.skipped.length}개 미라벨)`,
    );
    if (labeledCount === 0) {
      console.log("이번 실행에서 새로 라벨링한 캡쳐는 없습니다.");
    }
  } finally {
    rl.close();
  }
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    capturesDir: "learning/captures",
    dataset: "learning/experiments/dataset.jsonl",
    all: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--prefix") {
      options.prefix = argv[index + 1];
      index += 1;
    } else if (arg === "--captures-dir") {
      options.capturesDir = argv[index + 1];
      index += 1;
    } else if (arg === "--dataset") {
      options.dataset = argv[index + 1];
      index += 1;
    } else if (arg === "--all") {
      options.all = true;
    }
  }
  return options;
}

function printUsage() {
  console.log(`사용법:
  npm run learn:label -- --prefix gangho
  npm run learn:label -- --prefix gangho --all

입력:
  - temperature: cold | neutral | warm | hot
  - topSignal: 네가 본 가장 강한 관계 신호
  - nextMove: 다음에 할 액션/메시지 방향

결과:
  - 각 capture JSON에 myLabel 저장
  - learning/experiments/dataset.jsonl 자동 갱신`);
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

async function readLabel(
  rl: PromptReader,
  existing?: CaptureLabel,
): Promise<CaptureLabel> {
  const temperature = await readTemperature(rl, existing?.temperature);
  const topSignal = await readRequiredText(
    rl,
    "topSignal",
    existing?.topSignal,
  );
  const nextMove = await readRequiredText(
    rl,
    "nextMove",
    existing?.nextMove,
  );

  return { temperature, topSignal, nextMove };
}

async function readTemperature(
  rl: PromptReader,
  existing?: CaptureLabel["temperature"],
): Promise<CaptureLabel["temperature"]> {
  while (true) {
    const suffix = existing ? ` [${existing}]` : "";
    const answer = (await rl.question(`temperature(cold/neutral/warm/hot)${suffix}: `)).trim();
    const value = answer || existing;
    if (value && isTemperature(value)) return value;
    console.log("cold, neutral, warm, hot 중 하나를 입력하세요.");
  }
}

async function readRequiredText(
  rl: PromptReader,
  label: string,
  existing?: string,
): Promise<string> {
  while (true) {
    const suffix = existing ? ` [${existing}]` : "";
    const answer = (await rl.question(`${label}${suffix}: `)).trim();
    const value = answer || existing;
    if (value) return value;
    console.log(`${label}은 비워둘 수 없습니다.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
