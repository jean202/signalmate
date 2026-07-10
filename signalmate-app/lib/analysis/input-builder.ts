import type { AnalysisDraft, ReplacementRule } from './types';

export type DuplicateCandidate = {
  id: string;
  imageId: string;
  lineIndex: number;
  text: string;
};

const normalizeLine = (line: string) => line.trim().replace(/\s+/g, ' ');

export function applyReplacementRules(text: string, rules: ReplacementRule[]): string {
  return rules.reduce((result, rule) => {
    if (!rule.source) return result;
    return result.split(rule.source).join(rule.replacement);
  }, text);
}

export function findDuplicateCandidates(
  items: Array<{ imageId: string; text: string }>,
): DuplicateCandidate[] {
  const result: DuplicateCandidate[] = [];
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1].text.split(/\r?\n/)
      .map((text, lineIndex) => ({ text, lineIndex }))
      .filter(({ text }) => text.trim() !== '');
    const current = items[index].text.split(/\r?\n/)
      .map((text, lineIndex) => ({ text, lineIndex }))
      .filter(({ text }) => text.trim() !== '');
    const max = Math.min(previous.length, current.length);
    let overlap = 0;
    for (let size = max; size > 0; size -= 1) {
      const suffix = previous.slice(-size).map(({ text }) => normalizeLine(text));
      const prefix = current.slice(0, size).map(({ text }) => normalizeLine(text));
      if (suffix.every((line, lineIndex) => line === prefix[lineIndex])) {
        overlap = size;
        break;
      }
    }
    for (let lineIndex = 0; lineIndex < overlap; lineIndex += 1) {
      const line = current[lineIndex];
      result.push({
        id: `${items[index].imageId}:${line.lineIndex}`,
        imageId: items[index].imageId,
        lineIndex: line.lineIndex,
        text: line.text,
      });
    }
  }
  return result;
}

export function buildMergedChatText(draft: AnalysisDraft): string {
  const imageParts = [...draft.images]
    .sort((a, b) => a.order - b.order)
    .filter((image) => image.status === 'complete')
    .map((image) => image.editedText.split(/\r?\n/)
      .filter((_, lineIndex) => !draft.excludedDuplicateIds.includes(`${image.id}:${lineIndex}`))
      .join('\n').trim())
    .filter(Boolean);
  const imageText = imageParts.join('\n');
  const pastedText = draft.pastedText.trim();
  return [imageText, pastedText].filter(Boolean).join('\n\n');
}

export function recognizedChatCount(text: string): number {
  return text.split(/\r?\n/).filter((line) =>
    /^(?:\[[^\]]+\]\s*)?(?:나|저|상대|상대방)\s*[:：]\s*\S+/.test(line.trim()),
  ).length;
}

export function validateDraft(draft: AnalysisDraft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const chatText = buildMergedChatText(draft);
  if (!draft.primaryInput) errors.push('입력 방식을 선택해 주세요.');
  if (!draft.relationshipStage) errors.push('관계 단계를 선택해 주세요.');
  if (!draft.meetingChannel) errors.push('만난 경로를 선택해 주세요.');
  if (draft.guidedAnswers.freeText.trim().length > 2000) {
    errors.push('만남 후기는 2,000자 이하여야 해요.');
  }
  const situationAllowed = draft.guidedAnswers.inputFocus !== 'chat'
    && draft.guidedAnswers.freeText.trim().length >= 20;
  if (recognizedChatCount(chatText) < 2 && !situationAllowed) {
    errors.push('대화 두 줄 이상 또는 20자 이상의 만남 후기가 필요해요.');
  }
  if (draft.images.some((image) => image.status === 'complete' && !image.reviewed)) {
    errors.push('추출된 캡처 내용을 모두 검수해 주세요.');
  }
  return { valid: errors.length === 0, errors };
}

const USER_GOAL = {
  next_message: 'continue_chat',
  ask_for_date: 'ask_for_date',
  wait_or_send: 'evaluate_interest',
  decide_to_stop: 'decide_to_stop',
} as const;

export function buildConversationRequest(draft: AnalysisDraft) {
  const validation = validateDraft(draft);
  if (!validation.valid || !draft.relationshipStage || !draft.meetingChannel) {
    throw new Error(validation.errors[0] ?? '분석 입력이 완성되지 않았어요.');
  }
  return {
    title: '모바일 분석',
    sourceType: draft.images.length > 0 ? 'mobile_capture' : 'mobile_manual',
    relationshipStage: draft.relationshipStage,
    meetingChannel: draft.meetingChannel,
    userGoal: USER_GOAL[draft.guidedAnswers.desiredHelp],
    saveMode: 'temporary' as const,
    rawText: buildMergedChatText(draft),
    selfName: '나',
    guidedAnswers: draft.guidedAnswers,
  };
}
