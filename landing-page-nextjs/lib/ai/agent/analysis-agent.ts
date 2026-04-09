import { randomUUID } from "node:crypto";
import type { MessageParam, Tool } from "@anthropic-ai/sdk/resources/messages";
import { getAnthropicClient, getModelName } from "@/lib/ai/anthropic-client";
import { trackUsage } from "@/lib/ai/token-tracker";
import { analyzeTimeline } from "@/lib/ai/agent/tools/timeline";
import { detectToneShift } from "@/lib/ai/agent/tools/tone-shift";
import { matchPatterns } from "@/lib/ai/agent/tools/pattern-matcher";
import { searchSimilar } from "@/lib/ai/agent/tools/similar-search";
import { checkQuality } from "@/lib/ai/agent/tools/quality-checker";
import type {
  StoredConversation,
  StoredAnalysis,
  StoredSignal,
  StoredRecommendation,
} from "@/lib/analysis-store";

// ─── 에이전트 도구 정의 ─────────────────────────────

const agentTools: Tool[] = [
  {
    name: "analyze_timeline",
    description: "메시지 시간 패턴을 분석합니다. 대화 시작자, 연속 발화, 메시지 길이 추이, 대화 마무리 방식을 파악합니다.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "detect_tone_shift",
    description: "대화 전반부와 후반부의 톤 변화를 감지합니다. 상대의 긍정 표현, 유보적 표현, 이모지 사용 변화를 비교합니다.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "match_patterns",
    description: "규칙 기반 엔진으로 시그널을 감지합니다. 응답 연속성, 미래 언급, 질문 균형 등 16가지 패턴을 매칭합니다.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_similar",
    description: "벡터 DB에서 유사한 대화 패턴을 검색합니다. 과거 분석 결과의 outcome 통계를 집계합니다. OPENAI_API_KEY가 없으면 건너뜁니다.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "check_quality",
    description: "최종 분석 결과의 품질을 검증합니다. 유해 조언, 시그널-증거 일관성, 추천 액션 일관성을 체크합니다. submit_result 전에 반드시 호출하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        signals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              signalType: { type: "string", enum: ["positive", "ambiguous", "caution"] },
              signalKey: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              evidenceText: { type: "string" },
            },
            required: ["signalType", "signalKey", "title", "description", "evidenceText"],
          },
        },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              recommendationType: { type: "string", enum: ["next_message", "tone_guide", "avoid_phrase"] },
              title: { type: "string" },
              content: { type: "string" },
              rationale: { type: "string" },
              toneLabel: { type: "string" },
            },
            required: ["recommendationType", "title", "content", "rationale", "toneLabel"],
          },
        },
        overallSummary: { type: "string" },
        recommendedAction: { type: "string" },
      },
      required: ["signals", "recommendations", "overallSummary", "recommendedAction"],
    },
  },
  {
    name: "submit_result",
    description: "최종 분석 결과를 제출합니다. check_quality를 먼저 호출하고, 통과한 후에만 사용하세요.",
    input_schema: {
      type: "object" as const,
      properties: {
        overallSummary: {
          type: "string",
          description: "전체 분석 요약. 2~3문장. 한국어만 사용.",
        },
        confidenceLevel: {
          type: "string",
          enum: ["low", "medium", "high"],
        },
        recommendedAction: {
          type: "string",
          enum: ["keep_light", "suggest_date", "slow_down", "wait_for_response", "consider_stopping"],
        },
        recommendedActionReason: {
          type: "string",
          description: "추천 액션의 이유. 1~2문장. 한국어만 사용.",
        },
        signals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              signalType: { type: "string", enum: ["positive", "ambiguous", "caution"] },
              signalKey: { type: "string" },
              title: { type: "string", description: "15~25자. 한국어만." },
              description: { type: "string", description: "2~3문장. 한국어만. 문장 완결." },
              evidenceText: { type: "string", description: "대화 인용 또는 패턴 요약. 한국어만." },
              confidenceLevel: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["signalType", "signalKey", "title", "description", "evidenceText", "confidenceLevel"],
          },
        },
        recommendations: {
          type: "array",
          minItems: 3,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              recommendationType: { type: "string", enum: ["next_message", "tone_guide", "avoid_phrase"] },
              title: { type: "string", description: "10~20자. 한국어만." },
              content: { type: "string", description: "한국어만. 문장 완결." },
              rationale: { type: "string", description: "1~2문장. 한국어만." },
              toneLabel: { type: "string" },
            },
            required: ["recommendationType", "title", "content", "rationale", "toneLabel"],
          },
        },
      },
      required: ["overallSummary", "confidenceLevel", "recommendedAction", "recommendedActionReason", "signals", "recommendations"],
    },
  },
];

