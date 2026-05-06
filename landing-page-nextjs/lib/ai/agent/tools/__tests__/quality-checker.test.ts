import { describe, expect, it } from "vitest";
import { checkQuality } from "@/lib/ai/agent/tools/quality-checker";

const baseParams = {
  rawText: "나: 오늘 즐거웠어요\n상대: 저도요 ㅎㅎ 다음에 또 봐요",
  relationshipStage: "after_first_date",
  overallSummary: "대화가 이어지고 있지만 아직 과한 단정은 이릅니다.",
  recommendedAction: "keep_light",
  signals: [
    {
      signalType: "positive",
      signalKey: "reply_continuity",
      title: "대화가 이어지고 있어요",
      description: "상대가 답장을 이어가고 있어요.",
      evidenceText: "\"저도요 ㅎㅎ\"",
    },
  ],
  recommendations: [
    {
      recommendationType: "next_message",
      title: "가벼운 답장",
      content: "저도 즐거웠어요 ㅎㅎ 다음에 또 편하게 얘기해요.",
      rationale: "상대가 다음을 열어두었기 때문에 부담 낮은 답장이 적절해요.",
    },
    {
      recommendationType: "tone_guide",
      title: "여유 있는 톤",
      content: "가볍고 여유 있게 이어가세요. 약속을 바로 확정하기보다 반응을 보세요.",
      rationale: "아직 초반이라 부담을 낮추는 편이 좋아요.",
    },
    {
      recommendationType: "avoid_phrase",
      title: "압박 표현 피하기",
      content: "\"왜 답장 안 해요?\" 같은 재촉 표현은 피하세요.",
      rationale: "상대가 부담을 느낄 수 있어요.",
    },
  ],
};

describe("checkQuality", () => {
  it("fails when quoted evidence is not found in the raw conversation", () => {
    const result = checkQuality({
      ...baseParams,
      signals: [
        {
          ...baseParams.signals[0],
          evidenceText: "\"다음 주 토요일에 꼭 봐요\"",
        },
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.join("\n")).toContain("인용 근거가 원문에 없습니다");
  });

  it("fails pressure-heavy next messages", () => {
    const result = checkQuality({
      ...baseParams,
      recommendations: [
        {
          ...baseParams.recommendations[0],
          content: "왜 답장 안 해요? 지금 바로 답장해 주세요.",
        },
        baseParams.recommendations[1],
        baseParams.recommendations[2],
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.join("\n")).toContain("압박성 다음 메시지");
  });

  it("fails early-stage overintimacy in next messages", () => {
    const result = checkQuality({
      ...baseParams,
      recommendations: [
        {
          ...baseParams.recommendations[0],
          content: "오늘 이후로 계속 보고 싶어요. 우리 진지하게 만나볼래요?",
        },
        baseParams.recommendations[1],
        baseParams.recommendations[2],
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.join("\n")).toContain("관계 단계 대비 과몰입 표현");
  });

  it("fails very long next messages and warns for moderately long ones", () => {
    const longMessage = "오늘 대화가 정말 좋았고 다음에도 또 얘기하고 싶다는 생각이 들었어요. ".repeat(9);
    const result = checkQuality({
      ...baseParams,
      recommendations: [
        {
          ...baseParams.recommendations[0],
          content: longMessage,
        },
        baseParams.recommendations[1],
        baseParams.recommendations[2],
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.issues.join("\n")).toContain("다음 메시지가 너무 깁니다");
  });

  it("allows avoid_phrase examples that explicitly tell the user to avoid pressure", () => {
    const result = checkQuality({
      ...baseParams,
      recommendations: [
        baseParams.recommendations[0],
        baseParams.recommendations[1],
        {
          ...baseParams.recommendations[2],
          content: "\"답장 올 때까지 계속 연락할게요\" 같은 표현은 피하세요.",
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.recommendedConfidence).toBe("low"); // 시그널 1개 → 데이터 부족
  });

  it("recommends low confidence when there are 3+ warnings", () => {
    const longMessage = "오늘 대화가 정말 좋았고 다음에도 또 얘기하고 싶어요. ".repeat(4);
    const result = checkQuality({
      ...baseParams,
      overallSummary: "짧음",
      signals: [
        {
          signalType: "positive",
          signalKey: "reply_continuity",
          title: "대화가 이어지고 있어요",
          description: "짧",
          evidenceText: "\"저도요 ㅎㅎ\"",
        },
        {
          signalType: "ambiguous",
          signalKey: "warm_tone",
          title: "톤은 따뜻해요",
          description: "짧",
          evidenceText: "\"ㅎㅎ\"",
        },
      ],
      recommendations: [
        { ...baseParams.recommendations[0], content: longMessage },
        baseParams.recommendations[1],
        baseParams.recommendations[2],
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    expect(result.recommendedConfidence).toBe("low");
  });

  it("recommends low confidence when at least half of signals have weak evidence", () => {
    const result = checkQuality({
      ...baseParams,
      signals: [
        {
          signalType: "positive",
          signalKey: "reply_continuity",
          title: "대화가 이어지고 있어요",
          description: "상대가 답장을 이어가고 있어요.",
          evidenceText: "ab", // < 5자: 증거 불충분
        },
        {
          signalType: "ambiguous",
          signalKey: "warm_tone",
          title: "톤은 따뜻해요",
          description: "톤이 부드럽습니다.",
          evidenceText: "\"저도요 ㅎㅎ\"", // 정상
        },
      ],
    });

    expect(result.recommendedConfidence).toBe("low");
  });

  it("does not recommend low confidence for clean analyses with strong evidence", () => {
    const result = checkQuality({
      ...baseParams,
      signals: [
        {
          signalType: "positive",
          signalKey: "reply_continuity",
          title: "대화가 이어지고 있어요",
          description: "상대가 답장을 이어가고 있어요.",
          evidenceText: "\"저도요 ㅎㅎ\"",
        },
        {
          signalType: "ambiguous",
          signalKey: "warm_tone",
          title: "톤은 따뜻해요",
          description: "톤이 부드럽고 자연스러워요.",
          evidenceText: "\"다음에 또 봐요\"",
        },
        {
          signalType: "positive",
          signalKey: "future_reference",
          title: "다음을 언급해요",
          description: "다음 만남을 자연스럽게 언급합니다.",
          evidenceText: "\"다음에 또 봐요\"",
        },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBeLessThan(3);
    expect(result.recommendedConfidence).toBeNull();
  });
});
