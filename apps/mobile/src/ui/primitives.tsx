import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { theme } from "./theme";

/**
 * The shell's primitives.
 *
 * Named as primitives rather than as product components on purpose: nothing
 * here is a "card" or a "panel" that a screen could quietly turn into a new
 * product surface. Screens compose these; the surfaces themselves are declared
 * and reviewed.
 */

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  // `accessibilityRole="header"` is what lets a screen reader user jump
  // between sections instead of reading every line to find them.
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  busy = false,
  variant = "primary",
  testID,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  variant?: "primary" | "quiet";
  testID?: string;
}) {
  const disabled = busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={label}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "quiet" && styles.buttonQuiet,
        pressed && styles.buttonPressed,
        disabled && styles.buttonDisabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={theme.color.accentText} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            variant === "quiet" && styles.buttonQuietLabel,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.color.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

/**
 * An honest statement that something is not available, and why.
 *
 * This is the component that keeps the app from lying. It is used wherever a
 * screen would otherwise render an empty list — because an empty list reads as
 * "you have nothing", and the truth is "we could not ask".
 */
export function NotAvailable({
  title,
  body,
  tone = "info",
  children,
}: {
  title: string;
  body: string;
  tone?: "info" | "warning";
  children?: React.ReactNode;
}) {
  return (
    <View
      accessible
      accessibilityRole="summary"
      style={[styles.notice, tone === "warning" && styles.noticeWarning]}
    >
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
      {children}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.color.background,
    padding: theme.space.md,
    gap: theme.space.md,
  },
  title: {
    color: theme.color.text,
    fontSize: theme.font.title,
    fontWeight: "700",
  },
  body: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
  muted: { color: theme.color.textMuted },
  button: {
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.space.md,
  },
  buttonQuiet: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: {
    color: theme.color.accentText,
    fontSize: theme.font.body,
    fontWeight: "600",
  },
  buttonQuietLabel: { color: theme.color.text },
  field: { gap: theme.space.xs },
  fieldLabel: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
  input: {
    minHeight: theme.minTouchTarget,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    color: theme.color.text,
    fontSize: theme.font.body,
    paddingHorizontal: theme.space.md,
  },
  notice: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.sm,
  },
  noticeWarning: { borderColor: theme.color.warning },
  noticeTitle: {
    color: theme.color.text,
    fontSize: theme.font.body,
    fontWeight: "700",
  },
  noticeBody: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
    lineHeight: theme.font.small * 1.5,
  },
  divider: {
    height: 1,
    backgroundColor: theme.color.border,
  },
});
