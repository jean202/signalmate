"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { parseChatText } from "@/lib/chat-parser";
import { PaymentButton } from "@/components/payment-button";
import styles from "./analysis-experience.module.css";

const sampleConversation = `[오후 8:10] 나: 오늘 잘 들어갔어요?
[오후 8:13] 상대: 네 덕분에요 :) 집 오니까 오늘 얘기했던 전시 생각나네요.
[오후 8:16] 나: 저도요. 생각보다 더 좋았어요.
[오후 8:22] 상대: 맞아요. 다음에 비슷한 곳 또 가도 재밌을 것 같아요.
[오후 8:24] 나: 이번 주말은 어떠세요?
[오후 8:31] 상대: 이번 주말은 조금 애매한데, 다음 주는 괜찮을 것 같아요.`;

const progressSteps = [
  { key: "input", label: "채팅 입력", caption: "대화 붙여넣기" },
  { key: "context", label: "상황 선택", caption: "맥락 보정" },
  { key: "loading", label: "신호 분석", caption: "규칙 + AI" },
  { key: "results", label: "결과 확인", caption: "액션 추천" },
] as const;

const loadingMessages = [
  "답장 흐름과 대화 지속 패턴을 정리하고 있습니다.",
  "질문 비율과 후속 반응의 온도를 읽고 있습니다.",
  "약속 구체성과 다음 액션 후보를 정리하고 있습니다.",
];

const relationshipStageOptions = [
  {
    value: "before_meeting",
    label: "첫 만남 전",
    description: "대화 톤과 기대치가 맞는지 먼저 읽습니다.",
  },
  {
    value: "after_first_date",
    label: "첫 만남 후",
    description: "애프터 가능성과 후속 메시지 톤을 잡습니다.",
  },
  {
    value: "after_second_date",
    label: "두세 번 만남 후",
    description: "관계 진전인지 관성인지 더 분명히 봅니다.",
  },
  {
    value: "cooling_down",
    label: "식어가는 느낌",
    description: "속도를 늦출지, 다시 연결할지 판단합니다.",
  },
] as const;

const meetingChannelOptions = [
  {
    value: "blind_date",
    label: "소개팅",
    description: "예의와 관심이 섞인 초반 대화를 전제로 봅니다.",
  },
  {
    value: "dating_app",
    label: "데이팅 앱",
    description: "탐색형 대화와 이탈 가능성을 함께 고려합니다.",
  },
  {
    value: "mutual_friend",
    label: "지인 소개",
    description: "완전한 낯섦보다 관계 부담이 조금 있는 상황입니다.",
  },
  {
    value: "other",
    label: "기타",
    description: "특정 채널보다 대화 패턴 자체를 중심으로 해석합니다.",
  },
] as const;

const userGoalOptions = [
  {
    value: "evaluate_interest",
    label: "관심 신호 파악",
    description: "예의인지 호감인지 헷갈릴 때 적합합니다.",
  },
  {
    value: "ask_for_date",
    label: "약속 제안 타이밍",
    description: "지금 밀어도 되는지 보고 싶을 때 씁니다.",
  },
  {
    value: "continue_chat",
    label: "대화 이어가기",
    description: "가볍게 온도를 유지할 방법을 찾습니다.",
  },
  {
    value: "decide_to_stop",
    label: "정리할지 판단",
    description: "반응이 흐려질 때 과투자를 막는 용도입니다.",
  },
] as const;

const saveModeOptions = [
  {
    value: "temporary",
    label: "비저장 모드",
    description: "체험 중심. 저장 없이 빠르게 분석합니다.",
  },
  {
    value: "saved",
    label: "저장 예정 모드",
    description: "나중에 저장/재분석 흐름으로 확장할 전제를 둡니다.",
  },
] as const;

