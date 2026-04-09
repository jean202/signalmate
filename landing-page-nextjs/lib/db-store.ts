import { prisma } from "@/lib/prisma";
import type {
  AnalysisStatus,
  ConfidenceLevel,
  MeetingChannel,
  RecommendedAction,
  RecommendationType,
  RelationshipStage,
  SaveMode,
  SenderRole,
  SignalType,
  UserGoal,
} from "@prisma/client";
import type {
  StoredAnalysis,
  StoredConversation,
  StoredConversationMessage,
  StoredRecommendation,
  StoredSignal,
} from "@/lib/analysis-store";

// ─── Type mapping helpers (string literals → Prisma enums) ──

function toSenderRole(value: string): SenderRole {
  const valid: SenderRole[] = ["self", "other", "unknown"];
  return valid.includes(value as SenderRole) ? (value as SenderRole) : "unknown";
}

function toSaveMode(value: string): SaveMode {
  return value === "saved" ? "saved" : "temporary";
}

function toRelationshipStage(value: string): RelationshipStage {
  return value as RelationshipStage;
}

function toMeetingChannel(value: string): MeetingChannel {
  return value as MeetingChannel;
}

function toUserGoal(value: string): UserGoal {
  return value as UserGoal;
}

function toConfidenceLevel(value: string): ConfidenceLevel {
  const valid: ConfidenceLevel[] = ["low", "medium", "high"];
  return valid.includes(value as ConfidenceLevel) ? (value as ConfidenceLevel) : "medium";
}

function toRecommendedAction(value: string): RecommendedAction {
  return value as RecommendedAction;
}

function toAnalysisStatus(value: string): AnalysisStatus {
  return value as AnalysisStatus;
}

function toSignalType(value: string): SignalType {
  return value as SignalType;
}

function toRecommendationType(value: string): RecommendationType {
  return value as RecommendationType;
}

// ─── Row → StoredType mappers ────────────────────────────

function toStoredConversation(row: {
  id: string;
  title: string | null;
  sourceType: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode: string;
  rawTextRedacted: string | null;
  situationContext?: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: {
    senderRole: string;
    messageText: string;
    sentAt: Date | null;
    sequenceNo: number;
  }[];
}): StoredConversation {
  return {
    id: row.id,
    title: row.title,
    sourceType: row.sourceType,
    relationshipStage: row.relationshipStage,
    meetingChannel: row.meetingChannel,
    userGoal: row.userGoal,
    saveMode: row.saveMode as StoredConversation["saveMode"],
    rawText: row.rawTextRedacted ?? "",
    situationContext: row.situationContext ?? null,
    messages: row.messages
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((m) => ({
        senderRole: m.senderRole as StoredConversationMessage["senderRole"],
        messageText: m.messageText,
        sentAt: m.sentAt?.toISOString() ?? null,
        sequenceNo: m.sequenceNo,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toStoredAnalysis(row: {
  id: string;
  conversationId: string;
  analysisVersion: string;
  modelName: string | null;
  overallSummary: string;
  positiveSignalCount: number;
  ambiguousSignalCount: number;
  cautionSignalCount: number;
  confidenceLevel: string;
  recommendedAction: string;
  recommendedActionReason: string;
  analysisStatus: string;
  createdAt: Date;
  completedAt: Date | null;
  signals: {
    id: string;
    signalType: string;
    signalKey: string;
    title: string;
    description: string;
    evidenceText: string;
    confidenceLevel: string;
    displayOrder: number;
  }[];
  recommendations: {
    id: string;
    recommendationType: string;
    title: string;
    content: string;
    rationale: string;
    toneLabel: string | null;
    displayOrder: number;
  }[];
}): StoredAnalysis {
  return {
    id: row.id,
    conversationId: row.conversationId,
    analysisVersion: row.analysisVersion,
    modelName: row.modelName ?? "rule-based-dev",
    overallSummary: row.overallSummary,
    positiveSignalCount: row.positiveSignalCount,
    ambiguousSignalCount: row.ambiguousSignalCount,
    cautionSignalCount: row.cautionSignalCount,
    confidenceLevel: row.confidenceLevel as StoredAnalysis["confidenceLevel"],
    recommendedAction: row.recommendedAction as StoredAnalysis["recommendedAction"],
    recommendedActionReason: row.recommendedActionReason,
    analysisStatus: row.analysisStatus as StoredAnalysis["analysisStatus"],
    signals: row.signals
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((s) => ({
        id: s.id,
        signalType: s.signalType as StoredSignal["signalType"],
        signalKey: s.signalKey,
        title: s.title,
        description: s.description,
        evidenceText: s.evidenceText,
        confidenceLevel: s.confidenceLevel as StoredSignal["confidenceLevel"],
        displayOrder: s.displayOrder,
      })),
    recommendations: row.recommendations
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((r) => ({
        id: r.id,
        recommendationType: r.recommendationType as StoredRecommendation["recommendationType"],
        title: r.title,
        content: r.content,
        rationale: r.rationale,
        toneLabel: r.toneLabel,
        displayOrder: r.displayOrder,
      })),
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

// ─── Conversation CRUD ───────────────────────────────────

type ConversationCreateInput = {
  title?: string | null;
  sourceType?: string;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  saveMode?: string;
  rawText: string;
  situationContext?: string | null;
  userId?: string | null;
  messages: StoredConversationMessage[];
};

type ConversationUpdateInput = {
  title?: string;
  saveMode?: string;
};

export async function createConversation(input: ConversationCreateInput): Promise<StoredConversation> {
  const row = await prisma.conversation.create({
    data: {
      title: input.title?.trim() || "직접 붙여넣은 대화",
      sourceType: "manual",
      relationshipStage: toRelationshipStage(input.relationshipStage),
      meetingChannel: toMeetingChannel(input.meetingChannel),
      userGoal: toUserGoal(input.userGoal),
      saveMode: toSaveMode(input.saveMode ?? "temporary"),
      rawTextRedacted: input.rawText.trim(),
      situationContext: input.situationContext?.trim() || null,
      userId: input.userId || null,
      messages: {
        create: input.messages
          .sort((a, b) => a.sequenceNo - b.sequenceNo)
          .map((m) => ({
            senderRole: toSenderRole(m.senderRole),
            messageText: m.messageText,
            sentAt: m.sentAt ? new Date(m.sentAt) : null,
            sequenceNo: m.sequenceNo,
            messageLength: m.messageText.length,
          })),
      },
    },
    include: { messages: true },
  });

  return toStoredConversation(row);
}

export async function getConversation(conversationId: string): Promise<StoredConversation | null> {
  const row = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { sequenceNo: "asc" } } },
  });

  return row ? toStoredConversation(row) : null;
}

export async function updateConversation(
  conversationId: string,
  input: ConversationUpdateInput,
): Promise<StoredConversation | null> {
  try {
    const row = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(typeof input.title === "string" ? { title: input.title.trim() || undefined } : {}),
        ...(input.saveMode ? { saveMode: toSaveMode(input.saveMode) } : {}),
      },
      include: { messages: true },
    });
    return toStoredConversation(row);
  } catch {
    return null;
  }
}

