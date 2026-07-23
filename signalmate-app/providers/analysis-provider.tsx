import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createEmptyDraft } from '../lib/analysis/draft';
import { draftStorage } from '../lib/analysis/draft-storage';
import { clearCachedImages } from '../lib/analysis/image-cache';
import { analysisInputFingerprint } from '../lib/analysis/fingerprint';
import type { AnalysisDraft, AnalysisResult } from '../lib/analysis/types';

type AnalysisContextValue = {
  hydrated: boolean;
  draft: AnalysisDraft;
  result: AnalysisResult | null;
  updateDraft: (updater: (draft: AnalysisDraft) => AnalysisDraft) => void;
  setResult: (result: AnalysisResult | null) => void;
  resetDraft: () => Promise<void>;
  beginAnalysisRun: () => number;
  isAnalysisRunActive: (runId: number) => boolean;
  cancelAnalysisRun: (runId: number) => void;
  isDraftFingerprintCurrent: (fingerprint: string) => boolean;
};

const AnalysisContext = createContext<AnalysisContextValue | null>(null);
const PERSIST_DEBOUNCE_MS = 150;

export class DraftResetError extends Error {
  readonly code = 'RESET_FAILED';

  constructor() {
    super('새 분석을 준비하지 못했어요.');
    this.name = 'DraftResetError';
  }
}

export function AnalysisProvider({ children }: PropsWithChildren) {
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<AnalysisDraft>(() => createEmptyDraft());
  const [result, setResultState] = useState<AnalysisResult | null>(null);
  const hasCompletedInitialHydration = useRef(false);
  const skipNextPersist = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistenceQueue = useRef(Promise.resolve());
  const mounted = useRef(true);
  const generation = useRef(0);
  const draftRef = useRef(draft);
  const resultRef = useRef(result);
  const analysisRunGeneration = useRef(0);
  const resetInProgress = useRef(false);

  const cancelPendingPersist = useCallback(() => {
    if (persistTimer.current !== null) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
  }, []);

  const enqueueStorageOperation = useCallback(<T,>(operation: () => Promise<T>) => {
    const queuedOperation = persistenceQueue.current.then(operation, operation);
    persistenceQueue.current = queuedOperation.then(
      () => undefined,
      () => undefined,
    );
    return queuedOperation;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelPendingPersist();
      if (hasCompletedInitialHydration.current && !resetInProgress.current) {
        const latestDraft = draftRef.current;
        void enqueueStorageOperation(() => draftStorage.save(latestDraft)).catch(() => {
          // A reload must not expose draft content even when the final flush fails.
        });
      }
    };
  }, [cancelPendingPersist, enqueueStorageOperation]);

  useEffect(() => {
    let active = true;
    const hydrationGeneration = generation.current;

    void draftStorage.load()
      .then((restoredDraft) => {
        if (active && mounted.current && generation.current === hydrationGeneration && restoredDraft) {
          draftRef.current = restoredDraft;
          setDraft(restoredDraft);
        }
      })
      .catch(() => {
        // An unavailable local store must not prevent a new analysis from starting.
      })
      .finally(() => {
        if (active && mounted.current) setHydrated(true);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    if (!hasCompletedInitialHydration.current) {
      hasCompletedInitialHydration.current = true;
      return;
    }

    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }

    cancelPendingPersist();
    const persistenceGeneration = generation.current;
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void enqueueStorageOperation(async () => {
        if (generation.current !== persistenceGeneration) return;
        await draftStorage.save(draft);
      }).catch(() => {
        // Saving locally is best effort; never expose draft content in logs.
      });
    }, PERSIST_DEBOUNCE_MS);

    return cancelPendingPersist;
  }, [cancelPendingPersist, draft, enqueueStorageOperation, hydrated]);

  const updateDraft = useCallback((updater: (currentDraft: AnalysisDraft) => AnalysisDraft) => {
    setDraft((currentDraft) => {
      const currentFingerprint = analysisInputFingerprint(currentDraft);
      const updatedDraft = updater(currentDraft);
      const inputChanged = analysisInputFingerprint(updatedDraft) !== currentFingerprint;
      const nextDraft = {
        ...updatedDraft,
        createdConversation: inputChanged ? null : updatedDraft.createdConversation,
        createdConversationFingerprint: inputChanged
          ? null
          : updatedDraft.createdConversationFingerprint,
        updatedAt: new Date().toISOString(),
      };
      draftRef.current = nextDraft;
      return nextDraft;
    });
  }, []);

  const setResult = useCallback((nextResult: AnalysisResult | null) => {
    resultRef.current = nextResult;
    setResultState(nextResult);
  }, []);

  const beginAnalysisRun = useCallback(() => {
    analysisRunGeneration.current += 1;
    return analysisRunGeneration.current;
  }, []);

  const isAnalysisRunActive = useCallback((runId: number) => (
    mounted.current && analysisRunGeneration.current === runId
  ), []);

  const cancelAnalysisRun = useCallback((runId: number) => {
    if (analysisRunGeneration.current === runId) analysisRunGeneration.current += 1;
  }, []);

  const isDraftFingerprintCurrent = useCallback((fingerprint: string) => (
    analysisInputFingerprint(draftRef.current) === fingerprint
  ), []);

  const resetDraft = useCallback(async () => {
    const snapshot = {
      draft: draftRef.current,
      result: resultRef.current,
      generation: generation.current,
    };
    generation.current = snapshot.generation + 1;
    const resetGeneration = generation.current;
    analysisRunGeneration.current += 1;
    cancelPendingPersist();
    resetInProgress.current = true;

    try {
      await enqueueStorageOperation(async () => {
        try {
          await draftStorage.clear();
        } catch {
          throw new DraftResetError();
        }

        try {
          clearCachedImages();
        } catch {
          try {
            await draftStorage.save(snapshot.draft);
          } catch {
            // Keep the in-memory snapshot and expose only a stable reset error.
          }
          throw new DraftResetError();
        }
      });
    } catch (error) {
      resetInProgress.current = false;
      throw error instanceof DraftResetError ? error : new DraftResetError();
    }

    resetInProgress.current = false;
    if (generation.current !== resetGeneration) return;
    generation.current = resetGeneration + 1;
    if (!mounted.current) return;

    hasCompletedInitialHydration.current = true;
    skipNextPersist.current = true;
    const emptyDraft = createEmptyDraft();
    draftRef.current = emptyDraft;
    resultRef.current = null;
    setDraft(emptyDraft);
    setResultState(null);
    setHydrated(true);
  }, [cancelPendingPersist, enqueueStorageOperation]);

  const value = useMemo<AnalysisContextValue>(() => ({
    hydrated,
    draft,
    result,
    updateDraft,
    setResult,
    resetDraft,
    beginAnalysisRun,
    isAnalysisRunActive,
    cancelAnalysisRun,
    isDraftFingerprintCurrent,
  }), [
    beginAnalysisRun,
    cancelAnalysisRun,
    draft,
    hydrated,
    isAnalysisRunActive,
    isDraftFingerprintCurrent,
    resetDraft,
    result,
    updateDraft,
  ]);

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('useAnalysis must be used within an AnalysisProvider');
  return context;
}
