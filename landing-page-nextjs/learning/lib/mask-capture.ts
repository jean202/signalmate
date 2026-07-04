import type { Capture, CaptureContext, CaptureMessage } from "./capture";

export type ManualReplacementRule = {
  from: string;
  to: string;
};

export type ReplacementRuleParseResult = {
  rules: ManualReplacementRule[];
  invalidLines: string[];
};

export type ParsedChatText = {
  messages: CaptureMessage[];
  skippedLines: string[];
};

export type BuildMaskedCaptureParams = {
  id: string;
  rawText: string;
  source?: string;
  context?: CaptureContext;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  manualRules?: ManualReplacementRule[];
};

export type BuildMaskedCaptureResult = {
  capture: Capture;
  skippedLines: string[];
};

const CHAT_LINE_PATTERN = /^(?:\[[^\]]+\]\s*)?(나|상대|me|them)\s*:\s*(.+)$/i;

export function maskText(text: string, manualRules: ManualReplacementRule[]): string {
  let masked = text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[이메일]")
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[URL]")
    .replace(/(?:\+82[-.\s]?)?0?1[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, "[전화번호]")
    .replace(/(^|[\s(])@[A-Za-z0-9._]{2,30}\b/g, "$1[SNS]");

  for (const rule of [...manualRules].sort((a, b) => b.from.length - a.from.length)) {
    masked = masked.split(rule.from).join(rule.to);
  }

  return masked;
}

export function parseManualReplacementRules(lines: string[]): ReplacementRuleParseResult {
  const rules: ManualReplacementRule[] = [];
  const invalidLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      invalidLines.push(rawLine.trim());
      continue;
    }

    const from = line.slice(0, separatorIndex).trim();
    const to = line.slice(separatorIndex + 1).trim();
    if (!from || !to) {
      invalidLines.push(rawLine.trim());
      continue;
    }

    rules.push({ from, to });
  }

  return { rules, invalidLines };
}

export function parseChatText(rawText: string): ParsedChatText {
  const messages: CaptureMessage[] = [];
  const skippedLines: string[] = [];

  for (const rawLine of rawText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = CHAT_LINE_PATTERN.exec(line);
    if (!match) {
      skippedLines.push(line);
      continue;
    }

    const [, rawSender, text] = match;
    const sender = rawSender.toLowerCase() === "me" || rawSender === "나" ? "me" : "them";
    messages.push({ sender, text: text.trim() });
  }

  return { messages, skippedLines };
}

export function buildMaskedCapture(params: BuildMaskedCaptureParams): BuildMaskedCaptureResult {
  const parsed = parseChatText(params.rawText);
  const manualRules = params.manualRules ?? [];
  const capture: Capture = {
    id: params.id,
    relationshipStage: params.relationshipStage ?? "unknown",
    meetingChannel: params.meetingChannel ?? "dating_app",
    userGoal: params.userGoal ?? "build_rapport",
    messages: parsed.messages.map((message) => ({
      ...message,
      text: maskText(message.text, manualRules),
    })),
  };

  if (params.source) capture.source = params.source;
  if (params.context && Object.keys(params.context).length > 0) {
    capture.context = params.context;
  }

  return {
    capture,
    skippedLines: parsed.skippedLines,
  };
}