type Step = (typeof progressSteps)[number]["key"];
type RelationshipStage = (typeof relationshipStageOptions)[number]["value"];
type MeetingChannel = (typeof meetingChannelOptions)[number]["value"];
type UserGoal = (typeof userGoalOptions)[number]["value"];
type SaveMode = (typeof saveModeOptions)[number]["value"];
type SenderRole = "self" | "other" | "unknown";
type ConfidenceLevel = "low" | "medium" | "high";
type RecommendedAction =
  | "keep_light"
  | "suggest_date"
  | "slow_down"
  | "wait_for_response"
  | "consider_stopping";
type RecommendationType = "next_message" | "tone_guide" | "avoid_phrase";
type SignalType = "positive" | "ambiguous" | "caution";

// "idle"          → SSE 연결 전 (스켈레톤 표시)
// "rules_visible" → rule_complete 수신, Claude 강화 대기 중 (신호 카드 표시 + 펄스)
// "enhancing"     → signals_enhanced 수신, 추천 대기 중
// "complete"      → complete 수신, 모든 버튼 활성화
type StreamPhase = "idle" | "rules_visible" | "enhancing" | "complete";

type StreamingState = {
  analysisId: string | null;
  conversationId: string;
  streamPhase: StreamPhase;
  signals: SignalRecord[];
  recommendations: RecommendationRecord[];
  overallSummary: string;
  positiveSignalCount: number;
  ambiguousSignalCount: number;
  cautionSignalCount: number;
  recommendedAction: RecommendedAction;
  recommendedActionReason: string;
  confidenceLevel: ConfidenceLevel;
  rawText: string;
  messageCount: number;
  relationshipStage: RelationshipStage;
  meetingChannel: MeetingChannel;
  userGoal: UserGoal;
  saveMode: SaveMode;
};

type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};

type ConversationMessageInput = {
  senderRole: SenderRole;
  messageText: string;
  sentAt: string | null;
  sequenceNo: number;
};

type AnalysisRecord = {
  id: string;
  analysisStatus: string;
  overallSummary: string;
  positiveSignalCount: number;
  ambiguousSignalCount: number;
  cautionSignalCount: number;
  confidenceLevel: ConfidenceLevel;
  recommendedAction: RecommendedAction;
  recommendedActionReason: string;
  createdAt: string;
  completedAt: string | null;
};

type SignalRecord = {
  id: string;
  signalType: SignalType;
  signalKey: string;
  title: string;
  description: string;
  evidenceText: string;
  confidenceLevel: ConfidenceLevel;
  displayOrder: number;
};

type RecommendationRecord = {
  id: string;
  recommendationType: RecommendationType;
  title: string;
  content: string;
  rationale: string;
  toneLabel: string | null;
};

type AnalysisSession = {
  conversationId: string;
  analysis: AnalysisRecord;
  signals: SignalRecord[];
  recommendations: RecommendationRecord[];
  rawText: string;
  messageCount: number;
  relationshipStage: RelationshipStage;
  meetingChannel: MeetingChannel;
  userGoal: UserGoal;
  saveMode: SaveMode;
};

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error: {
    code: string;
    message: string;
  } | null;
};

const selfSpeakerTokens = ["나", "저", "me", "self", "mine"];
const otherSpeakerTokens = ["상대", "상대방", "그분", "you", "other"];

const confidenceLabels: Record<ConfidenceLevel, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

const actionLabels: Record<RecommendedAction, string> = {
  keep_light: "가볍게 흐름 이어가기",
  suggest_date: "가벼운 약속 제안",
  slow_down: "속도 조절하기",
  wait_for_response: "한 템포 기다리기",
  consider_stopping: "관계 정리도 고려",
};

const signalLabels: Record<SignalType, string> = {
  positive: "Positive",
  ambiguous: "Ambiguous",
  caution: "Caution",
};

const recommendationLabels: Record<RecommendationType, string> = {
  next_message: "Next message",
  tone_guide: "Tone guide",
  avoid_phrase: "Avoid",
};

const relationshipLabels: Record<RelationshipStage, string> = {
  before_meeting: "첫 만남 전",
  after_first_date: "첫 만남 후",
  after_second_date: "두세 번 만남 후",
  cooling_down: "식어가는 느낌",
};

