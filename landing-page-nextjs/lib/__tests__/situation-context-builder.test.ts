import { describe, expect, it } from "vitest";
import {
  buildGuidedSituationContext,
  mergeSituationContext,
} from "../situation-context-builder";
import { hasEnoughSituationInput, isSituationFirstFocus } from "../situation-input";

describe("buildGuidedSituationContext", () => {
  it("builds Korean context for meeting-note focused input", () => {
    expect(
      buildGuidedSituationContext({
        inputFocus: "meeting_note",
        meetingCount: "once",
        meetingVibe: "good",
        otherInitiative: "low",
        afterMeetingContact: "self_first",
        desiredHelp: "wait_or_send",
        freeText: "상대가 웃으면서 듣긴 했지만 다음 약속 이야기는 없었습니다.",
      }),
    ).toBe(
      "입력은 실제 만남 후기 중심입니다. 직접 1번 만났습니다. 만났을 때 분위기는 좋았습니다. 상대 적극성은 낮아 보였습니다. 만남 뒤에는 내가 먼저 연락했습니다. 사용자는 연락을 더 할지 기다릴지 판단하고 싶어합니다. 상대가 웃으면서 듣긴 했지만 다음 약속 이야기는 없었습니다.",
    );
  });

  it("merges guided answers and free situation context without exceeding 2000 chars", () => {
    const result = mergeSituationContext("추가로 상대 답장이 짧아졌습니다.", {
      inputFocus: "follow_up",
      afterMeetingContact: "slower",
      desiredHelp: "next_message",
    });

    expect(result).toBe(
      "입력은 만남 뒤 연락 흐름 중심입니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다. 사용자는 다음 메시지를 어떻게 보낼지 알고 싶어합니다. 추가로 상대 답장이 짧아졌습니다.",
    );
    expect(result?.length).toBeLessThanOrEqual(2000);
  });

  it("does not append duplicate free text when guided answers already contain it", () => {
    const result = mergeSituationContext("답장이 갑자기 짧아졌어요.", {
      inputFocus: "follow_up",
      meetingVibe: "good",
      afterMeetingContact: "slower",
      freeText: "답장이 갑자기 짧아졌어요.",
    });

    expect(result).toBe(
      "입력은 만남 뒤 연락 흐름 중심입니다. 만났을 때 분위기는 좋았습니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다. 답장이 갑자기 짧아졌어요.",
    );
  });

  it("does not truncate merged situation context before route validation", () => {
    const freeText = "가".repeat(2100);
    const result = mergeSituationContext(freeText, {
      inputFocus: "follow_up",
      afterMeetingContact: "slower",
    });

    expect(result).toBe(
      `입력은 만남 뒤 연락 흐름 중심입니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다. ${freeText}`,
    );
    expect(result?.length).toBeGreaterThan(2000);
  });
});

describe("situation input helpers", () => {
  it("treats non-chat focus as situation-first", () => {
    expect(isSituationFirstFocus("chat")).toBe(false);
    expect(isSituationFirstFocus("meeting_note")).toBe(true);
    expect(isSituationFirstFocus("mixed")).toBe(true);
    expect(isSituationFirstFocus("follow_up")).toBe(true);
    expect(isSituationFirstFocus(undefined)).toBe(false);
  });

  it("allows analysis when situation text is meaningful even without parsed messages", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아졌습니다.",
      }),
    ).toBe(true);
  });

  it("allows long free text when meeting_note focus is selected", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아졌습니다.",
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    ).toBe(true);
  });

  it("accepts explicit top-level situation context by length even without marker terms", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "",
        situationContext: "서로의 기대와 이후 방향이 조금 달라 보여서 판단이 어렵습니다.",
      }),
    ).toBe(true);
  });

  it("rejects long generic chat text without situation keywords", () => {
    expect(
      hasEnoughSituationInput({
        rawText:
          "오늘은 뭐했어 밥은 먹었어 나도 그냥 집에 있었고 내일은 일찍 일어나야 해서 일찍 잘 것 같아 근데 주말에 볼까 말까는 아직 모르겠어 그냥 얘기만 이어가는 중이야",
      }),
    ).toBe(false);
  });

  it("allows structured fallback when meeting vibe and after-meeting contact are present", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "짧은 메모",
        guidedAnswers: {
          meetingVibe: "good",
          afterMeetingContact: "slower",
        },
      }),
    ).toBe(true);
  });

  it("builds meeting vibe context even without meeting count", () => {
    expect(
      buildGuidedSituationContext({
        meetingVibe: "good",
        afterMeetingContact: "slower",
      }),
    ).toBe(
      "만났을 때 분위기는 좋았습니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다.",
    );
  });

  it("keeps chat-focused input blocked", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "어제 처음 만났고 분위기는 괜찮았지만 만남 뒤 답장이 짧아졌습니다.",
        guidedAnswers: { inputFocus: "chat" },
      }),
    ).toBe(false);
  });

  it("rejects very short non-chat input", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "만났어",
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    ).toBe(false);
  });

  it("rejects merged context when it only adds focus labels to short text", () => {
    expect(
      hasEnoughSituationInput({
        rawText: "만났어",
        situationContext: mergeSituationContext(undefined, {
          inputFocus: "meeting_note",
        }),
        guidedAnswers: { inputFocus: "meeting_note" },
      }),
    ).toBe(false);
  });
});
