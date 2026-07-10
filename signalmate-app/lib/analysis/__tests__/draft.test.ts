import {
  createEmptyDraft,
  moveDraftImage,
  normalizeRestoredDraft,
} from '../draft';

describe('analysis draft', () => {
  test('새 초안은 필수 상황값을 아직 선택하지 않은 상태다', () => {
    const draft = createEmptyDraft();
    expect(draft.primaryInput).toBeNull();
    expect(draft.relationshipStage).toBeNull();
    expect(draft.meetingChannel).toBeNull();
    expect(draft.images).toEqual([]);
  });

  test('앱 재실행 시 중단된 추출 상태를 대기로 되돌린다', () => {
    const draft = createEmptyDraft();
    draft.images = [
      {
        id: 'img-1', order: 0, uri: 'file://1.png', fileName: '1.png',
        mimeType: 'image/png', fileSize: 10, status: 'extracting',
        extractedText: '', editedText: '', notes: [], errorCode: null,
        reviewed: false,
      },
    ];
    expect(normalizeRestoredDraft(draft).images[0].status).toBe('queued');
  });

  test('이미지 이동 뒤 order를 0부터 다시 매긴다', () => {
    const draft = createEmptyDraft();
    draft.images = ['a', 'b', 'c'].map((id, order) => ({
      id, order, uri: `file://${id}.png`, fileName: `${id}.png`,
      mimeType: 'image/png', fileSize: 10, status: 'queued' as const,
      extractedText: '', editedText: '', notes: [], errorCode: null,
      reviewed: false,
    }));
    expect(moveDraftImage(draft.images, 2, 0).map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(moveDraftImage(draft.images, 2, 0).map((item) => item.order)).toEqual([0, 1, 2]);
  });
});