// ─── 시스템 프롬프트 ─────────────────────────────────

const AGENT_SYSTEM_PROMPT = `당신은 한국의 연애 대화를 다각도로 분석하는 AI 에이전트입니다.

## 언어 규칙 (최우선)
- **반드시 한국어만 사용합니다.** 일본어, 중국어, 영어 등 다른 언어를 절대 섞지 마세요.
- 모든 문장은 완결된 형태로 끝내세요.

## 분석 절차 (순서대로 도구를 호출하세요)

1. **analyze_timeline** — 메시지 시간 패턴 파악
2. **detect_tone_shift** — 전후반 톤 변화 감지
3. **match_patterns** — 규칙 엔진으로 시그널 매칭
4. **search_similar** — 유사 대화 패턴 검색 (없으면 건너뜀)
5. **check_quality** — 위 결과를 종합한 분석 초안의 품질 검증
6. **submit_result** — 품질 체크 통과 시 최종 결과 제출

## 핵심 원칙

- **증거 기반**: 대화 속 구체적 표현을 근거로 제시
- **점치지 않기**: "사귈 수 있을 거예요" 같은 예측 금지
- **유해 조언 금지**: 스토킹, 집착, 조종을 부추기는 내용 절대 불가
- **한국 연애 문화 맥락**: 소개팅 후 카톡 흐름, 답장 텀, 이모지 사용 등 반영
- **불확실하면 솔직하게**: 데이터가 부족하면 "아직 판단하기 이릅니다"

## 분석 시 고려사항

- 타임라인에서 연속 발화가 많으면 일방적 대화일 수 있음
- 톤 변화가 cooling이면 주의 시그널 추가 고려
- 규칙 엔진 시그널을 기반으로 하되, 타임라인/톤 분석에서 발견한 추가 인사이트를 반영
- 유사 대화 결과가 있으면 통계적 맥락을 참고
- 사용자가 상황 설명을 제공한 경우, 대화에 드러나지 않는 배경 맥락으로 참고하되 대화 텍스트의 증거가 우선
- check_quality에서 경고가 나오면 수정 후 다시 submit

## 출력 제약

- signals: 각 시그널은 title 15~25자, description 2~3문장(40~80자), evidenceText 20~50자
- recommendations: 3개 필수 (next_message, tone_guide, avoid_phrase)
- overallSummary: 2~3문장, 50~100자`;

// ─── 에이전트 실행 ─────────────────────────────────

const MAX_ITERATIONS = 8;

type AgentLog = {
  iteration: number;
  toolName: string;
  durationMs: number;
};

