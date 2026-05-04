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
  { key: "input", label: "대화 붙여넣기", caption: "카톡 그대로" },
  { key: "context", label: "상황 알려주기", caption: "어떤 사이?" },
  { key: "loading", label: "신호 읽는 중", caption: "잠깐만요" },
  { key: "results", label: "결과 확인", caption: "다음 메시지까지" },
] as const;

const loadingMessages = [
  "답장이 어떻게 오가는지 살펴보고 있어요.",
  "서로 얼마나 관심을 가지고 있는지 읽고 있어요.",
  "약속이 잘 잡히고 있는지, 어떤 메시지가 좋을지 정리하고 있어요.",
];

const relationshipStageOptions = [
  {
    value: "before_meeting",
    label: "첫 만남 전",
    description: "아직 만나기 전이에요. 분위기가 잘 맞는지 보고 싶어요.",
  },
  {
    value: "after_first_date",
    label: "첫 만남 후",
    description: "한 번 만나봤어요. 애프터 보낼지 고민돼요.",
  },
  {
    value: "after_second_date",
    label: "두세 번 만남 후",
    description: "몇 번 만났어요. 진짜 관심이 있는 건지 궁금해요.",
  },
  {
    value: "cooling_down",
    label: "식어가는 느낌",
    description: "분위기가 예전 같지 않아요. 어떻게 해야 할지 모르겠어요.",
  },
] as const;

const meetingChannelOptions = [
  {
    value: "blind_date",
    label: "소개팅",
    description: "지인이 소개해준 자리에서 만났어요.",
  },
  {
    value: "dating_app",
    label: "데이팅 앱",
    description: "틴더, 범블, 글램 같은 앱에서 매칭됐어요.",
  },
  {
    value: "mutual_friend",
    label: "지인 소개",
    description: "친구를 통해 알게 된 사이예요.",
  },
  {
    value: "other",
    label: "기타",
    description: "그 외 다른 인연이에요.",
  },
] as const;

const userGoalOptions = [
  {
    value: "evaluate_interest",
    label: "관심이 있는 걸까?",
    description: "예의인지 진짜 관심인지 헷갈려요.",
  },
  {
    value: "ask_for_date",
    label: "지금 만나자고 해도 될까?",
    description: "약속 잡기 좋은 타이밍인지 알고 싶어요.",
  },
  {
    value: "continue_chat",
    label: "대화 어떻게 이어갈까?",
    description: "분위기 유지하면서 가볍게 이어가고 싶어요.",
  },
  {
    value: "decide_to_stop",
    label: "정리해야 할까?",
    description: "반응이 식어가는 것 같아 마음을 정리할지 고민이에요.",
  },
] as const;