export async function deleteConversation(conversationId: string): Promise<boolean> {
  try {
    await prisma.conversation.delete({ where: { id: conversationId } });
    return true;
  } catch {
    return false;
  }
}

// ─── Analysis CRUD ───────────────────────────────────────

type AnalysisCreateInput = Omit<StoredAnalysis, "id" | "createdAt" | "completedAt">;

export async function createAnalysis(input: AnalysisCreateInput): Promise<StoredAnalysis> {
  const row = await prisma.analysis.create({
    data: {
      conversationId: input.conversationId,
      analysisVersion: input.analysisVersion,
      modelName: input.modelName,
      overallSummary: input.overallSummary,
      positiveSignalCount: input.positiveSignalCount,
      ambiguousSignalCount: input.ambiguousSignalCount,
      cautionSignalCount: input.cautionSignalCount,
      confidenceLevel: toConfidenceLevel(input.confidenceLevel),
      recommendedAction: toRecommendedAction(input.recommendedAction),
      recommendedActionReason: input.recommendedActionReason,
      analysisStatus: toAnalysisStatus(input.analysisStatus),
      completedAt: input.analysisStatus === "completed" ? new Date() : null,
      signals: {
        create: input.signals.map((s) => ({
          signalType: toSignalType(s.signalType),
          signalKey: s.signalKey,
          title: s.title,
          description: s.description,
          evidenceText: s.evidenceText,
          confidenceLevel: toConfidenceLevel(s.confidenceLevel),
          displayOrder: s.displayOrder,
        })),
      },
      recommendations: {
        create: input.recommendations.map((r) => ({
          recommendationType: toRecommendationType(r.recommendationType),
          title: r.title,
          content: r.content,
          rationale: r.rationale,
          toneLabel: r.toneLabel,
          displayOrder: r.displayOrder,
        })),
      },
    },
    include: {
      signals: { orderBy: { displayOrder: "asc" } },
      recommendations: { orderBy: { displayOrder: "asc" } },
    },
  });

  return toStoredAnalysis(row);
}

export async function getAnalysis(analysisId: string): Promise<StoredAnalysis | null> {
  const row = await prisma.analysis.findUnique({
    where: { id: analysisId },
    include: {
      signals: { orderBy: { displayOrder: "asc" } },
      recommendations: { orderBy: { displayOrder: "asc" } },
    },
  });

  return row ? toStoredAnalysis(row) : null;
}

export async function updateAnalysisStatus(
  analysisId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await prisma.analysis.update({
    where: { id: analysisId },
    data: {
      analysisStatus: toAnalysisStatus(status),
      completedAt: status === "completed" || status === "failed" ? new Date() : undefined,
      errorMessage: errorMessage ?? undefined,
    },
  });
}

export async function listAnalysisSummaries(userId?: string) {
  const rows = await prisma.analysis.findMany({
    where: userId ? { conversation: { userId } } : undefined,
    orderBy: { createdAt: "desc" },
    include: { conversation: { select: { title: true } } },
    take: 50,
  });

  return rows.map((row) => ({
    analysisId: row.id,
    conversationTitle: row.conversation.title || "직접 붙여넣은 대화",
    overallSummary: row.overallSummary,
    recommendedAction: row.recommendedAction,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ─── Waitlist ────────────────────────────────────────────

export type WaitlistEntry = {
  id: string;
  email: string;
  source: string;
  note: string | null;
  createdAt: string;
};

export async function createWaitlistEntry(input: {
  email: string;
  source?: string;
  note?: string | null;
}): Promise<{ kind: "created"; entry: WaitlistEntry } | { kind: "duplicate"; entry: WaitlistEntry }> {
  const normalizedEmail = input.email.trim().toLowerCase();

  const existing = await prisma.waitlistSignup.findFirst({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return {
      kind: "duplicate",
      entry: {
        id: existing.id,
        email: existing.email,
        source: existing.source,
        note: existing.note,
        createdAt: existing.createdAt.toISOString(),
      },
    };
  }

  const row = await prisma.waitlistSignup.create({
    data: {
      email: normalizedEmail,
      source: input.source?.trim() || "landing",
      note: input.note?.trim() || null,
    },
  });

  return {
    kind: "created",
    entry: {
      id: row.id,
      email: row.email,
      source: row.source,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    },
  };
}
