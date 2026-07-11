import type { AnalysisDraft, ReplacementRule } from './types';

export type DuplicateCandidate = {
  id: string;
  imageId: string;
  lineIndex: number;
  text: string;
};

const normalizeLine = (line: string) => line.trim().replace(/\s+/g, ' ');
const SELF_SENDER_TOKEN = '\uE000signalmate-self-sender\uE001';
const OTHER_SENDER_TOKEN = '\uE000signalmate-other-sender\uE001';
const RELATIVE_SELF_NAMES = new Set(['나', '저']);
const RELATIVE_OTHER_NAMES = new Set(['상대', '상대방']);
const SITUATION_NOTE_LABELS = ['상황', '메모', '후기', '느낌', '추가'];
const MAX_SITUATION_NOTE_LABEL_LENGTH = 12;
const SENDER_LINE_PATTERNS = [
  /^(\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*[오전후]+\s*\d{1,2}:\d{2},\s*)(.+?)(\s*[:：]\s*)(.+)$/,
  /^(\s*\[)(.+?)(\]\s*\[[오전후]+\s*\d{1,2}:\d{2}\]\s*)(.+)$/,
  /^(\s*\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.\s*\d{1,2}:\d{2}\s*[APap][Mm],\s*)(.+?)(\s*[:：]\s*)(.+)$/,
  /^(\s*\[(?:오전|오후)\s*\d{1,2}:\d{2}\]\s*)(.+?)(\s*[:：]\s*)(.+)$/,
  /^(\s*\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s+)(.+?)(\s*[:：]\s*)(.+)$/,
  /^(\s*)(.+?)(\s*[:：]\s*)(.+)$/,
];

type ParsedSenderLine = {
  senderName: string;
  named: boolean;
  render: (senderName: string) => string;
};

function isSimpleNameCandidate(candidateName: string): boolean {
  return candidateName.length <= 20
    && !candidateName.includes('http')
    && !candidateName.includes('/');
}

function isSituationNoteLabel(label: string): boolean {
  const compactLabel = label.trim().replace(/\s+/g, '');
  return compactLabel.length > 0
    && compactLabel.length <= MAX_SITUATION_NOTE_LABEL_LENGTH
    && SITUATION_NOTE_LABELS.some((token) => compactLabel.includes(token));
}

function parseSenderLine(line: string): ParsedSenderLine | null {
  for (let index = 0; index < SENDER_LINE_PATTERNS.length; index += 1) {
    const match = line.match(SENDER_LINE_PATTERNS[index]);
    if (!match) continue;
    const senderName = match[2].trim();
    if (index === SENDER_LINE_PATTERNS.length - 1
      && (!isSimpleNameCandidate(senderName) || isSituationNoteLabel(senderName))) {
      return null;
    }
    const relative = RELATIVE_SELF_NAMES.has(senderName) || RELATIVE_OTHER_NAMES.has(senderName);
    return {
      senderName,
      named: !relative,
      render: (nextSenderName) => `${match[1]}${nextSenderName}${match[3]}${match[4]}`,
    };
  }
  return null;
}

function protectSenderLabels(text: string, selfName: string): string {
  const trimmedSelfName = selfName.trim();
  return text.split(/\r?\n/).map((line) => {
    const parsed = parseSenderLine(line);
    if (!parsed) return line;
    const isSelf = RELATIVE_SELF_NAMES.has(parsed.senderName)
      || (trimmedSelfName.length > 0 && parsed.senderName === trimmedSelfName);
    return parsed.render(isSelf ? SELF_SENDER_TOKEN : OTHER_SENDER_TOKEN);
  }).join('\n');
}

export function duplicateCandidateId(imageId: string, lineIndex: number, text: string): string {
  return `duplicate:${encodeURIComponent(imageId)}:${lineIndex}:${encodeURIComponent(normalizeLine(text))}`;
}

function replacementResult(text: string, rules: readonly ReplacementRule[]) {
  const activeRules = rules.filter((rule) => rule.source.length > 0);
  const protectedCharacters = Array.from({ length: text.length }, () => false);

  for (const rule of activeRules) {
    if (!rule.replacement) continue;
    let position = text.indexOf(rule.replacement);
    while (position !== -1) {
      for (let index = position; index < position + rule.replacement.length; index += 1) {
        protectedCharacters[index] = true;
      }
      position = text.indexOf(rule.replacement, position + rule.replacement.length);
    }
  }

  let output = '';
  let changes = 0;
  let index = 0;
  while (index < text.length) {
    if (protectedCharacters[index]) {
      output += text[index];
      index += 1;
      continue;
    }
    const rule = activeRules.find((candidate) => {
      if (!text.startsWith(candidate.source, index)) return false;
      return !protectedCharacters.slice(index, index + candidate.source.length).some(Boolean);
    });
    if (!rule) {
      output += text[index];
      index += 1;
      continue;
    }

    output += rule.replacement;
    if (rule.source !== rule.replacement) changes += 1;
    index += rule.source.length;
  }

  return { output, changes };
}

export function applyReplacementRules(text: string, rules: ReplacementRule[]): string {
  return replacementResult(text, rules).output;
}

