import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Plus, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ImageQueueList } from '../components/capture/image-queue-list';
import { BottomAction } from '../components/ui/bottom-action';
import { ScreenShell } from '../components/ui/screen-shell';
import { colors, radius, touchTarget } from '../components/ui/theme';
import { extractImage } from '../lib/api/client';
import { moveDraftImage } from '../lib/analysis/draft';
import { cachePickedImage, deleteCachedImage } from '../lib/analysis/image-cache';
import { runOcrQueue } from '../lib/analysis/ocr-queue';
import type { ImageDraftItem } from '../lib/analysis/types';
import { useAnalysis } from '../providers/analysis-provider';

const MAX_IMAGES = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};
const OCR_FAILURE_NOTE = '이미지를 읽지 못했어요. 실패한 항목만 다시 시도해 주세요.';

function extensionOf(asset: ImagePicker.ImagePickerAsset): string | null {
  const source = asset.fileName ?? asset.uri.split('/').pop() ?? '';
  return source.match(/\.([a-z0-9]+)(?:\?.*)?$/i)?.[1].toLowerCase() ?? null;
}

function resolvedMimeType(asset: ImagePicker.ImagePickerAsset): string | null {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const extension = extensionOf(asset);
  return extension ? MIME_BY_EXTENSION[extension] ?? null : null;
}

function assetFileName(asset: ImagePicker.ImagePickerAsset, index: number): string {
  return asset.fileName ?? `capture-${index + 1}.${extensionOf(asset) ?? 'jpg'}`;
}

function fingerprint(fileName: string, fileSize: number, mimeType: string): string {
  return `${fileName.toLowerCase()}|${fileSize}|${mimeType}`;
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
    && /^[A-Z0-9_]{1,48}$/.test(error.code)
  ) return error.code;
  return 'OCR_FAILED';
}

