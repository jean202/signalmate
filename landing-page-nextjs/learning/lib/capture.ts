import type { StoredConversation } from "@/lib/analysis-store";
import { makeConversationFixture } from "@/test/helpers/make-conversation";

export type CaptureMessage = { sender: "me" | "them"; text: string; sentAt?: string };
export type CaptureContext = Record<string, string>;
export type CaptureLabel = {
  temperature: "cold" | "neutral" | "warm" | "hot";
  topSignal: string;
  nextMove: string;
};

/**
 * 마스킹된 실제 데이팅앱 대화 캡쳐.
 *
 * `context`는 식별정보를 일반화한 사회적 범주 태그(예: job: "대기업 / 사무직").
 * `myLabel`은 Phase 2 블라인드 라벨링에서 채우며 eval 스크립트가 사용.
 * `sentAt`은 ISO 8601 또는 생략.
 */
export type Capture = {
  id: string;
  source?: string;
  context?: CaptureContext;
  relationshipStage?: string;
  meetingChannel?: string;
  userGoal?: string;
  messages: CaptureMessage[];
  myLabel?: CaptureLabel;
};

/**
 * Capture를 엔진의 StoredConversation으로 변환.
 *
 * 기존 테스트 헬퍼 makeConversationFixture를 재사용하되, id/title은 캡쳐 고유값으로 덮어씀.
 * 고정 createdAt/sourceType 등 나머지 픽스처 기본값은 오프라인 분석에 영향 없음.
 */
export function captureToConversation(capture: Capture): StoredConversation {
  const situationContext = capture.context
    ? Object.entries(capture.context)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ")
    : null;

  const conversation = makeConversationFixture({
    relationshipStage: capture.relationshipStage ?? "unknown",
    meetingChannel: capture.meetingChannel ?? "dating_app",
    userGoal: capture.userGoal ?? "build_rapport",
    situationContext,
    messages: capture.messages.map((message) => ({
      senderRole: message.sender === "me" ? "self" : "other",
      messageText: message.text,
      sentAt: message.sentAt ?? null,
    })),
  });

  return {
    ...conversation,
    id: capture.id,
    title: capture.source ?? conversation.title,
  };
}
