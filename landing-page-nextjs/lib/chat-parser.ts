/**
 * Chat message parser for SignalMate.
 *
 * Supported formats:
 * - KakaoTalk export (Korean/English)
 * - iMessage / SMS simple format
 * - Generic "name: message" or "[time] name: message" format
 */

export type ParsedMessage = {
  senderRole: "self" | "other" | "unknown";
  senderName: string;
  messageText: string;
  sentAt: string | null;
  sequenceNo: number;
};

export type ParseResult = {
  messages: ParsedMessage[];
  detectedFormat: string;
  senderNames: string[];
  selfName: string | null;
};

// ─── KakaoTalk format ──────────────────────────────────────
// Korean: "2026년 3월 15일 오후 2:30, 김진하 : 안녕"
// Korean alt: "[김진하] [오후 2:30] 안녕"
// English: "2026. 3. 15. 2:30 PM, Jinha : hello"

const KAKAO_DATE_HEADER_KR = /^-+\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*.+\s*-+$/;
const KAKAO_DATE_HEADER_EN = /^-+\s*\w+day,\s+\w+\s+\d{1,2},\s+\d{4}\s*-+$/;
const KAKAO_SYSTEM_MSG = /^(.*님이 들어왔습니다|.*님이 나갔습니다|.*님을 초대했습니다|채팅방 관리자가)/;

// "2026년 3월 15일 오후 2:30, 김진하 : 메시지"
const KAKAO_LINE_KR =
  /^(\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*[오전후]+\s*\d{1,2}:\d{2}),\s*(.+?)\s*:\s*(.+)$/;

// "[김진하] [오후 2:30] 메시지"
const KAKAO_LINE_BRACKET =
  /^\[(.+?)\]\s*\[([오전후]+\s*\d{1,2}:\d{2})\]\s*(.+)$/;

// "2026. 3. 15. 2:30 PM, Name : message"
const KAKAO_LINE_EN =
  /^(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*\d{1,2}:\d{2}\s*[APap][Mm]),\s*(.+?)\s*:\s*(.+)$/;

// ─── Generic format ────────────────────────────────────────
// "[14:30] 김진하: 메시지" or "14:30 김진하: 메시지"
const GENERIC_TIME_NAME =
  /^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.+?)[:：]\s*(.+)$/;

// "김진하: 메시지" or "Name: message"
const SIMPLE_NAME_MSG = /^(.+?)[:：]\s+(.+)$/;

// ─── Timestamp parsing ─────────────────────────────────────

function parseKakaoTimeKr(raw: string): string | null {
  // "2026년 3월 15일 오후 2:30"
  const match = raw.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const [, year, month, day, ampm, hourStr, minute] = match;
  let hour = parseInt(hourStr, 10);
  if (ampm === "오후" && hour < 12) hour += 12;
  if (ampm === "오전" && hour === 12) hour = 0;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00+09:00`;
}

function parseKakaoBracketTime(timeStr: string, dateContext?: string): string | null {
  // "오후 2:30"
  const match = timeStr.match(/(오전|오후)\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const [, ampm, hourStr, minute] = match;
  let hour = parseInt(hourStr, 10);
  if (ampm === "오후" && hour < 12) hour += 12;
  if (ampm === "오전" && hour === 12) hour = 0;

  const date = dateContext || "2026-01-01";
  return `${date}T${String(hour).padStart(2, "0")}:${minute}:00+09:00`;
}

function parseKakaoTimeEn(raw: string): string | null {
  // "2026. 3. 15. 2:30 PM"
  const match = raw.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)/);
  if (!match) return null;

  const [, year, month, day, hourStr, minute, ampm] = match;
  let hour = parseInt(hourStr, 10);
  if (ampm.toUpperCase() === "PM" && hour < 12) hour += 12;
  if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;

  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00+09:00`;
}

// ─── Sender role assignment ────────────────────────────────

