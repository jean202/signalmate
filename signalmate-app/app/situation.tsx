import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomAction } from '../components/ui/bottom-action';
import { ChoiceChips, type ChoiceChipOption } from '../components/ui/choice-chips';
import { ScreenShell } from '../components/ui/screen-shell';
import { colors, radius } from '../components/ui/theme';
import type {
  DesiredHelp,
  GuidedAnswers,
  MeetingChannel,
  RelationshipStage,
} from '../lib/analysis/types';
import { useAnalysis } from '../providers/analysis-provider';

const MAX_FREE_TEXT_LENGTH = 2000;

const relationshipOptions: readonly ChoiceChipOption<RelationshipStage>[] = [
  { value: 'before_meeting', label: '첫 만남 전' },
  { value: 'after_first_date', label: '첫 만남 후' },
  { value: 'after_second_date', label: '두세 번 만남 후' },
  { value: 'cooling_down', label: '식어가는 느낌' },
];
const channelOptions: readonly ChoiceChipOption<MeetingChannel>[] = [
  { value: 'blind_date', label: '소개팅' },
  { value: 'dating_app', label: '데이팅 앱' },
  { value: 'mutual_friend', label: '지인 소개' },
  { value: 'other', label: '기타' },
];
const focusOptions: readonly ChoiceChipOption<GuidedAnswers['inputFocus']>[] = [
  { value: 'chat', label: '채팅 중심' },
  { value: 'meeting_note', label: '만남 후기 중심' },
  { value: 'mixed', label: '채팅과 만남 혼합' },
  { value: 'follow_up', label: '만남 뒤 연락 중심' },
];
const meetingCountOptions: readonly ChoiceChipOption<GuidedAnswers['meetingCount']>[] = [
  { value: 'none', label: '없음' },
  { value: 'once', label: '1번' },
  { value: '2_3_times', label: '2~3번' },
  { value: '4_plus', label: '4번 이상' },
];
const vibeOptions: readonly ChoiceChipOption<GuidedAnswers['meetingVibe']>[] = [
  { value: 'none', label: '해당 없음' },
  { value: 'awkward', label: '어색함' },
  { value: 'normal', label: '보통' },
  { value: 'good', label: '좋았음' },
  { value: 'great', label: '아주 좋았음' },
];
const initiativeOptions: readonly ChoiceChipOption<GuidedAnswers['otherInitiative']>[] = [
  { value: 'low', label: '낮음' },
  { value: 'medium', label: '보통' },
  { value: 'high', label: '높음' },
  { value: 'unknown', label: '판단 어려움' },
];
const contactOptions: readonly ChoiceChipOption<GuidedAnswers['afterMeetingContact']>[] = [
  { value: 'none', label: '없음' },
  { value: 'self_first', label: '내가 먼저' },
  { value: 'other_first', label: '상대가 먼저' },
  { value: 'slower', label: '느려짐' },
  { value: 'ongoing', label: '이어지는 중' },
  { value: 'not_applicable', label: '해당 없음' },
];
const helpOptions: readonly ChoiceChipOption<DesiredHelp>[] = [
  { value: 'next_message', label: '다음 메시지' },
  { value: 'ask_for_date', label: '다음 만남 제안' },
  { value: 'wait_or_send', label: '기다릴지 연락할지' },
  { value: 'decide_to_stop', label: '관계 정리 여부' },
];
const styleOptions: readonly ChoiceChipOption<string>[] = [
  { value: 'fast_reply', label: '답장이 빠른 편' },
  { value: 'slow_reply', label: '답장이 느린 편' },
  { value: 'short_messages', label: '짧게 답하는 스타일' },
  { value: 'long_messages', label: '길게 적는 스타일' },
  { value: 'uses_emoji', label: '이모지/이모티콘을 자주 사용' },
  { value: 'unknown', label: '메시지 스타일을 잘 모르겠음' },
];

type GuidedKey = Exclude<keyof GuidedAnswers, 'otherStyle' | 'freeText'>;

function Section({ title, required, children }: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}{required ? ' *' : ''}
      </Text>
      {children}
    </View>
  );
}

