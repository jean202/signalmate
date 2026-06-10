import type { PatternMatchResult } from "@/lib/ai/agent/tools/pattern-matcher";

/**
 * Phase 1 해부용 trace markdown 생성.
 *
 * 캡처의 파싱/정규화, 룰 시그널 감지, (향후) 임베딩/LLM 결과를 단계별로 보여주는
 * 마크다운을 생성합니다. 각 단계마다 학습자가 작성할 빈 '내 코멘트' 줄을 남깁니다.
 */
export type TraceResult = {
  captureId: string;
  parsed: { messageCount: number; selfCount: number; otherCount: number };
  ruleSignals: PatternMatchResult;
};

/**
 * 주어진 trace를 markdown 문자열로 포매팅합니다.
 *
 * 단계 1 (파싱), 단계 2 (룰 시그널), 단계 3~5 (임베딩/LLM 선택)로 구성되어,
 * 각 단계에 학습자가 기입할 빈 '내 코멘트' 줄을 포함합니다.
 */
export function formatTrace(trace: TraceResult): string {
  const { captureId, parsed, ruleSignals } = trace;
  const lines: string[] = [];

  lines.push(`# Trace: ${captureId}`, "");

  lines.push("## 단계 1 — 파싱/정규화");
  lines.push(
    `- 메시지 ${parsed.messageCount}개 (나: ${parsed.selfCount}, 상대: ${parsed.otherCount})`,
  );
  lines.push("- 내 코멘트:", "");

  lines.push("## 단계 2 — 룰 시그널 (오프라인)");
  for (const signal of ruleSignals.signals) {
    lines.push(`- [${signal.signalType}] ${signal.signalKey}: ${signal.title}`);
    lines.push(
      `  - ${signal.description} (confidence: ${signal.confidenceLevel})`,
    );
  }
  const s = ruleSignals.baselineScores;
  lines.push(
    `- baselineScores → otherInitiative: ${s.otherInitiative}, responseCadence: ${s.responseCadence}, questionReciprocity: ${s.questionReciprocity}, schedulingCommitment: ${s.schedulingCommitment}, overall: ${s.overall}`,
  );
  lines.push(
    `- recommendedAction: ${ruleSignals.recommendedAction} — ${ruleSignals.recommendedActionReason}`,
  );
  lines.push("- 내 코멘트:", "");

  lines.push("## 단계 3~5 — 임베딩/LLM (선택, API 키 필요)");
  lines.push("- (Task 9에서 키 있을 때 채워짐)");
  lines.push("- 내 코멘트:", "");

  return lines.join("\n");
}
