import { describe, it, expect } from "vitest";
import {
  buildRuleBasedAnalysis,
  buildRuleBaselineScores,
  stageFromRelationshipStage,
} from "../rule-based-analysis";
import type { StoredConversation } from "../analysis-store";

function makeConversation(
  messages: { role: "self" | "other"; text: string }[],
  overrides?: Partial<StoredConversation>,
): StoredConversation {
  return {
    id: "test-conv-1",
    title: "테스트 대화",
    sourceType: "manual",
    relationshipStage: "after_first_date",
    meetingChannel: "blind_date",
    userGoal: "evaluate_interest",
    saveMode: "temporary",
    rawText: messages.map((m) => `${m.role === "self" ? "나" : "상대"}: ${m.text}`).join("\n"),
    situationContext: null,
    messages: messages.map((m, i) => ({
      senderRole: m.role,
      messageText: m.text,
      sentAt: null,
      sequenceNo: i + 1,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("buildRuleBasedAnalysis", () => {
  it("returns completed analysis with signals and recommendations", () => {
    const conversation = makeConversation([
      { role: "self", text: "오늘 잘 들어갔어요?" },
      { role: "other", text: "네 덕분에요 :) 오늘 얘기했던 전시 생각나네요." },
      { role: "self", text: "저도요. 생각보다 더 좋았어요." },
      { role: "other", text: "다음에 비슷한 곳 또 가도 재밌을 것 같아요." },
      { role: "self", text: "이번 주말은 어떠세요?" },
      { role: "other", text: "이번 주말은 조금 애매한데, 다음 주는 괜찮을 것 같아요." },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.analysisStatus).toBe("completed");
    expect(result.signals.length).toBeGreaterThan(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.overallSummary).toBeTruthy();
    expect(result.conversationId).toBe("test-conv-1");
  });

  it("detects positive signals from responsive conversation", () => {
    const conversation = makeConversation([
      { role: "self", text: "안녕하세요!" },
      { role: "other", text: "안녕하세요! 반갑습니다 😊" },
      { role: "self", text: "프로필 사진 멋지더라요" },
      { role: "other", text: "감사해요! 저도 사진 보고 호감이었어요 ㅎㅎ" },
      { role: "self", text: "커피 좋아하세요?" },
      { role: "other", text: "네! 다음에 같이 가도 좋겠어요" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.positiveSignalCount).toBeGreaterThan(0);
    const positiveSignals = result.signals.filter((s) => s.signalType === "positive");
    expect(positiveSignals.length).toBeGreaterThan(0);
  });

  it("detects caution signals from hedging conversation", () => {
    const conversation = makeConversation([
      { role: "self", text: "주말에 만날까요?" },
      { role: "other", text: "음 주말은 좀 바빠서... 나중에 봐야 할 것 같아요" },
      { role: "self", text: "다음 주는요?" },
      { role: "other", text: "다음 주도 좀 애매한데 일정 확인해볼게요" },
      { role: "self", text: "알겠어요! 편할 때 연락주세요" },
      { role: "other", text: "네 감사해요" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    const cautionSignals = result.signals.filter((s) => s.signalType === "caution");
    expect(cautionSignals.length).toBeGreaterThan(0);
  });

  it("handles minimal conversation", () => {
    const conversation = makeConversation([
      { role: "self", text: "안녕" },
      { role: "other", text: "응" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.analysisStatus).toBe("completed");
    expect(result.confidenceLevel).toBe("low");
  });

  it("assigns correct signal counts", () => {
    const conversation = makeConversation([
      { role: "self", text: "오늘 잘 들어갔어요?" },
      { role: "other", text: "네! 덕분에 즐거웠어요 😊" },
      { role: "self", text: "다음에 또 만나요" },
      { role: "other", text: "좋아요! 다음 주 토요일 어때요?" },
    ]);

    const result = buildRuleBasedAnalysis(conversation);

    const positive = result.signals.filter((s) => s.signalType === "positive").length;
    const ambiguous = result.signals.filter((s) => s.signalType === "ambiguous").length;
    const caution = result.signals.filter((s) => s.signalType === "caution").length;

    expect(result.positiveSignalCount).toBe(positive);
    expect(result.ambiguousSignalCount).toBe(ambiguous);
    expect(result.cautionSignalCount).toBe(caution);
  });

  it("generates recommendations based on user goal", () => {
    const conversation = makeConversation(
      [
        { role: "self", text: "오늘 재밌었어요" },
        { role: "other", text: "저도요! 다음에 또 봐요" },
      ],
      { userGoal: "ask_for_date" },
    );

    const result = buildRuleBasedAnalysis(conversation);

    expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
    result.recommendations.forEach((rec) => {
      expect(rec.title).toBeTruthy();
      expect(rec.content).toBeTruthy();
      expect(rec.rationale).toBeTruthy();
    });
  });
});

describe("stageFromRelationshipStage", () => {
  it("maps known values correctly", () => {
    expect(stageFromRelationshipStage("before_meeting")).toBe("pre_meeting");
    expect(stageFromRelationshipStage("after_first_date")).toBe("after_first");
    expect(stageFromRelationshipStage("after_second_date")).toBe("after_few");
    expect(stageFromRelationshipStage("cooling_down")).toBe("established");
  });

  it("falls back to pre_meeting for unknown values", () => {
    expect(stageFromRelationshipStage(undefined)).toBe("pre_meeting");
    expect(stageFromRelationshipStage("unknown_stage")).toBe("pre_meeting");
  });
});

describe("buildRuleBaselineScores", () => {
  it("does not score logistical scheduling questions as personal question reciprocity", () => {
    const conversation = makeConversation([
      { role: "self", text: "저녁 몇시쯤이 좋으세요?" },
      { role: "other", text: "한 여섯시쯤 어떠세요?" },
    ]);

    const scores = buildRuleBaselineScores(conversation);

    expect(scores.questionReciprocity).toBe(50);
  });

  it("still scores personal curiosity as question reciprocity", () => {
    const conversation = makeConversation([
      { role: "self", text: "오늘 하루 어땠어요?" },
      { role: "other", text: "괜찮았어요. 주말엔 뭐 하셨어요?" },
    ]);

    const scores = buildRuleBaselineScores(conversation);

    expect(scores.questionReciprocity).toBe(100);
  });

  it("does not treat weekend small talk as future scheduling commitment", () => {
    const conversation = makeConversation([
      { role: "other", text: "주말 마무리 잘 하고 계신가요?" },
      { role: "self", text: "카페에 나와있어요." },
      { role: "other", text: "주말은 순식간에 흘러가네요." },
    ]);

    const scores = buildRuleBaselineScores(conversation);

    expect(scores.schedulingCommitment).toBe(50);
  });
});

describe("stage-aware toneDrop threshold", () => {
  function makeConvWithToneDrop(stage: string): StoredConversation {
    // Test math:
    // first half other messages: "안녕하세요 반가워요" (9자), "네 저도 반가워요" (8자) → avg 8.5자
    // second half other messages: "그렇군요 ㅎ" (6자), "네 ㅎㅎ" (4자) → avg 5자
    // 5/8.5 ≈ 0.588 → fires at 0.60 threshold (after_first) but NOT at 0.50 threshold (pre_meeting)
    return makeConversation(
      [
        { role: "other", text: "안녕하세요 반가워요" },   // 9자
        { role: "self",  text: "네 반갑습니다" },
        { role: "other", text: "네 저도 반가워요" },      // 8자
        { role: "self",  text: "저도요" },
        { role: "other", text: "그렇군요 ㅎ" },           // 6자
        { role: "self",  text: "그렇군요" },
        { role: "other", text: "네 ㅎㅎ" },              // 4자
        { role: "self",  text: "연락해요" },
      ],
      { relationshipStage: stage },
    );
  }

  it("does NOT flag toneDrop for pre_meeting (threshold 0.50, drop ~59%)", () => {
    const result = buildRuleBasedAnalysis(makeConvWithToneDrop("before_meeting"));
    const signal = result.signals.find((s) => s.signalKey === "tone_drop");
    expect(signal).toBeUndefined();
  });

  it("flags toneDrop for after_first_date (threshold 0.60, drop ~59%)", () => {
    const result = buildRuleBasedAnalysis(makeConvWithToneDrop("after_first_date"));
    const signal = result.signals.find((s) => s.signalKey === "tone_drop");
    expect(signal).toBeDefined();
  });
});

describe("stage-aware question_balance signal type", () => {
  function makeConvNoQuestions(stage: string): StoredConversation {
    return makeConversation(
      [
        { role: "self",  text: "오늘 어떻게 지냈어요?" },
        { role: "other", text: "바빴어요" },
        { role: "self",  text: "힘들었겠다" },
        { role: "other", text: "네 그랬어요" },
        { role: "self",  text: "이번 주말은요?" },
        { role: "other", text: "아직 모르겠어요" },
      ],
      { relationshipStage: stage },
    );
  }

  it("question_balance is ambiguous for before_meeting", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("before_meeting"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("ambiguous");
  });

  it("question_balance is ambiguous for after_first_date", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("after_first_date"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("ambiguous");
  });

  it("question_balance is caution for after_second_date", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("after_second_date"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("caution");
  });

  it("question_balance is caution for cooling_down", () => {
    const result = buildRuleBasedAnalysis(makeConvNoQuestions("cooling_down"));
    const signal = result.signals.find((s) => s.signalKey === "question_balance");
    expect(signal?.signalType).toBe("caution");
  });
});

describe("emoji_engagement signal", () => {
  it("fires positive signal when warm expression density >= 50% with >= 3 other messages", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕!" },
      { role: "other", text: "안녕 ㅎㅎ" },           // warm: ㅎ ✓
      { role: "self",  text: "오늘 어땠어?" },
      { role: "other", text: "좋았어! 너무 재밌었음" }, // warm: ! ✓
      { role: "self",  text: "나도" },
      { role: "other", text: "ㅋㅋ 진짜로?" },          // warm: ㅋ ✓
      { role: "self",  text: "응응" },
      { role: "other", text: "다음에 또 가자" },         // no warm ✗
    ]);
    // other 4개, warm 포함 3개 → 75% ≥ 50%
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_engagement");
    expect(signal).toBeDefined();
    expect(signal?.signalType).toBe("positive");
  });

  it("does NOT fire when warm density < 50%", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕" },
      { role: "other", text: "응" },
      { role: "self",  text: "오늘 어때?" },
      { role: "other", text: "그냥 그래" },
      { role: "self",  text: "뭐 했어?" },
      { role: "other", text: "집에 있었어" },
      { role: "self",  text: "그렇구나" },
      { role: "other", text: "응 뭐" },
    ]);
    // other 4개, warm 0개 → 0% < 50%
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_engagement");
    expect(signal).toBeUndefined();
  });
});

describe("emoji_drop signal", () => {
  it("fires caution signal when warm density drops sharply from first to second half", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕!" },
      { role: "other", text: "안녕 ㅎㅎ" },     // firstHalf warm ✓
      { role: "self",  text: "어때?" },
      { role: "other", text: "좋아 ㅋㅋ" },     // firstHalf warm ✓
      { role: "self",  text: "뭐 해?" },
      { role: "other", text: "그냥 있어" },      // secondHalf no warm ✗
      { role: "self",  text: "심심하겠다" },
      { role: "other", text: "뭐 그래" },        // secondHalf no warm ✗
    ]);
    // firstHalf density: 2/2 = 1.0 (≥ 0.3)
    // secondHalf density: 0/2 = 0.0 (< 1.0 × 0.6 = 0.6) → fires
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_drop");
    expect(signal).toBeDefined();
    expect(signal?.signalType).toBe("caution");
  });

  it("does NOT fire when firstHalf warm density < 0.3", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕" },
      { role: "other", text: "응" },       // firstHalf no warm ✗
      { role: "self",  text: "어때?" },
      { role: "other", text: "그냥" },     // firstHalf no warm ✗
      { role: "self",  text: "뭐해?" },
      { role: "other", text: "집" },       // secondHalf no warm ✗
      { role: "self",  text: "그래" },
      { role: "other", text: "응" },       // secondHalf no warm ✗
    ]);
    // firstHalf density: 0/2 = 0.0 (< 0.3) → no fire
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_drop");
    expect(signal).toBeUndefined();
  });

  it("does NOT fire when drop is not sharp enough (secondHalf >= firstHalf × 0.6)", () => {
    const conv = makeConversation([
      { role: "self",  text: "안녕!" },
      { role: "other", text: "안녕 ㅎㅎ" },     // firstHalf warm ✓
      { role: "self",  text: "어때?" },
      { role: "other", text: "그냥 그래" },       // firstHalf no warm ✗ → firstHalf density 1/2 = 0.5 (≥ 0.3)
      { role: "self",  text: "뭐 해?" },
      { role: "other", text: "집에 있어 ㅎ" },   // secondHalf warm ✓
      { role: "self",  text: "심심하겠다" },
      { role: "other", text: "뭐 그래" },         // secondHalf no warm ✗ → secondHalf density 1/2 = 0.5 (≥ 0.5 × 0.6 = 0.3)
    ]);
    // firstHalf density: 1/2 = 0.5 (≥ 0.3 ✓)
    // secondHalf density: 1/2 = 0.5 (≥ 0.5 × 0.6 = 0.3 → NOT a sharp drop, should NOT fire)
    const result = buildRuleBasedAnalysis(conv);
    const signal = result.signals.find((s) => s.signalKey === "emoji_drop");
    expect(signal).toBeUndefined();
  });
});

describe("situation-first analysis", () => {
  it("does not create situation signals from general chat rawText when parsed messages exist", () => {
    const conversation = makeConversation(
      [
        { role: "self", text: "오늘 얘기 재밌었어요" },
        { role: "other", text: "저도요 ㅎㅎ 다음에 또 봐요" },
      ],
      {
        relationshipStage: "before_first_date",
        rawText:
          "분위기 좋네요. 다음에 또 얘기해요. 상대가 웃으면서 잘 들어줬고 만남 뒤 내가 먼저 연락했어요.",
        situationContext: null,
      },
    );

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).not.toContain("meeting_positive_vibe");
    expect(signalKeys).not.toContain("meeting_low_reciprocity");
    expect(signalKeys).not.toContain("post_meeting_followup_positive");
    expect(signalKeys).not.toContain("post_meeting_followup_caution");
  });

  it("creates meeting and follow-up signals when there are no parsed chat messages", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText:
        "어제 처음 만났고 대화는 두 시간 정도 이어졌습니다. 상대가 웃으면서 듣긴 했지만 질문은 많지 않았고 다음 약속 이야기는 없었습니다. 집에 와서 내가 먼저 연락했고 답장은 왔지만 짧았습니다.",
      situationContext:
        "입력은 실제 만남 후기 중심입니다. 직접 1번 만났습니다. 만났을 때 분위기는 좋았습니다. 상대 적극성은 낮아 보였습니다. 만남 뒤에는 내가 먼저 연락했습니다. 사용자는 연락을 더 할지 기다릴지 판단하고 싶어합니다.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).toEqual(
      expect.arrayContaining([
        "meeting_positive_vibe",
        "meeting_low_reciprocity",
        "post_meeting_followup_caution",
        "signal_conflict",
      ]),
    );
    expect(result.overallSummary).toContain("만남");
    expect(result.recommendedAction).toBe("slow_down");
  });

  it("treats other-first follow-up as a positive post-meeting signal", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText:
        "어제 만남 분위기가 좋았고 집에 온 뒤 상대가 먼저 잘 들어갔냐고 연락했습니다. 이후에도 연락이 이어지고 있습니다.",
      situationContext:
        "입력은 만남 뒤 연락 흐름 중심입니다. 만났을 때 분위기는 좋았습니다. 만남 뒤에는 상대가 먼저 연락했습니다. 만남 뒤 연락이 이어지고 있습니다.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).toContain("post_meeting_followup_positive");
    expect(result.recommendedAction).toBe("keep_light");
  });

  it("uses situation-based caution summary and action for sparse chats with strong follow-up evidence", () => {
    const conversation = makeConversation(
      [
        { role: "self", text: "오늘 만나서 좋았어요" },
        { role: "other", text: "저도요" },
      ],
      {
        relationshipStage: "after_first_date",
        rawText:
          "짧게 연락은 오갔지만 아직 채팅 기록은 많지 않습니다.",
        situationContext:
          "입력은 만남 후기와 후속 연락 판단입니다. 만났을 때 분위기는 좋았습니다. 상대 적극성은 낮아 보였습니다. 다음 약속 이야기는 없었습니다. 만남 뒤에는 내가 먼저 연락했습니다. 답장은 짧았습니다.",
      },
    );

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).toEqual(
      expect.arrayContaining([
        "meeting_positive_vibe",
        "meeting_low_reciprocity",
        "post_meeting_followup_caution",
      ]),
    );
    expect(result.overallSummary).toContain("만남");
    expect(result.recommendedAction).toBe("slow_down");
    expect(result.recommendedActionReason).toContain("만남 뒤 연락 온도");
  });

  it("does not treat self-first follow-up alone as caution or slow_down", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText: "",
      situationContext:
        "입력은 만남 뒤 연락 흐름 중심입니다. 만났을 때 분위기는 좋았습니다. 만남 뒤에는 내가 먼저 연락했습니다.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).not.toContain("post_meeting_followup_caution");
    expect(result.recommendedAction).not.toBe("slow_down");
  });

  it("keeps slower follow-up as caution and slow_down for structured-only input", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText: "",
      situationContext:
        "입력은 만남 뒤 연락 흐름 중심입니다. 만났을 때 분위기는 좋았습니다. 만남 뒤 연락에서 답장이 느려지거나 짧아졌습니다.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).toContain("post_meeting_followup_caution");
    expect(result.recommendedAction).toBe("slow_down");
  });

  it("does not misread negative meeting notes as positive vibe", () => {
    const conversation = makeConversation([], {
      relationshipStage: "after_first_date",
      rawText:
        "어제 소개팅에서 만났는데 분위기는 좋지 않았어요. 대화가 잘 통하지 않았고 편하지도 않았어요. 답장은 아직 오고 있습니다.",
      situationContext:
        "입력은 실제 만남 후기 중심입니다. 분위기는 좋지 않았어요. 대화가 잘 통하지 않았어요. 편하지 않았어요.",
      messages: [],
    });

    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);

    expect(signalKeys).not.toContain("meeting_positive_vibe");
  });

  it("does not misread contracted negative meeting variants as positive vibe", () => {
    const variants = [
      "분위기는 괜찮지 않았어요.",
      "분위기가 괜찮진 않았어요.",
      "전체적으로 좋진 않았어요.",
      "분위기는 괜찮지  않았어요.",
      "분위기가 괜찮진  않았어요.",
      "솔직히 좋진  않았어요.",
    ];

    for (const note of variants) {
      const conversation = makeConversation([], {
        relationshipStage: "after_first_date",
        rawText: `어제 소개팅에서 만났는데 ${note} 대화도 조금 어색했어요.`,
        situationContext: `입력은 실제 만남 후기 중심입니다. ${note} 대화도 조금 어색했어요.`,
        messages: [],
      });

      const result = buildRuleBasedAnalysis(conversation);
      const signalKeys = result.signals.map((signal) => signal.signalKey);

      expect(signalKeys).not.toContain("meeting_positive_vibe");
    }
  });
});
