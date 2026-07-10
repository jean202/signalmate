import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, touchTarget } from './theme';

type Action = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

type BottomActionProps = {
  primary: Action;
  secondary?: Action;
};

export function BottomAction({ primary, secondary }: BottomActionProps) {
  return (
    <View style={styles.container}>
      {secondary && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={secondary.accessibilityLabel ?? secondary.label}
          accessibilityState={{ disabled: secondary.disabled }}
          disabled={secondary.disabled}
          onPress={secondary.onPress}
          style={({ pressed }) => [styles.secondary, pressed && !secondary.disabled && styles.pressed]}
        >
          <Text style={styles.secondaryText}>{secondary.label}</Text>
        </Pressable>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={primary.accessibilityLabel ?? primary.label}
        accessibilityState={{ disabled: primary.disabled }}
        disabled={primary.disabled}
        onPress={primary.onPress}
        style={({ pressed }) => [
          styles.primary,
          pressed && !primary.disabled && styles.primaryPressed,
          primary.disabled && styles.disabled,
        ]}
      >
        <Text style={styles.primaryText}>{primary.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  primary: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.control,
    backgroundColor: colors.positive,
  },
  primaryPressed: { opacity: 0.86 },
  primaryText: { color: colors.background, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  secondary: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.control,
  },
  secondaryText: { color: colors.muted, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  pressed: { backgroundColor: colors.surface },
  disabled: { opacity: 0.45 },
});
