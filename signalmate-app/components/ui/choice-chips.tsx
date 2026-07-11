import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, touchTarget } from './theme';

export type ChoiceChipOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SharedProps<T extends string> = {
  options: readonly ChoiceChipOption<T>[];
  accessibilityLabel?: string;
};

type SingleChoiceProps<T extends string> = SharedProps<T> & {
  multiple?: false;
  value: T | null;
  onChange: (value: T) => void;
};

type MultipleChoiceProps<T extends string> = SharedProps<T> & {
  multiple: true;
  value: readonly T[];
  onChange: (value: T[]) => void;
};

type ChoiceChipsProps<T extends string> = SingleChoiceProps<T> | MultipleChoiceProps<T>;

export function ChoiceChips<T extends string>(props: ChoiceChipsProps<T>) {
  const isSelected = (option: T) => Array.isArray(props.value)
    ? props.value.includes(option)
    : props.value === option;

  const select = (option: T) => {
    if (props.multiple) {
      props.onChange(isSelected(option)
        ? props.value.filter((value) => value !== option)
        : [...props.value, option]);
      return;
    }
    props.onChange(option);
  };

  return (
    <View accessibilityLabel={props.accessibilityLabel} style={styles.container}>
      {props.options.map((option) => {
        const selected = isSelected(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled: option.disabled }}
            disabled={option.disabled}
            onPress={() => select(option.value)}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && !option.disabled && styles.chipPressed,
              option.disabled && styles.chipDisabled,
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
  container: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: touchTarget,
    maxWidth: '100%',
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipSelected: {
    borderColor: colors.positive,
    backgroundColor: colors.positiveSurface,
  },
  chipPressed: { backgroundColor: colors.surface },
  chipDisabled: { opacity: 0.45 },
  label: {
    maxWidth: '100%',
    flexShrink: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  labelSelected: { color: colors.positive, fontWeight: '700' },
});