export default function CaptureScreen() {
  const router = useRouter();
  const { draft, hydrated, updateDraft } = useAnalysis();
  const [notices, setNotices] = useState<string[]>([]);
  const [processing, setProcessing] = useState(false);
  const imagesRef = useRef(draft.images);
  const pendingConsumed = useRef(false);
  const idSequence = useRef(0);
  imagesRef.current = draft.images;

  const processAssets = useCallback((assets: ImagePicker.ImagePickerAsset[]) => {
    const currentImages = imagesRef.current;
    const available = Math.max(0, MAX_IMAGES - currentImages.length);
    if (available === 0) return;

    const existing = new Set(currentImages.map((item) => (
      fingerprint(item.fileName, item.fileSize, item.mimeType)
    )));
    const accepted: ImageDraftItem[] = [];
    const nextNotices = new Set<string>();

    for (const [assetIndex, asset] of assets.entries()) {
      if (accepted.length >= available) break;
      const mimeType = resolvedMimeType(asset);
      const extension = extensionOf(asset);

      if (extension === 'heic' || extension === 'heif' || extension === 'avif'
        || asset.mimeType === 'image/heic' || asset.mimeType === 'image/heif'
        || asset.mimeType === 'image/avif') {
        nextNotices.add('HEIC와 AVIF 파일은 지원하지 않아요. PNG, JPEG, WEBP 또는 GIF로 바꿔 주세요.');
        continue;
      }
      if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
        nextNotices.add('PNG, JPEG, WEBP, GIF 이미지만 추가할 수 있어요.');
        continue;
      }
      if (typeof asset.fileSize !== 'number') {
        nextNotices.add('파일 크기를 확인할 수 없는 이미지는 추가할 수 없어요.');
        continue;
      }
      if (asset.fileSize > MAX_FILE_SIZE) {
        nextNotices.add('이미지는 한 장당 10MB 이하만 추가할 수 있어요.');
        continue;
      }

      const fileName = assetFileName(asset, assetIndex);
      const key = fingerprint(fileName, asset.fileSize, mimeType);
      if (existing.has(key)) continue;

      const id = `capture-${Date.now()}-${idSequence.current++}`;
      try {
        const uri = cachePickedImage(asset.uri, id, fileName, mimeType);
        accepted.push({
          id,
          order: currentImages.length + accepted.length,
          uri,
          fileName,
          mimeType,
          fileSize: asset.fileSize,
          status: 'queued',
          extractedText: '',
          editedText: '',
          notes: [],
          errorCode: null,
          reviewed: false,
        });
        existing.add(key);
      } catch {
        nextNotices.add('이미지를 보관하지 못했어요. 해당 파일을 다시 선택해 주세요.');
      }
    }

    setNotices(Array.from(nextNotices));
    if (accepted.length === 0) return;
    updateDraft((current) => ({
      ...current,
      primaryInput: 'capture',
      images: [...current.images, ...accepted].slice(0, MAX_IMAGES).map((item, order) => ({
        ...item,
        order,
      })),
    }));
  }, [updateDraft]);

  useEffect(() => {
    if (!hydrated || Platform.OS !== 'android' || pendingConsumed.current) return;
    pendingConsumed.current = true;
    let active = true;

    void ImagePicker.getPendingResultAsync()
      .then((result) => {
        if (active && result && 'canceled' in result && !result.canceled) {
          processAssets(result.assets);
        }
      })
      .catch(() => {
        if (active) setNotices(['중단된 사진 선택 결과를 불러오지 못했어요. 다시 선택해 주세요.']);
      });

    return () => { active = false; };
  }, [hydrated, processAssets]);

  const pickImages = async () => {
    const remaining = MAX_IMAGES - imagesRef.current.length;
    if (remaining <= 0) return;
    setNotices([]);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        orderedSelection: true,
        quality: 1,
      });
      if (!result.canceled) processAssets(result.assets);
    } catch {
      setNotices(['사진 선택기를 열지 못했어요. 잠시 후 다시 시도해 주세요.']);
    }
  };

  const moveImage = (from: number, to: number) => {
    updateDraft((current) => ({ ...current, images: moveDraftImage(current.images, from, to) }));
  };

  const removeImage = (image: ImageDraftItem) => {
    try {
      deleteCachedImage(image.uri);
    } catch {
      setNotices(['기기 캐시 일부를 정리하지 못했지만 목록에서는 삭제했어요.']);
    }
    updateDraft((current) => ({
      ...current,
      images: current.images
        .filter((item) => item.id !== image.id)
        .map((item, order) => ({ ...item, order })),
    }));
  };

  const runExtraction = async (items: ImageDraftItem[]) => {
    if (processing || items.length === 0) return;
    setProcessing(true);
    await runOcrQueue(items, async (image) => {
      updateDraft((current) => ({
        ...current,
        images: current.images.map((item) => item.id === image.id
          ? { ...item, status: 'extracting', errorCode: null }
          : item),
      }));

      try {
        const extracted = await extractImage(image.uri);
        updateDraft((current) => ({
          ...current,
          images: current.images.map((item) => item.id === image.id
            ? {
                ...item,
                status: 'complete',
                extractedText: extracted.rawText,
                editedText: extracted.rawText,
                notes: extracted.notes,
                errorCode: null,
              }
            : item),
        }));
        return extracted;
      } catch (error) {
        updateDraft((current) => ({
          ...current,
          images: current.images.map((item) => item.id === image.id
            ? { ...item, status: 'failed', notes: [OCR_FAILURE_NOTE], errorCode: safeErrorCode(error) }
            : item),
        }));
        throw error;
      }
    }, 2);
    setProcessing(false);
  };

  const completeCount = draft.images.filter((image) => image.status === 'complete').length;
  const failedItems = draft.images.filter((image) => image.status === 'failed');
  const queuedItems = draft.images.filter((image) => image.status === 'queued');
  const extractionLabel = processing ? '텍스트 추출 중' : '텍스트 추출';

  if (!hydrated) return <View style={styles.loading} />;

  return (
    <View style={styles.screen}>
      <ScreenShell bottomInset={28}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>캡처 입력</Text>
          <Text style={styles.title}>대화 캡처를 순서대로 추가하세요</Text>
          <Text style={styles.description}>첫 대화부터 마지막 대화까지 최대 20장입니다.</Text>
        </View>

        <View style={styles.queueHeader}>
          <View>
            <Text style={styles.sectionTitle}>선택한 캡처</Text>
            <Text style={styles.counter}>{draft.images.length} / 20장</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="캡처 추가"
            accessibilityState={{ disabled: draft.images.length >= MAX_IMAGES }}
            disabled={draft.images.length >= MAX_IMAGES}
            onPress={() => { void pickImages(); }}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.addButtonPressed,
              draft.images.length >= MAX_IMAGES && styles.disabled,
            ]}
          >
            <Plus color={colors.background} size={19} strokeWidth={2.2} />
            <Text style={styles.addButtonText}>캡처 추가</Text>
          </Pressable>
        </View>

        {notices.map((notice) => (
          <View key={notice} style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ))}

        {draft.images.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 선택한 캡처가 없어요</Text>
            <Text style={styles.emptyText}>캡처 추가를 눌러 대화 이미지를 고르세요.</Text>
          </View>
        ) : (
          <ImageQueueList images={draft.images} onMove={moveImage} onDelete={removeImage} />
        )}

        {draft.images.length > 0 && (
          <View style={styles.ocrActions}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryComplete}>{completeCount}장 완료</Text>
              {failedItems.length > 0 && (
                <Text style={styles.summaryFailed}>{failedItems.length}장 재시도 필요</Text>
              )}
            </View>
            {queuedItems.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={extractionLabel}
                accessibilityState={{ disabled: processing }}
                disabled={processing}
                onPress={() => { void runExtraction(queuedItems); }}
                style={({ pressed }) => [styles.extractButton, pressed && styles.outlinePressed, processing && styles.disabled]}
              >
                <Text style={styles.extractButtonText}>{extractionLabel}</Text>
              </Pressable>
            )}
            {failedItems.length > 0 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`실패한 ${failedItems.length}장 재시도`}
                accessibilityState={{ disabled: processing }}
                disabled={processing}
                onPress={() => { void runExtraction(failedItems); }}
                style={({ pressed }) => [styles.retryButton, pressed && styles.outlinePressed, processing && styles.disabled]}
              >
                <RefreshCw color={colors.caution} size={18} strokeWidth={2} />
                <Text style={styles.retryButtonText}>실패한 {failedItems.length}장 재시도</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScreenShell>
      <BottomAction
        primary={{
          label: '검수하기',
          disabled: completeCount === 0,
          onPress: () => router.push('/ocr-review'),
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, backgroundColor: colors.background },
  heading: { gap: 6, marginBottom: 24 },
  eyebrow: { color: colors.positive, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', lineHeight: 30 },
  description: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  queueHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  counter: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 2 },
  addButton: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: colors.text,
  },
  addButtonPressed: { opacity: 0.82 },
  addButtonText: { color: colors.background, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  disabled: { opacity: 0.45 },
  notice: {
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: colors.caution,
    backgroundColor: colors.cautionSurface,
  },
  noticeText: { color: colors.caution, fontSize: 13, lineHeight: 19 },
  empty: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.panel,
    backgroundColor: colors.surface,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, textAlign: 'center' },
  ocrActions: { gap: 10, marginTop: 20 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  summaryComplete: { color: colors.positive, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  summaryFailed: { color: colors.caution, fontSize: 13, fontWeight: '700', lineHeight: 19 },
  extractButton: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.positive,
  },
  extractButtonText: { color: colors.positive, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  retryButton: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.caution,
  },
  retryButtonText: { color: colors.caution, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  outlinePressed: { backgroundColor: colors.surface },
});
