jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { createEmptyDraft } from '../draft';
import { createDraftStorage } from '../draft-storage';

describe('analysis draft storage', () => {
  test('저장한 초안을 복구하며 extracting을 queued로 바꾼다', async () => {
    const values = new Map<string, string>();
    const storage = createDraftStorage({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      removeItem: async (key) => { values.delete(key); },
    });
    const draft = createEmptyDraft();
    draft.images = [{
      id: 'a', order: 0, uri: 'file://a.png', sourceKey: 'asset:persisted-a',
      fileName: 'a.png', mimeType: 'image/png',
      fileSize: 1, status: 'extracting', extractedText: '', editedText: '', notes: [],
      errorCode: null, reviewed: false,
    }];

    await storage.save(draft);

    const restored = await storage.load();
    expect(restored?.images[0].status).toBe('queued');
    expect(restored?.images[0].sourceKey).toBe('asset:persisted-a');
  });

  test('손상된 저장값은 복구하지 않는다', async () => {
    const storage = createDraftStorage({
      getItem: async () => '{not-json',
      setItem: async () => undefined,
      removeItem: async () => undefined,
    });

    await expect(storage.load()).resolves.toBeNull();
  });

  test('초안을 지운 뒤에는 복구할 값이 없다', async () => {
    const values = new Map<string, string>();
    const storage = createDraftStorage({
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => { values.set(key, value); },
      removeItem: async (key) => { values.delete(key); },
    });

    await storage.save(createEmptyDraft());
    await storage.clear();

    await expect(storage.load()).resolves.toBeNull();
  });
});
