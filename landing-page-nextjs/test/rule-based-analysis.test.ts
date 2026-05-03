import { describe, expect, it } from "vitest";
import { buildRuleBasedAnalysis } from "../lib/rule-based-analysis";
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
});
