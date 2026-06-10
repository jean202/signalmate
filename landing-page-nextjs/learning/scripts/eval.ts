/**
 * Phase 2 실험노트용 CLI — dataset.jsonl의 캡쳐들을 룰 엔진에 돌려 시스템 temperature vs 내 라벨을 비교.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { matchPatterns } from "@/lib/ai/agent/tools/pattern-matcher";
import { captureToConversation, type Capture } from "../lib/capture";
import { aggregateEval, deriveTemperature, type EvalRow } from "../lib/eval-core";

async function main() {
  const arg = process.argv[2] ?? "learning/experiments/dataset.jsonl";
  const datasetPath = path.resolve(process.cwd(), arg);
  const raw = await readFile(datasetPath, "utf8");

  const captures = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Capture);

  const rows: EvalRow[] = [];
  for (const capture of captures) {
    if (!capture.id || !Array.isArray(capture.messages)) {
      console.warn(`skip invalid capture (id/messages missing)`);
      continue;
    }
    if (!capture.myLabel) {
      console.warn(`skip ${capture.id}: no myLabel`);
      continue;
    }
    const result = matchPatterns(captureToConversation(capture));
    const systemTemp = deriveTemperature(result.baselineScores.overall);
    rows.push({ captureId: capture.id, myTemp: capture.myLabel.temperature, systemTemp });
  }

  console.log("captureId | 내 라벨 | 시스템 | 일치");
  console.log("----------|---------|--------|-----");
  for (const row of rows) {
    const match = row.myTemp === row.systemTemp ? "O" : "X";
    console.log(`${row.captureId} | ${row.myTemp} | ${row.systemTemp} | ${match}`);
  }

  const summary = aggregateEval(rows);
  console.log("");
  console.log(`일치율: ${summary.agreements}/${summary.total} = ${(summary.agreementRate * 100).toFixed(1)}%`);
  if (summary.disagreements.length > 0) {
    console.log("불일치(→ Phase 3 개선 후보):");
    for (const d of summary.disagreements) {
      console.log(`  - ${d.captureId}: 나=${d.myTemp} / 시스템=${d.systemTemp}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
