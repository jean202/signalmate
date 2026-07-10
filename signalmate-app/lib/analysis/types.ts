export type PrimaryInput = 'capture' | 'text' | 'meeting_note';
export type OcrStatus = 'queued' | 'extracting' | 'complete' | 'failed';
export type RelationshipStage =
  | 'before_meeting'
  | 'after_first_date'
  | 'after_second_date'
  | 'cooling_down';
export type MeetingChannel = 'blind_date' | 'dating_app' | 'mutual_friend' | 'other';
export type DesiredHelp = 'next_message' | 'ask_for_date' | 'wait_or_send' | 'decide_to_stop';

export type GuidedAnswers = {
  inputFocus: 'chat' | 'meeting_note' | 'mixed' | 'follow_up';
  meetingCount: 'none' | 'once' | '2_3_times' | '4_plus';
  meetingVibe: 'none' | 'awkward' | 'normal' | 'good' | 'great';
  otherInitiative: 'low' | 'medium' | 'high' | 'unknown';
  afterMeetingContact: 'none' | 'self_first' | 'other_first' | 'slower' | 'ongoing' | 'not_applicable';
  desiredHelp: DesiredHelp;
  otherStyle: string[];
  freeText: string;
};

export type ImageDraftItem = {
  id: string;
  order: number;
  uri: string;
  sourceKey?: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: OcrStatus;
  extractedText: string;
  editedText: string;
  notes: string[];
  errorCode: string | null;
  reviewed: boolean;
};

export type ReplacementRule = { id: string; source: string; replacement: string };

export type ConversationSnapshot = {
  id: string;
  rawText: string;
  situationContext: string | null;
  relationshipStage: string;
  meetingChannel: string;
  userGoal: string;
  messages: Array<{
    senderRole: string; messageText: string; sentAt: string | null; sequenceNo: number;
  }>;
};

export type AnalysisDraft = {
  version: 1;
  primaryInput: PrimaryInput | null;
  images: ImageDraftItem[];
  pastedText: string;
  replacementRules: ReplacementRule[];
  excludedDuplicateIds: string[];
  relationshipStage: RelationshipStage | null;
  meetingChannel: MeetingChannel | null;
  guidedAnswers: GuidedAnswers;
  createdConversation: ConversationSnapshot | null;
  updatedAt: string;
};

export type SignalType = 'positive' | 'ambiguous' | 'caution';
export type AnalysisSignal = {
  id: string; signalType: SignalType; signalKey: string; title: string;
  description: string; evidenceText: string; confidenceLevel: 'low' | 'medium' | 'high';
  displayOrder: number;
};
export type AnalysisRecommendation = {
  id: string; recommendationType: 'next_message' | 'tone_guide' | 'avoid_phrase';
  title: string; content: string; rationale: string; toneLabel: string | null;
  displayOrder: number;
};
export type AnalysisResult = {
  analysisId: string; overallSummary: string; signals: AnalysisSignal[];
  recommendations: AnalysisRecommendation[];
  recommendedAction: string; recommendedActionReason: string;
  confidenceLevel: 'low' | 'medium' | 'high'; warnings: string[];
};
