import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeRestoredDraft } from './draft';
import type { AnalysisDraft } from './types';

const DRAFT_KEY = 'signalmate.analysis-draft.v1';
type StoragePort = Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;

export function createDraftStorage(storage: StoragePort) {
  return {
    async load(): Promise<AnalysisDraft | null> {
      const raw = await storage.getItem(DRAFT_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as AnalysisDraft;
        if (parsed.version !== 1 || !Array.isArray(parsed.images)) return null;
        return normalizeRestoredDraft(parsed);
      } catch {
        return null;
      }
    },
    save(draft: AnalysisDraft): Promise<void> {
      return storage.setItem(DRAFT_KEY, JSON.stringify(draft));
    },
    clear(): Promise<void> {
      return storage.removeItem(DRAFT_KEY);
    },
  };
}

export const draftStorage = createDraftStorage(AsyncStorage);