function assignSenderRoles(
  messages: { senderName: string; messageText: string; sentAt: string | null }[],
  selfNameHint?: string,
): ParseResult {
  const nameCount = new Map<string, number>();
  for (const msg of messages) {
    nameCount.set(msg.senderName, (nameCount.get(msg.senderName) || 0) + 1);
  }

  const senderNames = [...nameCount.keys()];

  let selfName: string | null = null;
  if (selfNameHint && nameCount.has(selfNameHint)) {
    selfName = selfNameHint;
  } else if (senderNames.length === 2) {
    // In a 2-person chat, the one who sends more is likely "self"
    const sorted = senderNames.sort((a, b) => (nameCount.get(b) || 0) - (nameCount.get(a) || 0));
    selfName = sorted[0];
  }

  const parsed: ParsedMessage[] = messages.map((msg, index) => ({
    senderRole: selfName
      ? msg.senderName === selfName
        ? "self"
        : "other"
      : "unknown",
    senderName: msg.senderName,
    messageText: msg.messageText,
    sentAt: msg.sentAt,
    sequenceNo: index + 1,
  }));

  return {
    messages: parsed,
    detectedFormat: "unknown",
    senderNames,
    selfName,
  };
}

// ─── Main parser ───────────────────────────────────────────

export function parseChatText(rawText: string, selfNameHint?: string): ParseResult {
  const lines = rawText.split(/\r?\n/);
  const collected: { senderName: string; messageText: string; sentAt: string | null }[] = [];
  let detectedFormat = "generic";
  let currentDateContext: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    // Skip KakaoTalk date headers and system messages
    if (KAKAO_DATE_HEADER_KR.test(trimmed) || KAKAO_DATE_HEADER_EN.test(trimmed)) {
      // Extract date context for bracket format
      const dateMatch = trimmed.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/);
      if (dateMatch) {
        currentDateContext = `${dateMatch[1]}-${dateMatch[2].padStart(2, "0")}-${dateMatch[3].padStart(2, "0")}`;
      }
      continue;
    }
    if (KAKAO_SYSTEM_MSG.test(trimmed)) continue;

    // Try KakaoTalk Korean format
    let match = trimmed.match(KAKAO_LINE_KR);
    if (match) {
      detectedFormat = "kakaotalk-kr";
      collected.push({
        senderName: match[2].trim(),
        messageText: match[3].trim(),
        sentAt: parseKakaoTimeKr(match[1]),
      });
      continue;
    }

    // Try KakaoTalk bracket format
    match = trimmed.match(KAKAO_LINE_BRACKET);
    if (match) {
      detectedFormat = "kakaotalk-bracket";
      collected.push({
        senderName: match[1].trim(),
        messageText: match[3].trim(),
        sentAt: parseKakaoBracketTime(match[2], currentDateContext ?? undefined),
      });
      continue;
    }

    // Try KakaoTalk English format
    match = trimmed.match(KAKAO_LINE_EN);
    if (match) {
      detectedFormat = "kakaotalk-en";
      collected.push({
        senderName: match[2].trim(),
        messageText: match[3].trim(),
        sentAt: parseKakaoTimeEn(match[1]),
      });
      continue;
    }

    // Try generic time + name format
    match = trimmed.match(GENERIC_TIME_NAME);
    if (match) {
      detectedFormat = "generic-time";
      collected.push({
        senderName: match[2].trim(),
        messageText: match[3].trim(),
        sentAt: null,
      });
      continue;
    }

    // Try simple "name: message" format
    match = trimmed.match(SIMPLE_NAME_MSG);
    if (match) {
      const candidateName = match[1].trim();
      // Avoid matching URLs or very long "names"
      if (candidateName.length <= 20 && !candidateName.includes("http") && !candidateName.includes("/")) {
        detectedFormat = "simple";
        collected.push({
          senderName: candidateName,
          messageText: match[2].trim(),
          sentAt: null,
        });
        continue;
      }
    }

    // Continuation line: append to previous message
    if (collected.length > 0) {
      collected[collected.length - 1].messageText += "\n" + trimmed;
    }
  }

  if (collected.length === 0) {
    return {
      messages: [],
      detectedFormat: "unrecognized",
      senderNames: [],
      selfName: null,
    };
  }

  const result = assignSenderRoles(collected, selfNameHint);
  return { ...result, detectedFormat };
}