export async function runAgentAnalysis(
  conversation: StoredConversation,
): Promise<Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">> {
  const client = getAnthropicClient();
  const model = getModelName();
  const agentStartTime = Date.now();
  const logs: AgentLog[] = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // 초기 메시지: 대화 정보 전달
  const initialPrompt = buildInitialPrompt(conversation);
  const messages: MessageParam[] = [{ role: "user", content: initialPrompt }];

  let finalResult: SubmitResultInput | null = null;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const iterStart = Date.now();

    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: AGENT_SYSTEM_PROMPT,
      tools: agentTools,
      messages,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // assistant 메시지 추가
    messages.push({ role: "assistant", content: response.content });

    // tool_use 블록 처리
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");

    if (toolUseBlocks.length === 0) {
      // 도구 호출 없이 종료
      console.log(`[agent] Iteration ${iteration}: no tool call, stopping`);
      break;
    }

    const toolResults: MessageParam["content"] = [];

    for (const toolBlock of toolUseBlocks) {
      if (toolBlock.type !== "tool_use") continue;

      const toolStart = Date.now();
      const toolName = toolBlock.name;
      let result: unknown;

      try {
        result = await executeAgentTool(toolName, toolBlock.input, conversation);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
      }

      const toolDuration = Date.now() - toolStart;
      logs.push({ iteration, toolName, durationMs: toolDuration });
      console.log(`[agent] Iteration ${iteration}: ${toolName} (${toolDuration}ms)`);

      // submit_result인 경우 최종 결과 저장
      if (toolName === "submit_result") {
        const raw = toolBlock.input as Record<string, unknown>;
        // LLM이 signals/recommendations를 배열이 아닌 형태로 보낼 수 있으므로 방어
        finalResult = {
          overallSummary: String(raw.overallSummary || ""),
          confidenceLevel: String(raw.confidenceLevel || "medium"),
          recommendedAction: String(raw.recommendedAction || "keep_light"),
          recommendedActionReason: String(raw.recommendedActionReason || ""),
          signals: Array.isArray(raw.signals) ? raw.signals : [],
          recommendations: Array.isArray(raw.recommendations) ? raw.recommendations : [],
        } as SubmitResultInput;
        console.log(`[agent] submit_result: ${finalResult.signals.length} signals, ${finalResult.recommendations.length} recommendations`);
      }

      (toolResults as unknown[]).push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: JSON.stringify(result),
      });
    }

    messages.push({ role: "user", content: toolResults as MessageParam["content"] });

    // submit_result가 호출되었으면 종료
    if (finalResult) {
      console.log(`[agent] Completed at iteration ${iteration}`);
      break;
    }

    // stop_reason이 end_turn이면 종료
    if (response.stop_reason === "end_turn") {
      console.log(`[agent] End turn at iteration ${iteration}`);
      break;
    }
  }

  const totalDuration = Date.now() - agentStartTime;

  // 토큰 사용량 기록
  await trackUsage({
    modelName: model,
    chainStep: "agent_loop",
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    durationMs: totalDuration,
    success: !!finalResult,
  }).catch(() => {});

  console.log(
    `[agent] Total: ${totalDuration}ms, ${logs.length} tool calls, ${totalInputTokens + totalOutputTokens} tokens`,
  );

  // 결과가 없으면 fallback
  if (!finalResult) {
    console.warn("[agent] No submit_result received, falling back to rule-based");
    const { buildRuleBasedAnalysis } = await import("@/lib/rule-based-analysis");
    return buildRuleBasedAnalysis(conversation, { modelName: "rule-based-dev (fallback: agent-no-submit)" });
  }

  return buildStoredAnalysis(conversation, finalResult, logs);
}

// ─── 도구 실행 라우터 ────────────────────────────────