const saveModeOptions = [
  {
    value: "temporary",
    label: "저장 안 하기",
    description: "분석만 보고 끝낼게요. 대화는 남기지 않아요.",
  },
  {
    value: "saved",
    label: "저장하기",
    description: "나중에 다시 보고 싶어요. 안전하게 보관해주세요.",
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
            <p className={styles.kicker}>지금 바로 시작</p>
            <h1 className={styles.title}>
              대화를 붙여넣어 보세요
            </h1>
            <p className={styles.description}>
              카카오톡이든 문자든 그대로 복사해서 넣어주세요.
              상황을 골라주시면, 신호 분석부터 다음 메시지 추천까지 한 번에 보여드릴게요.
            </p>
          </div>

          <aside className={styles.trustPanel}>
            <div className={styles.panelHeader}>
              <span className={styles.kicker}>이런 점은 안심하세요</span>
              <strong>편하게 써보세요</strong>
            </div>
            <ul className={styles.trustList}>
              <li>마음을 함부로 단정하지 않아요. 신호를 차근차근 설명해드려요.</li>
              <li>대화 내용은 저장하지 않아요. 가볍게 체험해보세요.</li>
              <li>점수만 보여주는 게 아니라, 어떻게 답할지까지 알려드려요.</li>
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
                <p className={styles.kicker}>1단계</p>
                <h2>분석하고 싶은 대화를 붙여넣어 주세요</h2>
              </div>
              <button type="button" className={styles.ghostButton} onClick={handleFillSample}>
                예시 보기
              </button>
            </div>

            <div className={styles.inputLayout}>
              <div className={styles.inputColumn}>
                <label className={styles.fieldLabel} htmlFor="conversation-input">
                  대화 내용
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
                  <span>{rawText.trim().length}자</span>
                  <span>메시지 {parsedMessages.length}개 인식됨</span>
                </div>
                <p className={styles.hint}>
                  각 줄 앞에 <code>나:</code>, <code>상대:</code> 같은 표시를 붙이면 더 잘 분석돼요.
                  형식이 좀 다르더라도 괜찮으니 편하게 넣어주세요.
                </p>
              </div>

              <aside className={styles.previewCard}>
                <p className={styles.kicker}>실시간 확인</p>
                <h3>이렇게 인식되고 있어요</h3>
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
                      아직 입력된 게 없어요. 예시를 보거나 직접 붙여넣어 주세요.
                    </li>
                  ) : null}
                </ul>
                <div className={styles.tipCard}>
                  <strong>이건 알아두세요</strong>
                  <p>이름, 연락처, 계정 정보 같은 민감한 정보는 지우고 넣어주시면 더 안전해요.</p>
                </div>
              </aside>
            </div>

            {errorMessage ? <div className={styles.errorBox}>{errorMessage}</div> : null}

            <div className={styles.actions}>
              <button type="button" className={styles.primaryButton} onClick={handleMoveToContext}>
                다음으로
              </button>
              <Link href="/" className={styles.secondaryButton}>
                홈으로 돌아가기
              </Link>
            </div>
          </section>
        ) : null}

        {step === "context" ? (
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <p className={styles.kicker}>2단계</p>
                <h2>지금 어떤 상황인지 알려주세요</h2>
              </div>
              <span className={styles.helperText}>딱 맞는 답을 찾아드리려면 필요해요</span>
            </div>

            <div className={styles.contextLayout}>
              <div className={styles.contextColumn}>
                <ChoiceGroup
                  label="지금 어떤 사이세요?"
                  options={relationshipStageOptions}
                  value={relationshipStage}
                  onChange={setRelationshipStage}
                />
                <ChoiceGroup
                  label="어떻게 만나셨어요?"
                  options={meetingChannelOptions}
                  value={meetingChannel}
                  onChange={setMeetingChannel}
                />
              </div>

              <div className={styles.contextColumn}>
                <ChoiceGroup
                  label="가장 궁금한 점이 뭐예요?"
                  options={userGoalOptions}
                  value={userGoal}
                  onChange={setUserGoal}
                />
                <ChoiceGroup
                  label="대화 저장할까요?"
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
                대화 다시 입력
              </button>
            </div>
          </section>
        ) : null}

        {step === "loading" ? (
          <section className={`${styles.card} ${styles.loadingCard}`}>
            <p className={styles.kicker}>3단계</p>
            <h2>대화 속 신호를 읽고 있어요</h2>
            <p className={styles.loadingDescription}>{loadingMessages[loadingMessageIndex]}</p>
            <div className={styles.loadingMeter} aria-hidden="true">
              <span />
            </div>
            <div className={styles.loadingChecklist}>
              <div className={styles.loadingChecklistItem}>답장 흐름 살펴보기</div>
              <div className={styles.loadingChecklistItem}>질문 빈도 확인</div>
              <div className={styles.loadingChecklistItem}>약속 신호 읽기</div>
              <div className={styles.loadingChecklistItem}>다음 메시지 초안 생성</div>
            </div>
          </section>
        ) : null}

        {step === "results" && streamingState ? (
          <section className={styles.resultsShell}>
            {/* ── 요약 헤더 ───────────────────────────────────────────────── */}
            <div className={styles.resultsHero}>
              <div>
                <p className={styles.kicker}>분석 결과</p>
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
                      지금 추천드리는 행동은{" "}
                      <strong>{actionLabels[streamingState.recommendedAction]}</strong>
                      이에요. 마음을 함부로 단정하지 않고, 대화에서 보이는 신호를 그대로 보여드릴게요.
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
                    <span>좋은 신호</span>
                    <strong>{streamingState.positiveSignalCount}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>애매한 신호</span>
                    <strong>{streamingState.ambiguousSignalCount}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>조심할 신호</span>
                    <strong>{streamingState.cautionSignalCount}</strong>
                  </article>
                  <article className={styles.statCard}>
                    <span>전체 메시지</span>
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
                      <p className={styles.kicker}>읽어낸 신호</p>
                      <h3>이런 점이 보였어요</h3>
                    </div>
                    {streamingState.streamPhase === "rules_visible" ? (
                      <span className={styles.enhancingBadge}>더 자세히 보는 중...</span>
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
                      <p className={styles.kicker}>이렇게 답해보세요</p>
                      <h3>지금 보내기 좋은 메시지</h3>
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
                      <p className={styles.kicker}>입력한 대화</p>
                      <h3>분석에 쓰인 대화 일부</h3>
                    </div>
                  </div>
                  <div className={styles.excerptBox}>
                    {excerptLines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  <p className={styles.disclaimer}>
                    안심하세요. 입력하신 대화는 분석이 끝나면 서버에 남지 않아요.
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
                다른 대화 분석하기
              </button>
              <Link href="/#waitlist" className={styles.secondaryButton}>
                먼저 써보기 신청
              </Link>
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}
