import type { AnalysisDraft, ImageDraftItem } from './types';

export function createEmptyDraft(now = new Date().toISOString()): AnalysisDraft {
  return {
    version: 1,
    primaryInput: null,
    images: [],
    pastedText: '',
    replacementRules: [],
    excludedDuplicateIds: [],
    relationshipStage: null,
    meetingChannel: null,
    guidedAnswers: {
      inputFocus: 'chat', meetingCount: 'none', meetingVibe: 'none',
      otherInitiative: 'unknown', afterMeetingContact: 'not_applicable',
      desiredHelp: 'next_message', otherStyle: [], freeText: '',
    },
    inputFocusTouched: false,
    createdConversation: null,
    updatedAt: now,
  };
}

export function normalizeRestoredDraft(draft: AnalysisDraft): AnalysisDraft {
  return {
    ...draft,
    inputFocusTouched: draft.inputFocusTouched ?? false,
    images: draft.images.map((image) => ({
      ...image,
      status: image.status === 'extracting' ? 'queued' : image.status,
    })),
  };
}

export function moveDraftImage(
  images: ImageDraftItem[],
  from: number,
  to: number,
): ImageDraftItem[] {
  if (from === to || from < 0 || to < 0 || from >= images.length || to >= images.length) {
    return images;
  }
  const next = [...images];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((image, order) => ({ ...image, order }));
}