async function executeAgentTool(
  toolName: string,
  input: unknown,
  conversation: StoredConversation,
): Promise<unknown> {
  switch (toolName) {
    case "analyze_timeline":
      return analyzeTimeline(conversation.messages);

    case "detect_tone_shift":
      return detectToneShift(conversation.messages);

    case "match_patterns":
      return matchPatterns(conversation);

    case "search_similar": {
      const selfCount = conversation.messages.filter((m) => m.senderRole === "self").length;
      const otherCount = conversation.messages.filter((m) => m.senderRole === "other").length;
      return searchSimilar({
        relationshipStage: conversation.relationshipStage,
        meetingChannel: conversation.meetingChannel,
        userGoal: conversation.userGoal,
        messageCount: conversation.messages.length,
        selfCount,
        otherCount,
        positiveSignalCount: 0,
        ambiguousSignalCount: 0,
        cautionSignalCount: 0,
        signalTitles: [],
        overallSummary: "",
        excludeConversationId: conversation.id,
      });
    }

    case "check_quality": {
      const params = input as {
        signals: { signalType: string; signalKey: string; title: string; description: string; evidenceText: string }[];
        recommendations: { title: string; content: string; rationale: string }[];
        overallSummary: string;
        recommendedAction: string;
      };
      return checkQuality({ ...params, rawText: conversation.rawText });
    }

    case "submit_result":
      return { status: "accepted", message: "분석 결과가 제출되었습니다." };

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── 헬퍼 함수 ──────────────────────────────────────

function buildInitialPrompt(conversation: StoredConversation): string {
  const situationBlock = conversation.situationContext
    ? `\n## 사용자가 제공한 상황 설명\n(대화 텍스트에 나타나지 않는 배경 맥락입니다. 참고하되, 대화 텍스트의 증거가 우선합니다.)\n${conversation.situationContext}\n`
    : "";

  return `다음 대화를 분석해주세요.

## 대화 원문
${conversation.rawText}

## 관계 컨텍스트
- 관계 단계: ${conversation.relationshipStage}
- 만남 경로: ${conversation.meetingChannel}
- 사용자 목표: ${conversation.userGoal}
- 메시지 수: ${conversation.messages.length}개
${situationBlock}

도구들을 순서대로 호출하여 다각도 분석을 진행해주세요.`;
}

type SubmitResultInput = {
  overallSummary: string;
  confidenceLevel: string;
  recommendedAction: string;
  recommendedActionReason: string;
  signals: {
    signalType: string;
    signalKey: string;
    title: string;
    description: string;
    evidenceText: string;
    confidenceLevel: string;
  }[];
  recommendations: {
    recommendationType: string;
    title: string;
    content: string;
    rationale: string;
    toneLabel: string;
  }[];
};

function buildStoredAnalysis(
  conversation: StoredConversation,
  result: SubmitResultInput,
  logs: AgentLog[],
): Omit<StoredAnalysis, "id" | "createdAt" | "completedAt"> {
  const signals: StoredSignal[] = result.signals.map((s, i) => ({
    id: randomUUID(),
    signalType: s.signalType as StoredSignal["signalType"],
    signalKey: s.signalKey,
    title: s.title,
    description: s.description,
    evidenceText: s.evidenceText,
    confidenceLevel: s.confidenceLevel as StoredSignal["confidenceLevel"],
    displayOrder: i + 1,
  }));

  const recommendations: StoredRecommendation[] = result.recommendations.map((r, i) => ({
    id: randomUUID(),
    recommendationType: r.recommendationType as StoredRecommendation["recommendationType"],
    title: r.title,
    content: r.content,
    rationale: r.rationale,
    toneLabel: r.toneLabel || null,
    displayOrder: i + 1,
  }));

  const positiveSignalCount = signals.filter((s) => s.signalType === "positive").length;
  const ambiguousSignalCount = signals.filter((s) => s.signalType === "ambiguous").length;
  const cautionSignalCount = signals.filter((s) => s.signalType === "caution").length;

  return {
    conversationId: conversation.id,
    analysisVersion: "v1",
    modelName: `agent-v1 (${logs.length} tool calls)`,
    overallSummary: result.overallSummary,
    positiveSignalCount,
    ambiguousSignalCount,
    cautionSignalCount,
    confidenceLevel: result.confidenceLevel as StoredAnalysis["confidenceLevel"],
    recommendedAction: result.recommendedAction as StoredAnalysis["recommendedAction"],
    recommendedActionReason: result.recommendedActionReason,
    analysisStatus: "completed",
    signals,
    recommendations,
  };
}
