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

export function isSituationFirstFocus(focus: SituationInputFocus | undefined): boolean {
  return focus !== undefined && SITUATION_FIRST_FOCUS.includes(focus);
}

export function hasEnoughSituationInput(params: {
  rawText?: string | null;
  situationContext?: string | null;
  guidedAnswers?: GuidedAnswers | null;
}): boolean {
  const focus = params.guidedAnswers?.inputFocus;
  if (!isSituationFirstFocus(focus)) {
    return false;
  }

  const text = [params.rawText, params.situationContext, params.guidedAnswers?.freeText]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ");

  if (text.length >= MIN_SITUATION_TEXT_LENGTH) {
    return true;
  }

  return Boolean(
    params.guidedAnswers?.meetingVibe &&
      params.guidedAnswers.meetingVibe !== "none" &&
      params.guidedAnswers?.afterMeetingContact &&
      params.guidedAnswers.afterMeetingContact !== "not_applicable",
  );
}