export function countReplacementChanges(text: string, rules: readonly ReplacementRule[]): number {
  return replacementResult(text, rules).changes;
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
        id: duplicateCandidateId(items[index].imageId, line.lineIndex, line.text),
        imageId: items[index].imageId,
        lineIndex: line.lineIndex,
        text: line.text,
      });
    }
  }
  return result;
}

function completeImageInputs(images: AnalysisDraft['images']) {
  return [...images]
    .sort((a, b) => a.order - b.order)
    .filter((image) => image.status === 'complete')
    .map((image) => ({ imageId: image.id, text: image.editedText }));
}

export function retainValidDuplicateIds(
  images: AnalysisDraft['images'],
  excludedDuplicateIds: readonly string[],
): string[] {
  const validIds = new Set(
    findDuplicateCandidates(completeImageInputs(images)).map((candidate) => candidate.id),
  );
  return excludedDuplicateIds.filter((candidateId) => validIds.has(candidateId));
}

export function buildMergedChatText(draft: AnalysisDraft): string {
  const activeExcludedIds = new Set(
    retainValidDuplicateIds(draft.images, draft.excludedDuplicateIds),
  );
  const imageParts = [...draft.images]
    .sort((a, b) => a.order - b.order)
    .filter((image) => image.status === 'complete')
    .map((image) => image.editedText.split(/\r?\n/)
      .filter((line, lineIndex) => !activeExcludedIds.has(
        duplicateCandidateId(image.id, lineIndex, line),
      ))
      .join('\n').trim())
    .filter(Boolean);
  const imageText = imageParts.join('\n');
  const pastedText = draft.pastedText.trim();
  return [imageText, pastedText].filter(Boolean).join('\n\n');
}

export function recognizedChatCount(text: string): number {
  return text.split(/\r?\n/).filter((line) => parseSenderLine(line) !== null).length;
}

function hasNamedSenderMessage(text: string): boolean {
  return text.split(/\r?\n/).some((line) => parseSenderLine(line)?.named === true);
}

export function buildProtectedConversationInput(draft: AnalysisDraft): {
  rawText: string;
  freeText: string;
  selfName: '나';
} {
  const protectedRawText = protectSenderLabels(
    buildMergedChatText(draft),
    draft.selfName ?? '',
  );
  return {
    rawText: applyReplacementRules(protectedRawText, draft.replacementRules)
      .split(SELF_SENDER_TOKEN).join('나')
      .split(OTHER_SENDER_TOKEN).join('상대'),
    freeText: applyReplacementRules(draft.guidedAnswers.freeText, draft.replacementRules),
    selfName: '나',
  };
}

const USER_GOAL = {
  next_message: 'continue_chat',
  ask_for_date: 'ask_for_date',
  wait_or_send: 'evaluate_interest',
  decide_to_stop: 'decide_to_stop',
} as const;

const isValidDesiredHelp = (value: unknown): value is keyof typeof USER_GOAL =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(USER_GOAL, value);

export function validateDraft(draft: AnalysisDraft): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const chatText = buildMergedChatText(draft);
  if (!draft.primaryInput) errors.push('입력 방식을 선택해 주세요.');
  if (!draft.relationshipStage) errors.push('관계 단계를 선택해 주세요.');
  if (!draft.meetingChannel) errors.push('만난 경로를 선택해 주세요.');
  if (!isValidDesiredHelp(draft.guidedAnswers.desiredHelp)) {
    errors.push('원하는 도움을 선택해 주세요.');
  }
  if (draft.guidedAnswers.freeText.trim().length > 2000) {
    errors.push('만남 후기는 2,000자 이하여야 해요.');
  }
  const situationAllowed = draft.guidedAnswers.inputFocus !== 'chat'
    && draft.guidedAnswers.freeText.trim().length >= 20;
  if (recognizedChatCount(chatText) < 2 && !situationAllowed) {
    errors.push('대화 두 줄 이상 또는 20자 이상의 만남 후기가 필요해요.');
  }
  if (hasNamedSenderMessage(chatText)
    && !draft.selfName?.trim()) {
    errors.push('이름이 표시된 대화에서는 내 이름을 입력해 주세요.');
  }
  if (draft.images.some((image) => image.status === 'complete' && !image.reviewed)) {
    errors.push('추출된 캡처 내용을 모두 검수해 주세요.');
  }
  return { valid: errors.length === 0, errors };
}

export function buildConversationRequest(draft: AnalysisDraft) {
  const validation = validateDraft(draft);
  if (!validation.valid || !draft.relationshipStage || !draft.meetingChannel
    || !isValidDesiredHelp(draft.guidedAnswers.desiredHelp)) {
    throw new Error(validation.errors[0] ?? '분석 입력이 완성되지 않았어요.');
  }
  const userGoal = USER_GOAL[draft.guidedAnswers.desiredHelp];
  const protectedInput = buildProtectedConversationInput(draft);
  const guidedAnswers = {
    ...draft.guidedAnswers,
    freeText: protectedInput.freeText,
  };
  return {
    title: '모바일 분석',
    sourceType: draft.images.length > 0 ? 'mobile_capture' : 'mobile_manual',
    relationshipStage: draft.relationshipStage,
    meetingChannel: draft.meetingChannel,
    userGoal,
    saveMode: 'temporary' as const,
    rawText: protectedInput.rawText,
    selfName: protectedInput.selfName,
    guidedAnswers,
  };
}
