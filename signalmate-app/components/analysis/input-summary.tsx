import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  buildMergedChatText,
  recognizedChatCount,
  retainValidDuplicateIds,
  validateDraft,
} from '../../lib/analysis/input-builder';
import type { AnalysisDraft, MeetingChannel, RelationshipStage } from '../../lib/analysis/types';
import { colors, radius, touchTarget } from '../ui/theme';

export type AnalysisEditRoute = '/' | '/ocr-review' | '/situation';

type InputSummaryProps = {
  draft: AnalysisDraft;
  onNavigate: (route: AnalysisEditRoute) => void;
  onSelfNameChange: (selfName: string) => void;
};

const RELATIONSHIP_LABELS: Record<RelationshipStage, string> = {
  before_meeting: '첫 만남 전',
  after_first_date: '첫 만남 후',
  after_second_date: '두세 번 만남 후',
  cooling_down: '식어가는 느낌',
};
const CHANNEL_LABELS: Record<MeetingChannel, string> = {
  blind_date: '소개팅',
  dating_app: '데이팅 앱',
  mutual_friend: '지인 소개',
  other: '기타',
};

function editCommand(error: string, draft: AnalysisDraft): {
  label: string;
  route: AnalysisEditRoute;
} {
  if (error.startsWith('관계 단계')) return { label: '관계 단계 수정', route: '/situation' };
  if (error.startsWith('만난 경로')) return { label: '만난 경로 수정', route: '/situation' };
  if (error.startsWith('원하는 도움')) return { label: '원하는 도움 수정', route: '/situation' };
  if (error.startsWith('만남 후기')) return { label: '만남 후기 수정', route: '/situation' };
  if (error.startsWith('추출된 캡처')) return { label: '캡처 검수하기', route: '/ocr-review' };
  if (error.startsWith('이름이 표시된 대화')) return { label: '내 이름 입력', route: '/' };
  if (error.startsWith('대화 두 줄')) {
    if (draft.guidedAnswers.inputFocus !== 'chat') {
      return { label: '만남 후기 보완', route: '/situation' };
    }
    return {
      label: '대화 내용 수정',
      route: draft.primaryInput === 'capture' ? '/ocr-review' : '/',
    };
  }
  return { label: '입력 방식 수정', route: '/' };
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function InputSummary({ draft, onNavigate, onSelfNameChange }: InputSummaryProps) {
  const mergedText = buildMergedChatText(draft);
  const completedImages = draft.images.filter((image) => image.status === 'complete');
  const reviewedImages = completedImages.filter((image) => image.reviewed);
  const activeRules = draft.replacementRules.filter((rule) => (
    rule.source.trim().length > 0
  ));
  const activeDuplicateIds = new Set(
    retainValidDuplicateIds(draft.images, draft.excludedDuplicateIds),
  );
  const validation = validateDraft(draft);

  return (
    <View style={styles.container}>
      <View style={styles.summary} accessibilityLabel="분석 입력 요약">
        <SummaryRow label="채팅" value={`채팅 메시지 ${recognizedChatCount(mergedText)}개`} />
        <SummaryRow label="캡처" value={`완료 이미지 ${completedImages.length}장 · 검수 ${reviewedImages.length}장`} />
        <SummaryRow label="후기" value={`만남 후기 ${draft.guidedAnswers.freeText.length}자`} />
        <SummaryRow label="관계" value={`관계 단계 ${draft.relationshipStage ? RELATIONSHIP_LABELS[draft.relationshipStage] : '미선택'}`} />
        <SummaryRow label="경로" value={`만난 경로 ${draft.meetingChannel ? CHANNEL_LABELS[draft.meetingChannel] : '미선택'}`} />
        <SummaryRow label="개인정보" value={`분석 전 자동 치환 ${activeRules.length}개`} />
        <SummaryRow label="중복" value={`중복 제외 ${activeDuplicateIds.size}개`} />
      </View>

      {!validation.valid && (
        <View accessibilityRole="alert" style={styles.errors}>
          <Text style={styles.errorHeading}>수정이 필요한 항목</Text>
          {validation.errors.map((error) => {
            const command = editCommand(error, draft);
            const needsSelfName = error.startsWith('이름이 표시된 대화');
            return (
              <View key={error} style={styles.errorRow}>
                <Text style={styles.errorText}>{error}</Text>
                {needsSelfName ? (
                  <View style={styles.selfNameField}>
                    <Text style={styles.selfNameLabel}>캡처에서 내 메시지에 표시된 이름</Text>
                    <TextInput
                      accessibilityLabel="대화 속 내 이름"
                      autoCorrect={false}
                      onChangeText={onSelfNameChange}
                      placeholder="예: 진하 또는 앱 닉네임"
                      placeholderTextColor={colors.muted}
                      style={styles.selfNameInput}
                      value={draft.selfName ?? ''}
                    />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={command.label}
                    onPress={() => onNavigate(command.route)}
                    style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                  >
                    <Text style={styles.editButtonText}>{command.label}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 20 },
  summary: { borderTopWidth: 1, borderTopColor: colors.border },
  summaryRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: { color: colors.muted, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  summaryValue: { flexShrink: 1, color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20, textAlign: 'right' },
  errors: {
    gap: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.caution,
    borderRadius: radius.panel,
    backgroundColor: colors.cautionSurface,
  },
  errorHeading: { color: colors.caution, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  errorRow: { gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  selfNameField: { gap: 6 },
  selfNameLabel: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  selfNameInput: {
    minHeight: touchTarget,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  editButton: {
    minHeight: touchTarget,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.control,
  },
  editButtonText: { color: colors.caution, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  pressed: { backgroundColor: colors.background },
});
