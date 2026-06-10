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
    .map((line, index) => ({ line: line.trim(), lineNo: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .flatMap(({ line, lineNo }) => {
      try {
        return [JSON.parse(line) as Capture];
      } catch (error) {
        console.warn(`skip line ${lineNo}: JSON parse error — ${(error as Error).message}`);
        return [];
      }
    });

  const rows: EvalRow[] = [];
  const seenIds = new Set<string>();
  for (const capture of captures) {
    if (!capture.id || !Array.isArray(capture.messages)) {
      console.warn(`skip invalid capture (id/messages missing)`);
      continue;
    }
    if (!capture.myLabel) {
      console.warn(`skip ${capture.id}: no myLabel`);
      continue;
    }
    if (seenIds.has(capture.id)) {
      console.warn(`warn: duplicate captureId "${capture.id}"`);
    }
    seenIds.add(capture.id);
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
