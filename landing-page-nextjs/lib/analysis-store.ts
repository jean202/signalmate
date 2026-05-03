import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type SenderRole = "self" | "other" | "unknown";
export type SaveMode = "temporary" | "saved";
export type ConfidenceLevel = "low" | "medium" | "high";
export type RecommendedAction =
  | "keep_light"
  | "suggest_date"
  | "slow_down"
  | "wait_for_response"
  | "consider_stopping";
export type AnalysisStatus = "queued" | "processing" | "completed" | "failed";
export type SignalType = "positive" | "ambiguous" | "caution";
export type RecommendationType = "next_message" | "tone_guide" | "avoid_phrase";

export type StoredConversationMessage = {
  senderRole: SenderRole;
  messageText: string;
  sentAt: string | null;
  sequenceNo: number;
};

export type StoredConversation = {
  id: string;
  title: string | null;
  sourceType: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode: SaveMode;
  rawText: string;
  situationContext: string | null;
  messages: StoredConversationMessage[];
  createdAt: string;
  updatedAt: string;
};

export type StoredSignal = {
  id: string;
  signalType: SignalType;
  signalKey: string;
  title: string;
  description: string;
  evidenceText: string;
  confidenceLevel: ConfidenceLevel;
  displayOrder: number;
};

export type StoredRecommendation = {
  id: string;
  recommendationType: RecommendationType;
  title: string;
  content: string;
  rationale: string;
  toneLabel: string | null;
  displayOrder: number;
};

export type StoredAnalysis = {
  id: string;
  conversationId: string;
  analysisVersion: string;
  modelName: string;
  overallSummary: string;
  positiveSignalCount: number;
  ambiguousSignalCount: number;
  cautionSignalCount: number;
  confidenceLevel: ConfidenceLevel;
  recommendedAction: RecommendedAction;
  recommendedActionReason: string;
  analysisStatus: AnalysisStatus;
  signals: StoredSignal[];
  recommendations: StoredRecommendation[];
  createdAt: string;
  completedAt: string | null;
};

type AnalysisStore = {
  conversations: StoredConversation[];
  analyses: StoredAnalysis[];
};

type ConversationCreateInput = {
  title?: string | null;
  sourceType?: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode?: SaveMode;
  rawText: string;
  situationContext?: string | null;
  userId?: string | null;
  messages: StoredConversationMessage[];
};

type ConversationUpdateInput = {
  title?: string;
  saveMode?: SaveMode;
};

type AnalysisCreateInput = Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">;

// Vercel Lambda의 /var/task는 읽기 전용. /tmp는 쓰기 가능 (Lambda당 512MB).
// 로컬 개발에서는 process.cwd()/data를 유지.
const dataDirectory =
  process.env.NODE_ENV === "production"
    ? "/tmp/signalmate-data"
    : path.join(process.cwd(), "data");
const analysisStoreFilePath = path.join(dataDirectory, "analysis-dev.json");

async function ensureStoreExists() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    const file = await readFile(analysisStoreFilePath, "utf8");
    const parsed = JSON.parse(file) as Partial<AnalysisStore>;

    if (!Array.isArray(parsed.conversations) || !Array.isArray(parsed.analyses)) {
      throw new Error("Invalid analysis store shape.");
    }
  } catch {
    await writeFile(
      analysisStoreFilePath,
      `${JSON.stringify({ conversations: [], analyses: [] }, null, 2)}\n`,
      "utf8",
    );
  }
}

async function readStore(): Promise<AnalysisStore> {
  await ensureStoreExists();

  const file = await readFile(analysisStoreFilePath, "utf8");
  const parsed = JSON.parse(file) as Partial<AnalysisStore>;

  return {
    conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
    analyses: Array.isArray(parsed.analyses) ? parsed.analyses : [],
  };
}

async function writeStore(store: AnalysisStore) {
  await writeFile(analysisStoreFilePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function createConversation(input: ConversationCreateInput) {
  const store = await readStore();
  const now = new Date().toISOString();

  const conversation: StoredConversation = {
    id: randomUUID(),
    title: input.title?.trim() || "직접 붙여넣은 대화",
    sourceType: input.sourceType?.trim() || "manual",
    relationshipStage: input.relationshipStage,
    meetingChannel: input.meetingChannel,
    userGoal: input.userGoal,
    saveMode: input.saveMode ?? "temporary",
    rawText: input.rawText.trim(),
    situationContext: input.situationContext?.trim() || null,
    messages: [...input.messages].sort((left, right) => left.sequenceNo - right.sequenceNo),
    createdAt: now,
    updatedAt: now,
  };

  store.conversations.push(conversation);
  await writeStore(store);

  return conversation;
}

export async function getConversation(conversationId: string) {
  const store = await readStore();
  return store.conversations.find((conversation) => conversation.id === conversationId) ?? null;
}

export async function updateConversation(conversationId: string, input: ConversationUpdateInput) {
  const store = await readStore();
  const conversation = store.conversations.find((item) => item.id === conversationId);

  if (!conversation) {
    return null;
  }

  if (typeof input.title === "string") {
    conversation.title = input.title.trim() || conversation.title;
  }

  if (input.saveMode) {
    conversation.saveMode = input.saveMode;
  }

  conversation.updatedAt = new Date().toISOString();
  await writeStore(store);

  return conversation;
}

export async function deleteConversation(conversationId: string) {
  const store = await readStore();
  const initialConversationCount = store.conversations.length;

  store.conversations = store.conversations.filter((conversation) => conversation.id !== conversationId);
  store.analyses = store.analyses.filter((analysis) => analysis.conversationId !== conversationId);

  if (store.conversations.length === initialConversationCount) {
    return false;
  }

  await writeStore(store);
  return true;
}

export async function createAnalysis(input: AnalysisCreateInput) {
  const store = await readStore();
  const now = new Date().toISOString();

  const analysis: StoredAnalysis = {
    id: randomUUID(),
    conversationId: input.conversationId,
    analysisVersion: input.analysisVersion,
    modelName: input.modelName,
    overallSummary: input.overallSummary,
    positiveSignalCount: input.positiveSignalCount,
    ambiguousSignalCount: input.ambiguousSignalCount,
    cautionSignalCount: input.cautionSignalCount,
    confidenceLevel: input.confidenceLevel,
    recommendedAction: input.recommendedAction,
    recommendedActionReason: input.recommendedActionReason,
    analysisStatus: input.analysisStatus,
    signals: input.signals,
    recommendations: input.recommendations,
    createdAt: now,
    completedAt: input.analysisStatus === "completed" ? now : null,
  };

  store.analyses.push(analysis);
  await writeStore(store);

  return analysis;
}

export async function getAnalysis(analysisId: string) {
  const store = await readStore();
  return store.analyses.find((analysis) => analysis.id === analysisId) ?? null;
}

export async function listAnalysisSummaries(_userId?: string) {
  const store = await readStore();

  return store.analyses
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map((analysis) => {
      const conversation = store.conversations.find(
        (conversationItem) => conversationItem.id === analysis.conversationId,
      );

      return {
        analysisId: analysis.id,
        conversationTitle: conversation?.title || "직접 붙여넣은 대화",
        overallSummary: analysis.overallSummary,
        recommendedAction: analysis.recommendedAction,
        createdAt: analysis.createdAt,
      };
    });
}