const meetingLabels: Record<MeetingChannel, string> = {
  blind_date: "소개팅",
  dating_app: "데이팅 앱",
  mutual_friend: "지인 소개",
  other: "기타",
};

const goalLabels: Record<UserGoal, string> = {
  evaluate_interest: "관심 신호 파악",
  ask_for_date: "약속 제안 타이밍",
  continue_chat: "대화 이어가기",
  decide_to_stop: "정리할지 판단",
};

const saveModeLabels: Record<SaveMode, string> = {
  temporary: "비저장 모드",
  saved: "저장 예정 모드",
};

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error?.message || "요청을 처리하지 못했습니다.");
  }

  return payload.data;
}

function inferSenderRole(token: string | undefined): SenderRole {
  if (!token) {
    return "unknown";
  }

  const normalized = token.trim().toLowerCase();

  if (selfSpeakerTokens.includes(normalized)) {
    return "self";
  }

  if (otherSpeakerTokens.includes(normalized)) {
    return "other";
  }

  return "unknown";
}

function parseConversationMessages(rawText: string): ConversationMessageInput[] {
  const result = parseChatText(rawText, "나");
  if (result.messages.length > 0) {
    return result.messages;
  }

  // Fallback: simple line-by-line parsing for minimal input
  return rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const timestampMatch = line.match(/^\[(.*?)\]\s*(.*)$/);
      const body = timestampMatch ? timestampMatch[2].trim() : line;
      const speakerMatch = body.match(/^(나|저|me|self|mine|상대|상대방|그분|you|other)\s*[:：]\s*(.+)$/i);
      const messageText = (speakerMatch?.[2] ?? body).trim();

      return {
        senderRole: inferSenderRole(speakerMatch?.[1]),
        messageText,
        sentAt: null,
        sequenceNo: index + 1,
      };
    })
    .filter((message) => message.messageText.length > 0);
}

function getStepState(step: Step, currentStep: Step) {
  const order: Step[] = ["input", "context", "loading", "results"];
  const stepIndex = order.indexOf(step);
  const currentIndex = order.indexOf(currentStep);

  if (stepIndex < currentIndex) {
    return "done";
  }

  if (stepIndex === currentIndex) {
    return "current";
  }

  return "idle";
}

