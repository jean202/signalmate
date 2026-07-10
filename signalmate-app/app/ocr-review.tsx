import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { DuplicateCandidateList } from '../components/review/duplicate-candidate-list';
import { ReplacementRuleEditor } from '../components/review/replacement-rule-editor';
import { BottomAction } from '../components/ui/bottom-action';
import { ScreenShell } from '../components/ui/screen-shell';
import { colors, radius, touchTarget } from '../components/ui/theme';
import {
  applyReplacementRules,
  duplicateCandidateBelongsToImage,
  findDuplicateCandidates,
} from '../lib/analysis/input-builder';
import type { ReplacementRule } from '../lib/analysis/types';
import { useAnalysis } from '../providers/analysis-provider';

export default function OcrReviewScreen() {
  const router = useRouter();
  const { draft, hydrated, updateDraft } = useAnalysis();
  const [currentIndex, setCurrentIndex] = useState(0);
  const completeImages = useMemo(() => (
    [...draft.images]
      .filter((image) => image.status === 'complete')
      .sort((a, b) => a.order - b.order)
  ), [draft.images]);
  const currentImage = completeImages[currentIndex];
  const [editedText, setEditedText] = useState(currentImage?.editedText ?? '');

  useEffect(() => {
    if (currentIndex >= completeImages.length) {
      setCurrentIndex(Math.max(0, completeImages.length - 1));
    }
  }, [completeImages.length, currentIndex]);

  useEffect(() => {
    setEditedText(currentImage?.editedText ?? '');
  }, [currentImage?.editedText, currentImage?.id]);

  const replacementPreviewText = useMemo(() => (
    [...completeImages.map((image) => image.editedText), draft.pastedText].join('\n')
  ), [completeImages, draft.pastedText]);
  const duplicateCandidates = useMemo(() => findDuplicateCandidates(
    completeImages.map((image) => ({ imageId: image.id, text: image.editedText })),
  ), [completeImages]);
  const allCompleteReviewed = completeImages.length > 0
    && completeImages.every((image) => image.reviewed);

  const changeCurrentText = (value: string) => {
    if (!currentImage) return;
    setEditedText(value);
    updateDraft((current) => ({
      ...current,
      images: current.images.map((image) => image.id === currentImage.id
        ? { ...image, editedText: value, reviewed: false }
        : image),
      excludedDuplicateIds: current.excludedDuplicateIds.filter((candidateId) => (
        !duplicateCandidateBelongsToImage(candidateId, currentImage.id)
      )),
    }));
  };

  const completeReview = () => {
    if (!currentImage) return;
    updateDraft((current) => ({
      ...current,
      images: current.images.map((image) => image.id === currentImage.id
        ? { ...image, editedText, reviewed: true }
        : image),
    }));
  };

  const updateRules = (replacementRules: ReplacementRule[]) => {
    updateDraft((current) => ({ ...current, replacementRules }));
  };

  const applyRules = (rules: ReplacementRule[]) => {
    updateDraft((current) => {
      const changedImageIds = new Set<string>();
      const images = current.images.map((image) => {
        if (image.status !== 'complete') return image;
        const nextText = applyReplacementRules(image.editedText, rules);
        if (nextText === image.editedText) return image;
        changedImageIds.add(image.id);
        return { ...image, editedText: nextText, reviewed: false };
      });
      return {
        ...current,
        images,
        pastedText: applyReplacementRules(current.pastedText, rules),
        excludedDuplicateIds: current.excludedDuplicateIds.filter((candidateId) => (
          ![...changedImageIds].some((imageId) => (
            duplicateCandidateBelongsToImage(candidateId, imageId)
          ))
        )),
      };
    });
  };

  const toggleDuplicate = (candidateId: string) => {
    updateDraft((current) => ({
      ...current,
      excludedDuplicateIds: current.excludedDuplicateIds.includes(candidateId)
        ? current.excludedDuplicateIds.filter((id) => id !== candidateId)
        : [...current.excludedDuplicateIds, candidateId],
    }));
  };

  if (!hydrated) return <View style={styles.loading} />;

  return (
    <View style={styles.screen}>
      <ScreenShell bottomInset={28} contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>추출 내용 검수</Text>
          <Text style={styles.title}>캡처와 텍스트를 함께 확인하세요</Text>
          <Text style={styles.description}>수정한 뒤 각 캡처의 검수 완료를 눌러 주세요.</Text>
        </View>

        {currentImage ? (
          <>
            <View style={styles.navigator}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이전 캡처"
                accessibilityState={{ disabled: currentIndex === 0 }}
                disabled={currentIndex === 0}
                onPress={() => setCurrentIndex((index) => Math.max(0, index - 1))}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && currentIndex > 0 && styles.pressed,
                  currentIndex === 0 && styles.disabled,
                ]}
              >
                <ChevronLeft color={colors.text} size={22} strokeWidth={2} />
              </Pressable>
              <View style={styles.position}>
                <Text style={styles.positionText}>{currentIndex + 1} / {completeImages.length}</Text>
                <Text numberOfLines={1} style={styles.fileName}>{currentImage.fileName}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음 캡처"
                accessibilityState={{ disabled: currentIndex === completeImages.length - 1 }}
                disabled={currentIndex === completeImages.length - 1}
                onPress={() => setCurrentIndex((index) => Math.min(completeImages.length - 1, index + 1))}
                style={({ pressed }) => [
                  styles.iconButton,
                  pressed && currentIndex < completeImages.length - 1 && styles.pressed,
                  currentIndex === completeImages.length - 1 && styles.disabled,
                ]}
              >
                <ChevronRight color={colors.text} size={22} strokeWidth={2} />
              </Pressable>
            </View>

            <Image
              accessibilityLabel={`${currentIndex + 1}번 캡처 미리보기`}
              resizeMode="contain"
              source={{ uri: currentImage.uri }}
              style={styles.preview}
              testID="ocr-image-preview"
            />

            <View style={styles.editorSection}>
              <View style={styles.editorHeading}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>추출 텍스트</Text>
                <Text style={[styles.reviewState, currentImage.reviewed && styles.reviewed]}>
                  {currentImage.reviewed ? '검수 완료' : '검수 필요'}
                </Text>
              </View>
              <TextInput
                accessibilityLabel={`${currentIndex + 1}번 캡처 추출 텍스트`}
                multiline
                onChangeText={changeCurrentText}
                style={styles.editor}
                textAlignVertical="top"
                value={editedText}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이 캡처 검수 완료"
                onPress={completeReview}
                style={({ pressed }) => [styles.reviewButton, pressed && styles.reviewPressed]}
              >
                <Text style={styles.reviewButtonText}>이 캡처 검수 완료</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>검수할 캡처가 없어요</Text>
            <Text style={styles.emptyText}>텍스트 추출이 완료된 캡처가 생기면 여기에서 확인할 수 있어요.</Text>
          </View>
        )}

        <View style={styles.divider} />
        <ReplacementRuleEditor
          text={replacementPreviewText}
          rules={draft.replacementRules}
          onRulesChange={updateRules}
          onApply={applyRules}
        />

        {duplicateCandidates.length > 0 && <View style={styles.divider} />}
        <DuplicateCandidateList
          candidates={duplicateCandidates}
          excludedIds={draft.excludedDuplicateIds}
          onToggle={toggleDuplicate}
        />
      </ScreenShell>
      <BottomAction
        primary={{
          label: '상황 정보 입력',
          disabled: !allCompleteReviewed,
          onPress: () => router.push('/situation'),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background },
  content: { gap: 20 },
  heading: { gap: 6 },
  eyebrow: { color: colors.positive, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', lineHeight: 30 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  navigator: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  position: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  positionText: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  fileName: { maxWidth: '100%', color: colors.muted, fontSize: 12, lineHeight: 16 },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.panel,
    backgroundColor: colors.surface,
  },
  editorSection: { gap: 10 },
  editorHeading: {
    minHeight: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  reviewState: { color: colors.caution, fontSize: 12, fontWeight: '700', lineHeight: 17 },
  reviewed: { color: colors.positive },
  editor: {
    minHeight: 220,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  reviewButton: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: colors.text,
  },
  reviewPressed: { opacity: 0.82 },
  reviewButtonText: { color: colors.background, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  empty: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 24,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  divider: { height: 1, backgroundColor: colors.border },
  pressed: { backgroundColor: colors.surface },
  disabled: { opacity: 0.35 },
});
