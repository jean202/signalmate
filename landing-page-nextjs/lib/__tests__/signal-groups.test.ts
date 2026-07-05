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

  it("puts unknown signal keys into chat by default", () => {
    const result = groupSignalsByContext([signal("new_signal")]);

    expect(result.chat.map((item) => item.signalKey)).toEqual(["new_signal"]);
    expect(result.meeting).toEqual([]);
    expect(result.followUp).toEqual([]);
    expect(result.uncertainty).toEqual([]);
  });
});
