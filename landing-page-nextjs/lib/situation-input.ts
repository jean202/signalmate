import { buildGuidedSituationContext } from "@/lib/situation-context-builder";

export type SituationInputFocus = "chat" | "meeting_note" | "mixed" | "follow_up";
export type MeetingVibe = "none" | "awkward" | "normal" | "good" | "great";
export type OtherInitiative = "low" | "medium" | "high" | "unknown";
export type AfterMeetingContact =
  | "none"
  | "self_first"
  | "other_first"
  | "slower"
  | "ongoing"
  | "not_applicable";
export type DesiredHelp = "next_message" | "ask_for_date" | "wait_or_send" | "decide_to_stop";

export type GuidedAnswers = {
  inputFocus?: SituationInputFocus;
  meetingCount?: "none" | "once" | "2_3_times" | "4_plus";
  meetingVibe?: MeetingVibe;
  otherInitiative?: OtherInitiative;
  afterMeetingContact?: AfterMeetingContact;
  desiredHelp?: DesiredHelp;
  otherStyle?: (
    | "fast_reply"
    | "slow_reply"
    | "short_messages"
    | "long_messages"
    | "uses_emoji"
    | "unknown"
  )[];
  freeText?: string;
};

const SITUATION_FIRST_FOCUS: SituationInputFocus[] = ["meeting_note", "mixed", "follow_up"];
const MIN_SITUATION_TEXT_LENGTH = 20;
const OFFLINE_MEETING_MARKERS = ["만났", "만남", "소개팅", "데이트", "애프터"];
const FOLLOW_UP_MARKERS = ["분위기", "답장", "연락", "다음 약속", "또 보", "후속"];
const EXPLICIT_FOLLOW_UP_PHRASES = [
  "만남 뒤",
  "만난 뒤",
  "만난 후",
  "이후 연락",
  "후속 연락",
];

export function isSituationFirstFocus(focus: SituationInputFocus | undefined): boolean {
  return focus !== undefined && SITUATION_FIRST_FOCUS.includes(focus);
}

export function hasEnoughSituationInput(params: {
  rawText?: string | null;
  situationContext?: string | null;
  guidedAnswers?: GuidedAnswers | null;
}): boolean {
  const focus = params.guidedAnswers?.inputFocus;
  if (focus === "chat") {
    return false;
  }

  const generatedGuidedContext = params.guidedAnswers
    ? buildGuidedSituationContext(params.guidedAnswers)
    : null;
  const situationContextText = params.situationContext?.trim() ?? "";
  const freeSituationContext =
    generatedGuidedContext && situationContextText.startsWith(generatedGuidedContext)
      ? situationContextText.slice(generatedGuidedContext.length).trim()
      : situationContextText;

  if (freeSituationContext.length >= MIN_SITUATION_TEXT_LENGTH) {
    return true;
  }

  const text = [params.rawText, freeSituationContext, params.guidedAnswers?.freeText]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  const hasStructuredFallback =
    params.guidedAnswers?.meetingVibe !== undefined &&
    params.guidedAnswers.meetingVibe !== "none" &&
    params.guidedAnswers?.afterMeetingContact !== undefined &&
    params.guidedAnswers.afterMeetingContact !== "not_applicable";

  if (hasStructuredFallback) {
    return true;
  }

  if (isSituationFirstFocus(focus)) {
    return text.length >= MIN_SITUATION_TEXT_LENGTH;
  }

  if (text.length >= MIN_SITUATION_TEXT_LENGTH) {
    const hasExplicitFollowUpPhrase = EXPLICIT_FOLLOW_UP_PHRASES.some((phrase) =>
      text.includes(phrase),
    );
    if (hasExplicitFollowUpPhrase) {
      return true;
    }

    const hasOfflineMeetingMarker = OFFLINE_MEETING_MARKERS.some((marker) =>
      text.includes(marker),
    );
    const hasFollowUpMarker = FOLLOW_UP_MARKERS.some((marker) => text.includes(marker));

    return hasOfflineMeetingMarker && hasFollowUpMarker;
  }

  return false;
}