export default function SituationScreen() {
  const router = useRouter();
  const { draft, hydrated, updateDraft } = useAnalysis();
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    if (!draft.primaryInput || draft.inputFocusTouched) return;
    const inputFocus = draft.primaryInput === 'meeting_note' ? 'meeting_note' : 'chat';
    if (draft.guidedAnswers.inputFocus === inputFocus) return;
    updateDraft((current) => ({
      ...current,
      guidedAnswers: { ...current.guidedAnswers, inputFocus },
    }));
  }, [draft.guidedAnswers.inputFocus, draft.inputFocusTouched, draft.primaryInput, updateDraft]);

  const updateGuided = <K extends GuidedKey>(key: K, value: GuidedAnswers[K]) => {
    updateDraft((current) => ({
      ...current,
      inputFocusTouched: key === 'inputFocus' ? true : current.inputFocusTouched,
      guidedAnswers: { ...current.guidedAnswers, [key]: value },
    }));
  };

  const updateFreeText = (value: string) => {
    setLimitReached(value.length > MAX_FREE_TEXT_LENGTH);
    const freeText = value.slice(0, MAX_FREE_TEXT_LENGTH);
    updateDraft((current) => ({
      ...current,
      guidedAnswers: { ...current.guidedAnswers, freeText },
    }));
  };

  if (!hydrated) return <View style={styles.loading} />;

  return (
    <View style={styles.screen}>
      <ScreenShell bottomInset={28} contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>상황 정보</Text>
          <Text style={styles.title}>관계의 맥락을 알려주세요</Text>
          <Text style={styles.description}>필수 항목을 먼저 고르고, 실제로 관찰한 내용을 더해 주세요.</Text>
        </View>

        <Section title="관계 단계" required>
          <ChoiceChips options={relationshipOptions} value={draft.relationshipStage}
            onChange={(relationshipStage) => updateDraft((current) => ({ ...current, relationshipStage }))} />
        </Section>
        <Section title="만난 경로" required>
          <ChoiceChips options={channelOptions} value={draft.meetingChannel}
            onChange={(meetingChannel) => updateDraft((current) => ({ ...current, meetingChannel }))} />
        </Section>
        <Section title="입력 중심">
          <ChoiceChips options={focusOptions} value={draft.guidedAnswers.inputFocus}
            onChange={(value) => updateGuided('inputFocus', value)} />
        </Section>
        <Section title="만남 횟수">
          <ChoiceChips options={meetingCountOptions} value={draft.guidedAnswers.meetingCount}
            onChange={(value) => updateGuided('meetingCount', value)} />
        </Section>
        <Section title="분위기">
          <ChoiceChips options={vibeOptions} value={draft.guidedAnswers.meetingVibe}
            onChange={(value) => updateGuided('meetingVibe', value)} />
        </Section>
        <Section title="상대 적극성">
          <ChoiceChips options={initiativeOptions} value={draft.guidedAnswers.otherInitiative}
            onChange={(value) => updateGuided('otherInitiative', value)} />
        </Section>
        <Section title="만남 뒤 연락">
          <ChoiceChips options={contactOptions} value={draft.guidedAnswers.afterMeetingContact}
            onChange={(value) => updateGuided('afterMeetingContact', value)} />
        </Section>
        <Section title="원하는 도움">
          <ChoiceChips options={helpOptions} value={draft.guidedAnswers.desiredHelp}
            onChange={(value) => updateGuided('desiredHelp', value)} />
        </Section>
        <Section title="상대 메시지 스타일">
          <ChoiceChips multiple options={styleOptions} value={draft.guidedAnswers.otherStyle}
            onChange={(otherStyle) => updateDraft((current) => ({
              ...current,
              guidedAnswers: { ...current.guidedAnswers, otherStyle },
            }))} />
        </Section>
        <Section title="직접 느낀 점">
          <TextInput
            accessibilityLabel="직접 느낀 점"
            multiline
            onChangeText={updateFreeText}
            placeholder="상대의 행동, 대화 분위기, 만남 뒤 연락을 적어 주세요"
            placeholderTextColor={colors.muted}
            style={styles.textInput}
            textAlignVertical="top"
            value={draft.guidedAnswers.freeText}
          />
          <View style={styles.counterRow}>
            {limitReached && <Text accessibilityRole="alert" style={styles.limitText}>2,000자까지 입력할 수 있어요</Text>}
            <Text style={styles.counter}>{draft.guidedAnswers.freeText.length.toLocaleString()} / 2,000자</Text>
          </View>
        </Section>
      </ScreenShell>
      <BottomAction primary={{
        label: '입력 요약 확인',
        disabled: !draft.relationshipStage || !draft.meetingChannel,
        onPress: () => router.push('/review'),
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background },
  content: { gap: 24 },
  heading: { gap: 6 },
  eyebrow: { color: colors.positive, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', lineHeight: 31 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: 10, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  textInput: {
    minHeight: 160,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  counterRow: { minHeight: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  limitText: { flexShrink: 1, color: colors.danger, fontSize: 13, lineHeight: 19 },
  counter: { marginLeft: 'auto', color: colors.muted, fontSize: 13, lineHeight: 19 },
});
