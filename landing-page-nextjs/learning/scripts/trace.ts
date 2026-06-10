/**
 * Phase 1 해부용 CLI — 캡쳐 1개를 오프라인 룰 엔진에 흘려 trace markdown 생성.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { matchPatterns } from "@/lib/ai/agent/tools/pattern-matcher";
import { captureToConversation, type Capture } from "../lib/capture";
import { formatTrace } from "../lib/format-trace";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: npm run learn:trace -- <capture-path>");
    console.error("Example: npm run learn:trace -- learning/captures/example-0000.json");
    process.exit(1);
  }

  const capturePath = path.resolve(process.cwd(), arg);
  const capture = JSON.parse(await readFile(capturePath, "utf8")) as Capture;

  const conversation = captureToConversation(capture);
  const ruleSignals = matchPatterns(conversation);

  const selfCount = conversation.messages.filter((m) => m.senderRole === "self").length;
  const otherCount = conversation.messages.filter((m) => m.senderRole === "other").length;

  const md = formatTrace({
    captureId: capture.id,
    parsed: { messageCount: conversation.messages.length, selfCount, otherCount },
    ruleSignals,
  });

  const outPath = path.resolve(process.cwd(), "learning/traces", `${capture.id}.trace.md`);
  await writeFile(outPath, md, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(md);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