function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T;
  onChange: (nextValue: T) => void;
}) {
  return (
    <section className={styles.choiceSection}>
      <div className={styles.sectionHeading}>
        <p className={styles.kicker}>{label}</p>
      </div>
      <div className={styles.choiceGrid}>
        {options.map((option) => {
          const isActive = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              className={`${styles.choiceCard} ${isActive ? styles.choiceCardActive : ""}`}
              onClick={() => onChange(option.value)}
              aria-pressed={isActive}
            >
              <strong>{option.label}</strong>
              <span>{option.description}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AnalysisExperience() {
  const [step, setStep] = useState<Step>("input");
  const [rawText, setRawText] = useState("");
  const [relationshipStage, setRelationshipStage] =
    useState<RelationshipStage>("after_first_date");
  const [meetingChannel, setMeetingChannel] = useState<MeetingChannel>("blind_date");
  const [userGoal, setUserGoal] = useState<UserGoal>("evaluate_interest");
  const [saveMode, setSaveMode] = useState<SaveMode>("temporary");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [streamingState, setStreamingState] = useState<StreamingState | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [copiedRecommendationId, setCopiedRecommendationId] = useState<string | null>(null);

  const parsedMessages = parseConversationMessages(rawText);
  const excerptLines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);

  useEffect(() => {
    if (step !== "loading") {
      setLoadingMessageIndex(0);
      return;
    }

    const timer = window.setInterval(() => {
      setLoadingMessageIndex((currentIndex) => (currentIndex + 1) % loadingMessages.length);
    }, 1100);

    return () => {
      window.clearInterval(timer);
    };
  }, [step]);

  useEffect(() => {
    if (!copiedRecommendationId) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCopiedRecommendationId(null);
    }, 1800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [copiedRecommendationId]);

  function handleFillSample() {
    setRawText(sampleConversation);
    setErrorMessage(null);
  }

  function handleMoveToContext() {
    if (parsedMessages.length < 2) {
      setErrorMessage("분석 체험을 위해 최소 2줄 이상의 대화를 붙여넣어 주세요.");
      return;
    }

    setErrorMessage(null);
    setStep("context");
  }

  async function handleRunAnalysis() {
    const messages = parseConversationMessages(rawText);

    if (messages.length < 2) {
      setStep("input");
      setErrorMessage("메시지 수가 너무 적습니다. 최소 2줄 이상 입력해 주세요.");
      return;
    }

    setErrorMessage(null);
    setStreamingState(null);
    setStep("loading");

    try {
      // 1단계: 대화 생성 (서버에서 파싱 + situationContext 병합)
      const conversationResponse = await requestJson<{
        conversation: {
          id: string;
          rawText: string;
          relationshipStage: string;
          meetingChannel: string;
          userGoal: string;
          situationContext?: string | null;
          messages: Array<{ senderRole: string; messageText: string; sentAt: string | null; sequenceNo: number }>;
          messageCount: number;
          saveMode: string;
        };
      }>(
        "/api/v1/conversations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "직접 붙여넣은 대화",
            sourceType: "manual",
            relationshipStage,
            meetingChannel,
            userGoal,
            saveMode,
            rawText,
            selfName: "나",
            messages,
          }),
        },
      );

      const { conversation: createdConversation } = conversationResponse;
      const conversationId = createdConversation.id;

      // 스트리밍 초기 상태 세팅 (스켈레톤 표시용)
      const baseState: StreamingState = {
        analysisId: null,
        conversationId,
        streamPhase: "idle",
        signals: [],
        recommendations: [],
        overallSummary: "",
        positiveSignalCount: 0,
        ambiguousSignalCount: 0,
        cautionSignalCount: 0,
        recommendedAction: "keep_light",
        recommendedActionReason: "",
        confidenceLevel: "low",
        rawText,
        messageCount: createdConversation.messageCount,
        relationshipStage,
        meetingChannel,
        userGoal,
        saveMode,
      };

      // 2단계: SSE 스트림 연결 — 대화 데이터를 인라인으로 포함해 stateless 동작
      // conversationInline을 함께 보내면 서버가 DB 조회 없이 분석 실행 (Vercel 호환)
      const response = await fetch(
        `/api/v1/conversations/${conversationId}/analyses/stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            analysisVersion: "v1",
            conversationInline: {
              rawText: createdConversation.rawText,
              relationshipStage: createdConversation.relationshipStage,
              meetingChannel: createdConversation.meetingChannel,
              userGoal: createdConversation.userGoal,
              situationContext: createdConversation.situationContext ?? null,
              messages: createdConversation.messages,
            },
          }),
        },
      );

      if (!response.ok || !response.body) {
        throw new Error("스트림 연결에 실패했습니다.");
      }

      // 결과 화면 전환 (스켈레톤 상태로 먼저 표시)
      setStreamingState(baseState);
      setStep("results");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // SSE 파싱 루프
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let boundary: number;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);

          let eventType = "message";
          let dataLine = "";

          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            else if (line.startsWith("data: ")) dataLine = line.slice(6).trim();
          }

          if (!dataLine) continue;

          if (eventType === "error") {
            const payload = JSON.parse(dataLine) as { message: string };
            throw new Error(payload.message);
          }

          if (eventType === "progress") {
            const payload = JSON.parse(dataLine) as Record<string, unknown>;

            if (payload.type === "rule_complete") {
              setStreamingState((prev) =>
                prev
                  ? {
                      ...prev,
                      streamPhase: "rules_visible",
                      signals: payload.signals as SignalRecord[],
                      overallSummary: payload.overallSummary as string,
                      positiveSignalCount: payload.positiveSignalCount as number,
                      ambiguousSignalCount: payload.ambiguousSignalCount as number,
                      cautionSignalCount: payload.cautionSignalCount as number,
                      recommendedAction: payload.recommendedAction as RecommendedAction,
                      recommendedActionReason: payload.recommendedActionReason as string,
                      confidenceLevel: payload.confidenceLevel as ConfidenceLevel,
                    }
                  : prev,
              );
            } else if (payload.type === "signals_enhanced") {
              setStreamingState((prev) =>
                prev
                  ? {
                      ...prev,
                      streamPhase: "enhancing",
                      signals: payload.signals as SignalRecord[],
                      overallSummary: payload.overallSummary as string,
                    }
                  : prev,
              );
            } else if (payload.type === "recommendations_ready") {
              setStreamingState((prev) =>
                prev
                  ? {
                      ...prev,
                      recommendations: payload.recommendations as RecommendationRecord[],
                      recommendedActionReason: payload.recommendedActionReason as string,
                    }
                  : prev,
              );
            } else if (payload.type === "complete") {
              setStreamingState((prev) =>
                prev
                  ? {
                      ...prev,
                      analysisId: payload.analysisId as string,
                      streamPhase: "complete",
                    }
                  : prev,
              );
            }
          }
        }
      }
    } catch (error) {
      setStep("context");
      setStreamingState(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "분석 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  async function handleCopyRecommendation(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedRecommendationId(id);
    } catch {
      setCopiedRecommendationId(null);
    }
  }

  function handleRestart() {
    setStreamingState(null);
    setCopiedRecommendationId(null);
    setErrorMessage(null);
    setStep("input");
  }

  return (
    <main className={styles.page}>
      <div className={styles.backgroundGlow} />
      <section className={styles.shell}>
        <header className={styles.topbar}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark}>S</span>
            <span className={styles.brandText}>SignalMate</span>
          </Link>
          <div className={styles.topActions}>
            <span className={styles.demoBadge}>Interactive demo</span>
            <Link href="/#waitlist" className={styles.topLink}>
              Early Access
            </Link>
          </div>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>REAL MVP FLOW</p>
            <h1 className={styles.title}>
              채팅을 붙여넣고,
              <br />
              바로 관계 신호를 확인하세요
            </h1>
            <p className={styles.description}>
              랜딩 설명만 보는 대신 입력, 상황 선택, 분석 로딩, 결과 확인까지 MVP 핵심
              흐름을 한 번에 체험할 수 있도록 구성했습니다.
            </p>
          </div>

          <aside className={styles.trustPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.kicker}>WHY THIS MATTERS</span>
              <strong>신뢰가 먼저인 분석</strong>
            </div>
            <ul className={styles.trustList}>
              <li>상대 마음을 단정하지 않고 대화 패턴을 설명합니다.</li>
              <li>비저장 모드를 기본값으로 두고 체험할 수 있습니다.</li>
              <li>결과는 점수보다 다음 액션 추천까지 연결됩니다.</li>
            </ul>
          </aside>
        </section>

        <nav className={styles.stepRail} aria-label="analysis progress">
          {progressSteps.map((progressStep, index) => {
            const state = getStepState(progressStep.key, step);

            return (
              <div
                key={progressStep.key}
                className={`${styles.stepItem} ${
                  state === "current"
                    ? styles.stepItemCurrent
                    : state === "done"
                      ? styles.stepItemDone
                      : styles.stepItemIdle
                }`}
              >
                <span className={styles.stepIndex}>0{index + 1}</span>
                <div>
                  <strong>{progressStep.label}</strong>
                  <span>{progressStep.caption}</span>
                </div>
              </div>
            );
          })}
        </nav>

        {step === "input" ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.kicker}>STEP 1</p>
                <h2>분석할 대화를 붙여넣으세요</h2>
              </div>
              <button type="button" className={styles.ghostButton} onClick={handleFillSample}>
                샘플 대화 넣기
              </button>
            </div>

            <div className={styles.inputLayout}>
              <div className={styles.inputColumn}>
                <label className={styles.fieldLabel} htmlFor="conversation-input">
                  채팅 텍스트
                </label>
                <textarea
                  id="conversation-input"
                  className={styles.textarea}
                  rows={14}
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder={`예시\n[오후 8:10] 나: 오늘 잘 들어갔어요?\n[오후 8:13] 상대: 네 덕분에요 :)`}
                />
                <div className={styles.metaRow}>
                  <span>{rawText.trim().length} chars</span>
                  <span>{parsedMessages.length} messages detected</span>
                </div>
                <p className={styles.hint}>
                  각 줄 앞에 <code>나:</code>, <code>상대:</code> 같은 화자 표시를 붙이면
                  더 안정적으로 읽습니다. 형식이 완벽하지 않아도 줄 단위로 임시 분석합니다.
                </p>
              </div>

              <aside className={styles.previewCard}>
                <p className={styles.kicker}>LIVE PREVIEW</p>
                <h3>입력 인식 상태</h3>
                <ul className={styles.previewList}>
                  {parsedMessages.slice(0, 4).map((message) => (
                    <li key={message.sequenceNo}>
                      <span className={styles.previewRole}>
                        {message.senderRole === "self"
                          ? "나"
                          : message.senderRole === "other"
                            ? "상대"
                            : "미확인"}
                      </span>
                      <p>{message.messageText}</p>
                    </li>
                  ))}
                  {parsedMessages.length === 0 ? (
                    <li className={styles.previewEmpty}>
                      아직 인식된 메시지가 없습니다. 샘플을 넣거나 직접 붙여넣어 보세요.
                    </li>
                  ) : null}
                </ul>
                <div className={styles.tipCard}>
                  <strong>민감정보 주의</strong>
                  <p>이 체험 플로우는 참고용입니다. 이름, 연락처, 계정 정보는 지운 뒤 넣는 편이 안전합니다.</p>
                </div>
              </aside>
            </div>

            {errorMessage ? <div className={styles.errorBox}>{errorMessage}</div> : null}

            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} onClick={handleMoveToContext}>
                상황 선택으로 이동
              </button>
              <Link href="/" className={styles.secondaryButton}>
                랜딩으로 돌아가기
              </Link>
            </div>
          </section>
        ) : null}

        {step === "context" ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.kicker}>STEP 2</p>
                <h2>해석에 필요한 최소 맥락만 고르세요</h2>
              </div>
              <span className={styles.helperText}>선택지는 짧고 분명해야 합니다.</span>
            </div>

            <div className={styles.contextLayout}>
              <div className={styles.contextColumn}>
                <ChoiceGroup
                  label="관계 단계"
                  options={relationshipStageOptions}
                  value={relationshipStage}
                  onChange={setRelationshipStage}
                />
                <ChoiceGroup
                  label="만남 채널"
                  options={meetingChannelOptions}
                  value={meetingChannel}
                  onChange={setMeetingChannel}
                />
              </div>

              <div className={styles.contextColumn}>
                <ChoiceGroup
                  label="현재 목표"
                  options={userGoalOptions}
                  value={userGoal}
                  onChange={setUserGoal}
                />
                <ChoiceGroup
                  label="저장 방식"
                  options={saveModeOptions}
                  value={saveMode}
                  onChange={setSaveMode}
                />
              </div>
            </div>

            <div className={styles.summaryStrip}>
              <span>{relationshipLabels[relationshipStage]}</span>
              <span>{meetingLabels[meetingChannel]}</span>
              <span>{goalLabels[userGoal]}</span>
              <span>{saveModeLabels[saveMode]}</span>
            </div>

            {errorMessage ? <div className={styles.errorBox}>{errorMessage}</div> : null}

            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} onClick={handleRunAnalysis}>
                분석 시작하기
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setErrorMessage(null);
                  setStep("input");
                }}
              >
                입력 수정하기
              </button>
            </div>
          </section>
        ) : null}

        {step === "loading" ? (
          <section className={`${styles.card} ${styles.loadingCard}`}>
            <p className={styles.kicker}>STEP 3</p>
            <h2>채팅 속 신호를 정리하고 있습니다</h2>
            <p className={styles.loadingDescription}>{loadingMessages[loadingMessageIndex]}</p>
            <div className={styles.loadingMeter} aria-hidden="true">
              <span />
            </div>
            <div className={styles.loadingChecklist}>
              <div className={styles.loadingChecklistItem}>답장 흐름 요약</div>
              <div className={styles.loadingChecklistItem}>질문 비율 정리</div>
              <div className={styles.loadingChecklistItem}>약속 신호 해석</div>
              <div className={styles.loadingChecklistItem}>다음 메시지 초안 생성</div>
            </div>
          </section>
        ) : null}

        {step === "results" && streamingState ? (
          <section className={styles.resultsShell}>
            {/* ── 요약 헤더 ───────────────────────────────────────────────── */}
            <div className={styles.resultsHero}>
              <div>
                <p className={styles.kicker}>STEP 4</p>
                {streamingState.streamPhase === "idle" ? (
                  <div className={styles.skeletonTitle} />
                ) : (
                  <h2>{streamingState.overallSummary}</h2>
                )}
                <p className={styles.resultsDescription}>
                  {streamingState.streamPhase === "idle" ? (
                    <span className={styles.skeletonLine} />
                  ) : (
                    <>
                      추천 액션은{" "}
                      <strong>{actionLabels[streamingState.recommendedAction]}</strong>
                      으로 정리되었습니다. 지금 단계에서는 단정형 판정보다 대화 패턴 기반
                      해석을 먼저 보여주는 흐름입니다.
                    </>
                  )}
                </p>
              </div>
              <aside className={styles.resultsBadgePanel}>
                {streamingState.streamPhase === "idle" ? (
                  <div className={styles.skeletonBadge} />
                ) : (
                  <>
                    <span className={styles.confidenceBadge}>
                      {confidenceLabels[streamingState.confidenceLevel]}
                    </span>
                    <strong>{actionLabels[streamingState.recommendedAction]}</strong>
                    <p>{streamingState.recommendedActionReason}</p>
                  </>
                )}
              </aside>
            </div>

            {/* ── 통계 카드 ───────────────────────────────────────────────── */}
            <div className={styles.statGrid}>
              {streamingState.streamPhase === "idle" ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`${styles.statCard} ${styles.skeletonCard}`} />
                ))
              ) : (
                <>
                  <article className={styles.statCard}>
                    <span>Positive</span>
                    <strong>{streamingState.positiveSignalCount}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>Ambiguous</span>
                    <strong>{streamingState.ambiguousSignalCount}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>Caution</span>
                    <strong>{streamingState.cautionSignalCount}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>Messages</span>
                    <strong>{streamingState.messageCount}</strong>
                  </article>
                </>
              )}
            </div>

            <div className={styles.contextTags}>
              <span>{relationshipLabels[streamingState.relationshipStage]}</span>
              <span>{meetingLabels[streamingState.meetingChannel]}</span>
              <span>{goalLabels[streamingState.userGoal]}</span>
              <span>{saveModeLabels[streamingState.saveMode]}</span>
            </div>

            {/* ── 신호 카드 + 추천 카드 ────────────────────────────────────── */}
            <div className={styles.resultsGrid}>
              {/* 신호 카드 열 */}
              <div className={styles.resultColumn}>
                <div className={styles.resultCard}>
                  <div className={styles.resultCardHeader}>
                    <div>
                      <p className={styles.kicker}>SIGNALS</p>
                      <h3>근거 카드</h3>
                    </div>
                    {streamingState.streamPhase === "rules_visible" ? (
                      <span className={styles.enhancingBadge}>AI 강화 중...</span>
                    ) : null}
                  </div>

                  {streamingState.streamPhase === "idle" ? (
                    <div className={styles.signalList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className={`${styles.signalCard} ${styles.signalCardSkeleton}`}
                          style={{ animationDelay: `${i * 120}ms` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div
                      className={`${styles.signalList} ${
                        streamingState.streamPhase === "rules_visible"
                          ? styles.signalListEnhancing
                          : ""
                      }`}
                    >
                      {streamingState.signals.map((signal, index) => (
                        <article
                          key={`${signal.id}-${streamingState.streamPhase}`}
                          className={styles.signalCard}
                          style={{ animationDelay: `${index * 70}ms` }}
                        >
                          <div className={styles.signalHeader}>
                            <span className={styles.signalType}>
                              {signalLabels[signal.signalType]}
                            </span>
                            <span className={styles.signalConfidence}>
                              {confidenceLabels[signal.confidenceLevel]}
                            </span>
                          </div>
                          <div className={styles.signalCardText}>
                            <h4>{signal.title}</h4>
                            <p>{signal.description}</p>
                            <div className={styles.evidenceBox}>{signal.evidenceText}</div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 추천 카드 열 */}
              <div className={styles.resultColumn}>
                <div className={styles.resultCard}>
                  <div className={styles.resultCardHeader}>
                    <div>
                      <p className={styles.kicker}>NEXT ACTION</p>
                      <h3>추천 메시지와 톤 가이드</h3>
                    </div>
                  </div>

                  {streamingState.recommendations.length === 0 ? (
                    <div className={styles.recommendationList}>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className={styles.recSkeleton}
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className={styles.recommendationList}>
                      {streamingState.recommendations.map((recommendation, index) => {
                        const isCopied = copiedRecommendationId === recommendation.id;
                        return (
                          <article
                            key={recommendation.id}
                            className={styles.recommendationCard}
                            style={{ animationDelay: `${index * 90}ms` }}
                          >
                            <div className={styles.recommendationMeta}>
                              <span>
                                {recommendationLabels[recommendation.recommendationType]}
                              </span>
                              {recommendation.toneLabel ? (
                                <strong>{recommendation.toneLabel}</strong>
                              ) : null}
                            </div>
                            <h4>{recommendation.title}</h4>
                            <p className={styles.recommendationContent}>
                              {recommendation.content}
                            </p>
                            <p className={styles.recommendationReason}>
                              {recommendation.rationale}
                            </p>
                            <button
                              type="button"
                              className={`${styles.copyButton} ${isCopied ? styles.copyButtonActive : ""}`}
                              onClick={() =>
                                handleCopyRecommendation(
                                  recommendation.id,
                                  recommendation.content,
                                )
                              }
                            >
                              {isCopied ? "복사됨" : "문구 복사"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className={styles.resultCard}>
                  <div className={styles.resultCardHeader}>
                    <div>
                      <p className={styles.kicker}>INPUT SNAPSHOT</p>
                      <h3>이번 분석에 사용한 대화</h3>
                    </div>
                    <span className={styles.helperText}>
                      conversationId: {streamingState.conversationId}
                    </span>
                  </div>
                  <div className={styles.excerptBox}>
                    {excerptLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <p className={styles.disclaimer}>
                    채팅 데이터는 분석 후 서버에 저장되지 않으며, 익명화 처리됩니다.
                  </p>
                </div>
              </div>
            </div>

            {/* ── 액션 버튼 (complete 단계에서만 완전 활성화) ───────────── */}
            <div className={styles.actions}>
              {streamingState.analysisId ? (
                <PaymentButton
                  purchaseType="single_analysis"
                  analysisId={streamingState.analysisId}
                />
              ) : null}
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleRestart}
                disabled={streamingState.streamPhase !== "complete"}
              >
                다른 대화 다시 분석
              </button>
              <Link href="/#waitlist" className={styles.secondaryButton}>
                얼리 액세스 등록
              </Link>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
