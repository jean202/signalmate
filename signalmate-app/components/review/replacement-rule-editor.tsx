import { Plus, Trash2 } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ReplacementRule } from '../../lib/analysis/types';
import { countReplacementChanges } from '../../lib/analysis/input-builder';
import { colors, radius, touchTarget } from '../ui/theme';

type ReplacementRuleEditorProps = {
  text: string;
  rules?: readonly ReplacementRule[];
  onRulesChange?: (rules: ReplacementRule[]) => void;
  onApply?: (rules: ReplacementRule[]) => void;
};

function overlaps(left: string, right: string): boolean {
  return left.length > 0 && right.length > 0
    && (left.includes(right) || right.includes(left));
}

function conflictMessage(
  rules: readonly ReplacementRule[],
  source: string,
  replacement: string,
): string | null {
  if (!source.trim()) return null;
  if (rules.some((rule) => rule.source === source)) {
    return '같은 원문의 치환 규칙이 이미 있어요.';
  }
  if (rules.some((rule) => overlaps(source, rule.replacement))) {
    return '원문이 저장된 치환값과 겹쳐 반복 적용될 수 있어요.';
  }
  if ([source, ...rules.map((rule) => rule.source)]
    .some((ruleSource) => ruleSource.length > 0 && replacement.includes(ruleSource))) {
    return '치환값에 규칙 원문이 포함되어 반복 적용될 수 있어요.';
  }
  return null;
}

export function ReplacementRuleEditor({
  text,
  rules = [],
  onRulesChange,
  onApply,
}: ReplacementRuleEditorProps) {
  const [source, setSource] = useState('');
  const [replacement, setReplacement] = useState('');
  const sequence = useRef(0);
  const sourceIsEmpty = source.trim().length === 0;
  const ruleConflict = conflictMessage(rules, source, replacement);
  const addDisabled = sourceIsEmpty || ruleConflict !== null;
  const matchCount = sourceIsEmpty ? 0 : countReplacementChanges(text, [{
    id: 'pending-rule-preview', source, replacement,
  }]);
  const savedRuleMatchCount = countReplacementChanges(text, rules);

  const addRule = () => {
    if (addDisabled) return;
    sequence.current += 1;
    onRulesChange?.([
      ...rules,
      {
        id: `replacement-rule-${Date.now()}-${sequence.current}`,
        source,
        replacement,
      },
    ]);
    setSource('');
    setReplacement('');
  };

  const removeRule = (ruleId: string) => {
    onRulesChange?.(rules.filter((rule) => rule.id !== ruleId));
  };

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>개인정보 치환</Text>
        <Text style={styles.description}>원문과 바꿀 값을 등록한 뒤 전체 텍스트에 적용하세요.</Text>
      </View>

      <View style={styles.fields}>
        <View style={styles.field}>
          <Text style={styles.label}>원문</Text>
          <TextInput
            accessibilityLabel="원문"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSource}
            placeholder="예: 홍길동"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={source}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>치환값</Text>
          <TextInput
            accessibilityLabel="치환값"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setReplacement}
            placeholder="예: [내이름]"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={replacement}
          />
        </View>
      </View>

      <View style={styles.previewRow}>
        <Text accessibilityLiveRegion="polite" style={styles.matchCount}>
          {matchCount}곳이 변경돼요
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="치환 규칙 추가"
          accessibilityState={{ disabled: addDisabled }}
          disabled={addDisabled}
          onPress={addRule}
          style={({ pressed }) => [
            styles.addButton,
            pressed && !addDisabled && styles.pressed,
            addDisabled && styles.disabled,
          ]}
        >
          <Plus color={colors.text} size={18} strokeWidth={2.2} />
          <Text style={styles.addButtonText}>규칙 추가</Text>
        </Pressable>
      </View>

      {ruleConflict && (
        <Text accessibilityLiveRegion="polite" style={styles.conflictMessage}>
          {ruleConflict}
        </Text>
      )}

      {rules.length > 0 && (
        <>
          <View style={styles.ruleList}>
            {rules.map((rule) => (
              <View key={rule.id} style={styles.ruleRow}>
                <View style={styles.ruleText}>
                  <Text numberOfLines={2} style={styles.ruleSource}>{rule.source}</Text>
                  <Text style={styles.ruleArrow}>바꾸기</Text>
                  <Text numberOfLines={2} style={styles.ruleReplacement}>{rule.replacement || '(삭제)'}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${rule.source} 치환 규칙 삭제`}
                  onPress={() => removeRule(rule.id)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Trash2 color={colors.danger} size={19} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
          </View>
          <Text accessibilityLiveRegion="polite" style={styles.savedMatchCount}>
            저장 규칙 전체 적용 시 {savedRuleMatchCount}곳이 변경돼요
          </Text>
        </>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="치환 규칙 전체 적용"
        accessibilityState={{ disabled: rules.length === 0 }}
        disabled={rules.length === 0}
        onPress={() => onApply?.([...rules])}
        style={({ pressed }) => [
          styles.applyButton,
          pressed && rules.length > 0 && styles.applyPressed,
          rules.length === 0 && styles.disabled,
        ]}
      >
        <Text style={styles.applyButtonText}>전체 적용</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  heading: { gap: 4 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  fields: { gap: 12 },
  field: { gap: 6 },
  label: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  input: {
    minHeight: touchTarget,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.control,
    backgroundColor: colors.background,
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  previewRow: {
    minHeight: touchTarget,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  matchCount: { color: colors.positive, fontSize: 13, fontWeight: '700', lineHeight: 18 },
  conflictMessage: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  savedMatchCount: { color: colors.muted, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  addButton: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: radius.control,
  },
  addButtonText: { color: colors.text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  ruleList: { borderTopWidth: 1, borderTopColor: colors.border },
  ruleRow: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ruleText: { flex: 1, minWidth: 0, gap: 2 },
  ruleSource: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  ruleArrow: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  ruleReplacement: { color: colors.positive, fontSize: 14, fontWeight: '700', lineHeight: 19 },
  iconButton: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control,
  },
  applyButton: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.positive,
    borderRadius: radius.control,
    backgroundColor: colors.positiveSurface,
  },
  applyPressed: { opacity: 0.82 },
  applyButtonText: { color: colors.positive, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  pressed: { backgroundColor: colors.surface },
  disabled: { opacity: 0.4 },
});
