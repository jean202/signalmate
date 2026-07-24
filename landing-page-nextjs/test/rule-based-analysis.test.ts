import { describe, expect, it } from "vitest";
import { buildRuleBasedAnalysis, buildRuleBaselineScores } from "../lib/rule-based-analysis";
import { ruleAnalysisCases } from "./fixtures/rule-analysis-cases";
import { makeConversationFixture } from "./helpers/make-conversation";

describe("buildRuleBasedAnalysis", () => {
  it.each(ruleAnalysisCases)("$name | $why", ({ input, expect: expected }) => {
    const conversation = makeConversationFixture(input);
    const result = buildRuleBasedAnalysis(conversation);
    const signalKeys = result.signals.map((signal) => signal.signalKey);
    const recommendationTypes = result.recommendations.map(
      (recommendation) => recommendation.recommendationType,
    );

    expect(result.recommendedAction).toBe(expected.recommendedAction);
    expect(result.confidenceLevel).toBe(expected.confidenceLevel);
    expect(result.positiveSignalCount).toBe(expected.counts.positive);
    expect(result.ambiguousSignalCount).toBe(expected.counts.ambiguous);
    expect(result.cautionSignalCount).toBe(expected.counts.caution);
    expect(signalKeys).toEqual(expect.arrayContaining(expected.includeSignalKeys));

    for (const excludedSignalKey of expected.excludeSignalKeys ?? []) {
      expect(signalKeys).not.toContain(excludedSignalKey);
    }

    for (const phrase of expected.summaryIncludes ?? []) {
      expect(result.overallSummary).toContain(phrase);
    }

    expect(recommendationTypes).toEqual(["next_message", "tone_guide", "avoid_phrase"]);
    expect(result.recommendations).toHaveLength(3);
  });

  it("scores baseline dimensions from timed conversation patterns", () => {
    const conversation = makeConversationFixture({
      relationshipStage: "ongoing_chat",
      meetingChannel: "dating_app",
      userGoal: "ask_for_date",
      messages: [
        {
          senderRole: "self",
          messageText: "이번 주말에 잠깐 커피 어떠세요?",
          sentAt: "2026-05-01T10:00:00+09:00",
        },
        {
          senderRole: "other",
          messageText: "이번 주말은 좀 어려워요. 나중에 볼게요",
          sentAt: "2026-05-03T11:00:00+09:00",
        },
        {
          senderRole: "self",
          messageText: "그럼 다음 주 평일은요?",
          sentAt: "2026-05-03T11:05:00+09:00",
        },
        {
          senderRole: "other",
          messageText: "일정 봐야 할 것 같아요",
          sentAt: "2026-05-06T12:00:00+09:00",
        },
      ],
    });

    const scores = buildRuleBaselineScores(conversation);

    expect(scores.responseCadence).toBeLessThan(30);
    expect(scores.questionReciprocity).toBe(50);
    expect(scores.schedulingCommitment).toBeLessThan(60);
    expect(scores.overall).toBeLessThan(60);
  });
});
