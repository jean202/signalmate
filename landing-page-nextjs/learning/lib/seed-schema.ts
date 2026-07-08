export type SeedCase = {
  summaryText: string;
  situationType: string;
  outcomeLabel: "progressed" | "stalled" | "ended";
  lesson: string;
};

const OUTCOMES = new Set(["progressed", "stalled", "ended"]);
const SITUATION_TYPES = new Set([
  "before_meeting",
  "after_first_date",
  "after_second_date",
  "cooling_down",
]);
const MIN_SUMMARY_LENGTH = 20;

export function validateSeedCase(
  input: unknown,
): { ok: true; value: SeedCase } | { ok: false; reason: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, reason: "not an object" };
  }

  const record = input as Record<string, unknown>;
  const summaryText = typeof record.summaryText === "string" ? record.summaryText.trim() : "";
  if (summaryText.length < MIN_SUMMARY_LENGTH) {
    return { ok: false, reason: `summaryText must be >= ${MIN_SUMMARY_LENGTH} chars` };
  }

  const situationType =
    typeof record.situationType === "string" ? record.situationType.trim() : "";
  if (!SITUATION_TYPES.has(situationType)) {
    return { ok: false, reason: `unknown situationType: ${situationType}` };
  }

  const outcomeLabel = record.outcomeLabel as string;
  if (!OUTCOMES.has(outcomeLabel)) {
    return { ok: false, reason: `unknown outcomeLabel: ${outcomeLabel}` };
  }

  const lesson = typeof record.lesson === "string" ? record.lesson.trim() : "";
  if (lesson.length === 0) {
    return { ok: false, reason: "lesson is required" };
  }

  return {
    ok: true,
    value: {
      summaryText,
      situationType,
      outcomeLabel: outcomeLabel as SeedCase["outcomeLabel"],
      lesson,
    },
  };
}
