import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, touchTarget } from './theme';

export type SegmentedControlOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SegmentedControlOption<T>[];
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.container}>
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.optionSelected,
              pressed && !option.disabled && styles.optionPressed,
              option.disabled && styles.optionDisabled,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 4,
    padding: 3,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  option: {
    flex: 1,
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 5,
  },
  optionSelected: {
    borderBottomWidth: 2,
    borderBottomColor: colors.positive,
    backgroundColor: colors.background,
  },
  optionPressed: { backgroundColor: colors.positiveSurface },
  optionDisabled: { opacity: 0.45 },
  label: { color: colors.muted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  labelSelected: { color: colors.text, fontWeight: '700' },
});
