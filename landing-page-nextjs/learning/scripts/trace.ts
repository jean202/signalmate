/**
 * Phase 1 해부용 CLI — 캡쳐 1개를 오프라인 룰 엔진에 흘려 trace markdown 생성.
 * ANTHROPIC_API_KEY가 있을 때만 LLM 시그널 보정 단계도 관찰.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

  // Validate minimal capture shape
  if (!capture.id || !Array.isArray(capture.messages)) {
    console.error(`Invalid capture file: ${capturePath} — "id" and "messages" are required`);
    process.exit(1);
  }

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
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, md, "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(md);

  // 선택 단계: ANTHROPIC_API_KEY가 있을 때만 LLM 시그널 보정을 추가로 관찰
  if (process.env.ANTHROPIC_API_KEY) {
    const { enhanceSignals } = await import("@/lib/ai/chains/signal-enhancer");
    const enhanced = await enhanceSignals({
      rawText: conversation.rawText,
      relationshipStage: conversation.relationshipStage,
      meetingChannel: conversation.meetingChannel,
      userGoal: conversation.userGoal,
      situationContext: conversation.situationContext,
      signals: ruleSignals.signals.map((s, index) => ({
        id: randomUUID(),
        signalType: s.signalType as "positive" | "ambiguous" | "caution",
        signalKey: s.signalKey,
        title: s.title,
        description: s.description,
        evidenceText: "",
        confidenceLevel: s.confidenceLevel as "low" | "medium" | "high",
        displayOrder: index,
      })),
    });
    console.log("LLM enhanced signals:", JSON.stringify(enhanced, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
