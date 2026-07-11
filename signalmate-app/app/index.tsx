import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomAction } from '../components/ui/bottom-action';
import { ScreenShell } from '../components/ui/screen-shell';
import { SegmentedControl } from '../components/ui/segmented-control';
import { colors, radius, touchTarget } from '../components/ui/theme';
import type { PrimaryInput } from '../lib/analysis/types';
import { useAnalysis } from '../providers/analysis-provider';

const inputOptions = [
  { value: 'capture', label: '캡처' },
  { value: 'text', label: '텍스트' },
  { value: 'meeting_note', label: '만남 후기' },
] as const;

type ResetState = 'idle' | 'running' | 'failed';

export default function HomeScreen() {
  const router = useRouter();
  const { draft, hydrated, resetDraft, updateDraft } = useAnalysis();
  const selectedInput = draft.primaryInput ?? 'capture';
  const mounted = useRef(true);
  const resetting = useRef(false);
  const [resetState, setResetState] = useState<ResetState>('idle');
  const hasSavedDraft = useMemo(() => (
    draft.images.length > 0
    || draft.pastedText.trim().length > 0
    || Boolean(draft.selfName?.trim())
    || draft.relationshipStage !== null
    || draft.meetingChannel !== null
  ), [draft]);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const startFresh = async () => {
    if (resetting.current) return;
    resetting.current = true;
    setResetState('running');
    try {
      await resetDraft();
      if (mounted.current) setResetState('idle');
    } catch {
      if (mounted.current) setResetState('failed');
    } finally {
      resetting.current = false;
    }
  };

  const selectInput = (primaryInput: PrimaryInput) => {
    updateDraft((current) => ({ ...current, primaryInput }));
  };

  const continueDraft = () => {
    if (selectedInput === 'capture') router.push('/capture');
    else router.push('/situation');
  };

  const primaryAction = selectedInput === 'capture'
    ? {
        label: '캡처 시작',
        onPress: () => {
          selectInput('capture');
          router.push('/capture');
        },
      }
    : {
        label: '상황 정보 입력',
        onPress: () => router.push('/situation'),
        disabled: selectedInput === 'text' && draft.pastedText.trim().length === 0,
      };

  if (!hydrated) return <View style={styles.loading} />;

  return (
    <View style={styles.screen}>
      <ScreenShell bottomInset={28}>
        {hasSavedDraft && (
          <View style={styles.savedCommands}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이어서 작성"
              onPress={continueDraft}
              style={({ pressed }) => [styles.command, pressed && styles.commandPressed]}
            >
              <Text style={styles.commandPrimary}>이어서 작성</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={resetState === 'failed' ? '새로 시작 다시 시도' : '새로 시작'}
              accessibilityState={{
                busy: resetState === 'running',
                disabled: resetState === 'running',
              }}
              disabled={resetState === 'running'}
              onPress={() => { void startFresh(); }}
              style={({ pressed }) => [
                styles.command,
                pressed && styles.commandPressed,
                resetState === 'running' && styles.commandDisabled,
              ]}
            >
              <Text style={styles.commandText}>
                {resetState === 'running'
                  ? '새로 시작 중'
                  : resetState === 'failed' ? '새로 시작 다시 시도' : '새로 시작'}
              </Text>
            </Pressable>
          </View>
        )}

        {resetState === 'failed' && (
          <View
            accessible
            accessibilityRole="alert"
            accessibilityLabel="새로 시작하지 못했어요. 기존 초안은 유지했습니다. 잠시 후 다시 시도해 주세요."
            style={styles.resetFailure}
          >
            <Text style={styles.resetFailureTitle}>새로 시작하지 못했어요</Text>
            <Text style={styles.resetFailureText}>기존 초안은 유지했습니다. 잠시 후 다시 시도해 주세요.</Text>
          </View>
        )}

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>새 분석</Text>
          <Text style={styles.title}>무엇을 바탕으로 볼까요?</Text>
          <Text style={styles.description}>지금 가진 기록에 맞는 입력 방식을 선택하세요.</Text>
        </View>

        <SegmentedControl
          accessibilityLabel="주 입력 선택"
          value={selectedInput}
          onChange={selectInput}
          options={inputOptions}
        />

        <View style={styles.inputPanel}>
          {selectedInput === 'capture' && (
            <>
              <Text style={styles.panelTitle}>대화 캡처</Text>
              <Text style={styles.panelDescription}>
                대화 순서대로 최대 20장을 고르면 텍스트를 추출합니다.
              </Text>
            </>
          )}
          {selectedInput === 'text' && (
            <>
              <Text style={styles.panelTitle}>대화 텍스트</Text>
              <Text style={styles.fieldLabel}>대화 속 내 이름</Text>
              <TextInput
                accessibilityLabel="대화 속 내 이름"
                autoCorrect={false}
                placeholder="예: 김진하"
                placeholderTextColor={colors.muted}
                value={draft.selfName ?? ''}
                onChangeText={(selfName) => updateDraft((current) => ({
                  ...current,
                  primaryInput: 'text',
                  selfName,
                }))}
                style={styles.nameInput}
              />
              <TextInput
                accessibilityLabel="대화 내용"
                multiline
                placeholder="대화 내용을 붙여넣으세요"
                placeholderTextColor={colors.muted}
                textAlignVertical="top"
                value={draft.pastedText}
                onChangeText={(pastedText) => updateDraft((current) => ({
                  ...current,
                  primaryInput: 'text',
                  pastedText,
                }))}
                style={styles.textInput}
              />
            </>
          )}
          {selectedInput === 'meeting_note' && (
            <>
              <Text style={styles.panelTitle}>만남 후기</Text>
              <Text style={styles.panelDescription}>
                만났을 때의 분위기와 이후 연락 흐름부터 기록합니다.
              </Text>
            </>
          )}
        </View>
      </ScreenShell>
      <BottomAction primary={primaryAction} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background },
  savedCommands: {
    minHeight: touchTarget,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  command: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.control,
  },
  commandPressed: { backgroundColor: colors.surface },
  commandDisabled: { opacity: 0.48 },
  commandPrimary: { color: colors.positive, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  commandText: { color: colors.muted, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  resetFailure: {
    gap: 3,
    marginBottom: 16,
    padding: 12,
    borderRadius: radius.panel,
    backgroundColor: colors.cautionSurface,
  },
  resetFailureTitle: { color: colors.caution, fontSize: 15, fontWeight: '800', lineHeight: 22 },
  resetFailureText: { color: colors.text, fontSize: 14, lineHeight: 21 },
  heading: { gap: 6, marginBottom: 20 },
  eyebrow: { color: colors.positive, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', lineHeight: 32 },
  description: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  inputPanel: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  panelTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  panelDescription: { color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: 8 },
  fieldLabel: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18, marginTop: 14 },
  nameInput: {
    minHeight: touchTarget,
    marginTop: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  textInput: {
    minHeight: 180,
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
  },
});
