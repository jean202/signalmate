import type { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors } from './theme';

type ScreenShellProps = PropsWithChildren<{
  contentContainerStyle?: StyleProp<ViewStyle>;
  bottomInset?: number;
  testID?: string;
}>;

export function ScreenShell({
  children,
  contentContainerStyle,
  bottomInset = 104,
  testID,
}: ScreenShellProps) {
  return (
    <SafeAreaView style={styles.safeArea} testID={testID}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset }, contentContainerStyle]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 20 },
});
