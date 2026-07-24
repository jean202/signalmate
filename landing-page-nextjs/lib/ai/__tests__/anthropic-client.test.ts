import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInferenceOptions,
  resolveMaxTokens,
} from "@/lib/ai/anthropic-client";

describe("anthropic inference options", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses adaptive thinking with effort for Claude Sonnet 4.6 stages", () => {
    const options = buildInferenceOptions(
      "claude-sonnet-4-6",
      "recommendation_generator",
    );

    expect(options).toMatchObject({
      thinking: {
        type: "adaptive",
        display: "omitted",
      },
      output_config: {
        effort: "medium",
      },
    });
    expect(options).not.toHaveProperty("temperature");
  });

  it("does not send manual thinking budgets to Claude Opus 4.7+", () => {
    const options = buildInferenceOptions("claude-opus-4-7", "agent_iteration");

    expect(options.thinking).toMatchObject({
      type: "adaptive",
      display: "omitted",
    });
    expect(options.thinking).not.toHaveProperty("budget_tokens");
    expect(options).toMatchObject({
      output_config: {
        effort: "medium",
      },
    });
  });

  it("omits non-default sampling parameters for Opus models that reject them", () => {
    const options = buildInferenceOptions("claude-opus-4-8", "signal_enhancer");

    expect(options).not.toHaveProperty("temperature");
    expect(options).not.toHaveProperty("thinking");
  });

  it("omits non-default sampling for Sonnet 5 / Fable 5 on thinking-off stages", () => {
    // signal_enhancer는 thinking off → 비-thinking 경로. 이 모델들은 temperature를 보내면 400.
    for (const model of ["claude-sonnet-5", "claude-fable-5"]) {
      const options = buildInferenceOptions(model, "signal_enhancer");
      expect(options, model).not.toHaveProperty("temperature");
      expect(options, model).not.toHaveProperty("thinking");
    }
  });

  it("keeps manual thinking budgets within max_tokens for Haiku 4.5", () => {
    const options = buildInferenceOptions(
      "claude-haiku-4-5-20251001",
      "deep_report",
    );

    expect(options.thinking).toMatchObject({
      type: "enabled",
      budget_tokens: 2048,
      display: "omitted",
    });
    expect(resolveMaxTokens(3000, "deep_report", "claude-haiku-4-5-20251001")).toBe(
      5304,
    );
  });

  it("never enables thinking when the caller forces tool use", () => {
    // Anthropic API: tool_choice가 도구를 강제하면 thinking을 함께 보낼 수 없다(400).
    const models = [
      "claude-haiku-4-5-20251001",
      "claude-sonnet-4-6",
      "claude-opus-4-8",
    ];
    const stages = ["recommendation_generator", "deep_report"] as const;

    for (const model of models) {
      for (const stage of stages) {
        const options = buildInferenceOptions(model, stage, {
          forcedToolUse: true,
        });
        expect(options, `${model}/${stage}`).not.toHaveProperty("thinking");
        expect(options, `${model}/${stage}`).not.toHaveProperty("output_config");
      }
    }
  });

  it("still applies sampling rules when tool use is forced", () => {
    // temperature를 거부하지 않는 모델은 stage temperature를 유지한다.
    expect(
      buildInferenceOptions("claude-haiku-4-5-20251001", "deep_report", {
        forcedToolUse: true,
      }),
    ).toEqual({ temperature: 0.2 });

    // 비기본 sampling을 거부하는 모델에는 아무것도 보내지 않는다.
    expect(
      buildInferenceOptions("claude-opus-4-8", "deep_report", {
        forcedToolUse: true,
      }),
    ).toEqual({});
  });

  it("lets stage-specific effort override the default", () => {
    vi.stubEnv("ANTHROPIC_EFFORT_RECOMMENDATION", "low");

    expect(
      buildInferenceOptions("claude-sonnet-4-6", "recommendation_generator"),
    ).toMatchObject({
      output_config: {
        effort: "low",
      },
    });
  });
});
