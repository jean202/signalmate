import { buildProtectedConversationInput } from './input-builder';
import type { AnalysisDraft } from './types';

function hash32(value: string, seed: number): string {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function analysisInputFingerprint(draft: AnalysisDraft): string {
  const { rawText, freeText, selfName } = buildProtectedConversationInput(draft);
  const canonicalInput = JSON.stringify({
    primaryInput: draft.primaryInput,
    sourceType: draft.images.length > 0 ? 'mobile_capture' : 'mobile_manual',
    relationshipStage: draft.relationshipStage,
    meetingChannel: draft.meetingChannel,
    rawText,
    selfName,
    guidedAnswers: {
      inputFocus: draft.guidedAnswers.inputFocus,
      meetingCount: draft.guidedAnswers.meetingCount,
      meetingVibe: draft.guidedAnswers.meetingVibe,
      otherInitiative: draft.guidedAnswers.otherInitiative,
      afterMeetingContact: draft.guidedAnswers.afterMeetingContact,
      desiredHelp: draft.guidedAnswers.desiredHelp,
      otherStyle: draft.guidedAnswers.otherStyle,
      freeText,
    },
  });

  return `analysis-input-v1:${hash32(canonicalInput, 0x811c9dc5)}${hash32(canonicalInput, 0x9e3779b9)}`;
}
