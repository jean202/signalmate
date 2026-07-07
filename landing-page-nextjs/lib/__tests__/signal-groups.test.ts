import { describe, expect, it } from "vitest";
import { groupSignalsByContext } from "../signal-groups";

const signal = (signalKey: string) => ({
  id: signalKey,
  signalType: "positive",
  signalKey,
  title: signalKey,
  description: signalKey,
  evidenceText: signalKey,
  confidenceLevel: "medium",
  displayOrder: 1,
});

describe("groupSignalsByContext", () => {
  it("groups meeting, follow-up, conflict, and chat signals", () => {
    const result = groupSignalsByContext([
      signal("reply_continuity"),
      signal("meeting_positive_vibe"),
      signal("post_meeting_followup_caution"),
      signal("signal_conflict"),
    ]);

    expect(result.chat.map((item) => item.signalKey)).toEqual(["reply_continuity"]);
    expect(result.meeting.map((item) => item.signalKey)).toEqual(["meeting_positive_vibe"]);
    expect(result.followUp.map((item) => item.signalKey)).toEqual(["post_meeting_followup_caution"]);
    expect(result.uncertainty.map((item) => item.signalKey)).toEqual(["signal_conflict"]);
  });

  it("keeps input order within each signal group", () => {
    const result = groupSignalsByContext([
      signal("reply_continuity"),
      signal("future_reference"),
      signal("meeting_positive_vibe"),
      signal("meeting_low_reciprocity"),
      signal("post_meeting_followup_positive"),
      signal("post_meeting_followup_caution"),
      signal("signal_conflict"),
      signal("limited_signal"),
    ]);

    expect(result.chat.map((item) => item.signalKey)).toEqual(["reply_continuity", "future_reference"]);
    expect(result.meeting.map((item) => item.signalKey)).toEqual([
      "meeting_positive_vibe",
      "meeting_low_reciprocity",
    ]);
    expect(result.followUp.map((item) => item.signalKey)).toEqual([
      "post_meeting_followup_positive",
      "post_meeting_followup_caution",
    ]);
    expect(result.uncertainty.map((item) => item.signalKey)).toEqual(["signal_conflict", "limited_signal"]);
  });

  it("puts unknown signal keys into chat by default", () => {
    const result = groupSignalsByContext([signal("new_signal")]);

    expect(result.chat.map((item) => item.signalKey)).toEqual(["new_signal"]);
    expect(result.meeting).toEqual([]);
    expect(result.followUp).toEqual([]);
    expect(result.uncertainty).toEqual([]);
  });
});
