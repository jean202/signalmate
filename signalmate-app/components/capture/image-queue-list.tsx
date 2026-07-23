import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react-native';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ImageDraftItem } from '../../lib/analysis/types';
import { colors, radius, touchTarget } from '../ui/theme';

const STATUS_LABEL: Record<ImageDraftItem['status'], string> = {
  queued: '추출 대기',
  extracting: '추출 중',
  complete: '추출 완료',
  failed: '추출 실패',
};

type ImageQueueListProps = {
  images: ImageDraftItem[];
  onMove: (from: number, to: number) => void;
  onDelete: (image: ImageDraftItem) => void;
};

type IconButtonProps = {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  children: React.ReactNode;
};

function IconButton({ label, disabled, onPress, children }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled && styles.iconButtonPressed,
        disabled && styles.iconButtonDisabled,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function ImageQueueList({ images, onMove, onDelete }: ImageQueueListProps) {
  return (
    <View style={styles.list}>
      {images.map((image, index) => (
        <View key={image.id} style={styles.item} testID={`capture-item-${image.id}`}>
          <View style={styles.infoRow} testID={`capture-info-row-${image.id}`}>
            <View style={styles.sequence}>
              <Text style={styles.sequenceText}>{index + 1}</Text>
            </View>
            <Image accessibilityLabel={`${image.fileName} 미리보기`} source={{ uri: image.uri }} style={styles.thumbnail} />
            <View style={styles.details}>
              <Text numberOfLines={2} style={styles.fileName} testID="capture-file-name">
                {image.fileName}
              </Text>
              <Text style={[
                styles.status,
                image.status === 'complete' && styles.statusComplete,
                image.status === 'failed' && styles.statusFailed,
              ]}>
                {STATUS_LABEL[image.status]}
              </Text>
              {image.status === 'failed' && image.notes[0] && (
                <Text numberOfLines={2} style={styles.failureNote}>{image.notes[0]}</Text>
              )}
            </View>
          </View>
          <View style={styles.actionRow} testID={`capture-action-row-${image.id}`}>
            <IconButton
              label={`${image.fileName} 위로 이동`}
              disabled={index === 0}
              onPress={() => onMove(index, index - 1)}
            >
              <ArrowUp color={colors.text} size={19} strokeWidth={2} />
            </IconButton>
            <IconButton
              label={`${image.fileName} 아래로 이동`}
              disabled={index === images.length - 1}
              onPress={() => onMove(index, index + 1)}
            >
              <ArrowDown color={colors.text} size={19} strokeWidth={2} />
            </IconButton>
            <IconButton label={`${image.fileName} 삭제`} onPress={() => onDelete(image)}>
              <Trash2 color={colors.danger} size={19} strokeWidth={2} />
            </IconButton>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: colors.border },
  item: {
    minHeight: 148,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoRow: {
    width: '100%',
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sequence: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: colors.surface,
  },
  sequenceText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  thumbnail: { width: 54, height: 68, borderRadius: 6, backgroundColor: colors.surface },
  details: { flex: 1, minWidth: 0, gap: 5 },
  fileName: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  status: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  statusComplete: { color: colors.positive, fontWeight: '700' },
  statusFailed: { color: colors.caution, fontWeight: '700' },
  failureNote: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  actionRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  iconButtonPressed: { backgroundColor: colors.surface },
  iconButtonDisabled: { opacity: 0.3 },
});
