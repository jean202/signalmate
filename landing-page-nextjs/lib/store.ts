/**
 * Store abstraction layer.
 *
 * USE_DB=true  → PostgreSQL via Prisma (db-store)
 * USE_DB=false → local JSON file    (analysis-store / waitlist-store)
 *
 * All API routes import from this file instead of directly from
 * analysis-store or db-store, so the switch is transparent.
 */

import * as jsonAnalysisStore from "@/lib/analysis-store";
import * as jsonWaitlistStore from "@/lib/waitlist-store";
import * as dbStore from "@/lib/db-store";

function useDb(): boolean {
  return process.env.USE_DB === "true";
}

// ─── Re-export types (always from analysis-store — the canonical types) ──

export type {
  StoredConversation,
  StoredConversationMessage,
  StoredAnalysis,
  StoredSignal,
  StoredRecommendation,
  ConfidenceLevel,
  RecommendedAction,
  AnalysisStatus,
  SignalType,
  RecommendationType,
  SenderRole,
  SaveMode,
} from "@/lib/analysis-store";

// ─── Conversation ────────────────────────────────────────

export const createConversation: typeof jsonAnalysisStore.createConversation = (...args) =>
  useDb() ? dbStore.createConversation(...args) : jsonAnalysisStore.createConversation(...args);

export const getConversation: typeof jsonAnalysisStore.getConversation = (...args) =>
  useDb() ? dbStore.getConversation(...args) : jsonAnalysisStore.getConversation(...args);

export const updateConversation: typeof jsonAnalysisStore.updateConversation = (...args) =>
  useDb() ? dbStore.updateConversation(...args) : jsonAnalysisStore.updateConversation(...args);

export const deleteConversation: typeof jsonAnalysisStore.deleteConversation = (...args) =>
  useDb() ? dbStore.deleteConversation(...args) : jsonAnalysisStore.deleteConversation(...args);

// ─── Analysis ────────────────────────────────────────────

export const createAnalysis: typeof jsonAnalysisStore.createAnalysis = (...args) =>
  useDb() ? dbStore.createAnalysis(...args) : jsonAnalysisStore.createAnalysis(...args);

export const getAnalysis: typeof jsonAnalysisStore.getAnalysis = (...args) =>
  useDb() ? dbStore.getAnalysis(...args) : jsonAnalysisStore.getAnalysis(...args);

export const listAnalysisSummaries: typeof jsonAnalysisStore.listAnalysisSummaries = (...args) =>
  useDb() ? dbStore.listAnalysisSummaries(...args) : jsonAnalysisStore.listAnalysisSummaries(...args);

// ─── Waitlist ────────────────────────────────────────────

export const createWaitlistEntry: typeof jsonWaitlistStore.createWaitlistEntry = (...args) =>
  useDb() ? dbStore.createWaitlistEntry(...args) : jsonWaitlistStore.createWaitlistEntry(...args);
