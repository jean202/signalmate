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
import type { AnalysisDraft, AnalysisResult } from '../lib/analysis/types';

type AnalysisContextValue = {
  hydrated: boolean;
  draft: AnalysisDraft;
  result: AnalysisResult | null;
  updateDraft: (updater: (draft: AnalysisDraft) => AnalysisDraft) => void;
  setResult: (result: AnalysisResult | null) => void;
  resetDraft: () => Promise<void>;
};

const AnalysisContext = createContext<AnalysisContextValue | null>(null);
const PERSIST_DEBOUNCE_MS = 150;

export function AnalysisProvider({ children }: PropsWithChildren) {
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<AnalysisDraft>(() => createEmptyDraft());
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const hasCompletedInitialHydration = useRef(false);
  const skipNextPersist = useRef(false);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingPersist = useCallback(() => {
    if (persistTimer.current !== null) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
  }, []);

  useEffect(() => {
    let active = true;

    void draftStorage.load()
      .then((restoredDraft) => {
        if (active && restoredDraft) setDraft(restoredDraft);
      })
      .catch(() => {
        // An unavailable local store must not prevent a new analysis from starting.
      })
      .finally(() => {
        if (active) setHydrated(true);
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
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void draftStorage.save(draft).catch(() => {
        // Saving locally is best effort; never expose draft content in logs.
      });
    }, PERSIST_DEBOUNCE_MS);

    return cancelPendingPersist;
  }, [cancelPendingPersist, draft, hydrated]);

  const updateDraft = useCallback((updater: (currentDraft: AnalysisDraft) => AnalysisDraft) => {
    setDraft((currentDraft) => ({
      ...updater(currentDraft),
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const resetDraft = useCallback(async () => {
    cancelPendingPersist();

    let cleanupError: unknown;
    try {
      await draftStorage.clear();
    } catch (error) {
      cleanupError = error;
    }

    try {
      clearCachedImages();
    } catch (error) {
      cleanupError ??= error;
    }

    skipNextPersist.current = true;
    setDraft(createEmptyDraft());
    setResult(null);

    if (cleanupError) throw cleanupError;
  }, [cancelPendingPersist]);

  const value = useMemo<AnalysisContextValue>(() => ({
    hydrated,
    draft,
    result,
    updateDraft,
    setResult,
    resetDraft,
  }), [draft, hydrated, resetDraft, result, updateDraft]);

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysis(): AnalysisContextValue {
  const context = useContext(AnalysisContext);
  if (!context) throw new Error('useAnalysis must be used within an AnalysisProvider');
  return context;
}
