import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DuplicateCandidate } from '../../lib/analysis/input-builder';
import { colors, radius, touchTarget } from '../ui/theme';

type DuplicateCandidateListProps = {
  candidates: readonly DuplicateCandidate[];
  excludedIds: readonly string[];
  onToggle: (candidateId: string) => void;
};

export function DuplicateCandidateList({
  candidates,
  excludedIds,
  onToggle,
}: DuplicateCandidateListProps) {
  if (candidates.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>중복 후보</Text>
        <Text style={styles.description}>제외할 반복 메시지만 직접 선택하세요.</Text>
      </View>
      <View style={styles.list}>
        {candidates.map((candidate) => {
          const checked = excludedIds.includes(candidate.id);
          return (
            <Pressable
              key={candidate.id}
              accessibilityRole="checkbox"
              accessibilityLabel={`중복 제외: ${candidate.text}`}
              accessibilityState={{ checked }}
              onPress={() => onToggle(candidate.id)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                {checked && <View style={styles.checkmark} />}
              </View>
              <Text style={styles.text}>{candidate.text}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  heading: { gap: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  list: { borderTopWidth: 1, borderTopColor: colors.border },
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.surface },
  checkbox: {
    width: 22,
    height: 22,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.background,
  },
  checkboxChecked: { borderColor: colors.positive, backgroundColor: colors.positive },
  checkmark: {
    width: 9,
    height: 5,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: colors.background,
    transform: [{ rotate: '-45deg' }],
  },
  text: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, lineHeight: 20 },
});
