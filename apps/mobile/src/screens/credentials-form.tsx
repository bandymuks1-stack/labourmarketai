import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";

import { useAuth, type AuthFailure } from "../auth-context";
import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Button, Field, NotAvailable, Title } from "../ui/primitives";
import { theme } from "../ui/theme";

/**
 * Sign in and register are the same three fields and the same failure
 * vocabulary, so they are one component with two modes rather than two files
 * that drift.
 *
 * ## Failures are kept apart
 *
 * "Wrong password" and "we could not reach the server" are different facts.
 * Showing the first when the second happened sends a person to reset a
 * password that was never wrong — the same defect class as #1314, met on the
 * very first screen of the app.
 */

function failureKey(failure: AuthFailure): MessageKey {
  switch (failure.kind) {
    case "rejected":
      return "auth.error.rejected";
    case "unreachable":
      return "auth.error.unreachable";
    case "confirmation_required":
      return "auth.error.confirmationRequired";
    case "not_configured":
      return "auth.error.notConfigured";
  }
}

export function CredentialsForm({ mode }: { mode: "sign-in" | "register" }) {
  const { signIn, register, busy } = useAuth();
  const { t } = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  const submit = async () => {
    setFailure(null);
    const result =
      mode === "sign-in"
        ? await signIn(email, password)
        : await register(email, password);
    // Success navigates by itself: the auth state changes, and the gate at
    // `app/index.tsx` is what decides where a signed-in person goes. No screen
    // pushes a route on the strength of its own local success.
    if (result !== null) setFailure(result);
  };

  const isSignIn = mode === "sign-in";

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Title>{isSignIn ? t("auth.signIn.title") : t("auth.register.title")}</Title>

          <Field
            testID="email"
            label={t("auth.signIn.email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            inputMode="email"
          />
          <Field
            testID="password"
            label={t("auth.signIn.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            // `newPassword` on register tells the OS password manager to offer
            // to generate and save one, which is the single largest thing this
            // screen can do for account security.
            textContentType={isSignIn ? "password" : "newPassword"}
            autoComplete={isSignIn ? "current-password" : "new-password"}
          />

          {failure !== null ? (
            <NotAvailable
              testID="auth-failure"
              tone={failure.kind === "rejected" ? "warning" : "info"}
              title={
                isSignIn ? t("auth.signIn.title") : t("auth.register.title")
              }
              body={t(failureKey(failure))}
            />
          ) : null}

          <Button
            testID="submit"
            busy={busy}
            label={isSignIn ? t("auth.signIn.submit") : t("auth.register.submit")}
            onPress={() => void submit()}
          />

          <Link
            testID="switch-mode"
            href={isSignIn ? "/register" : "/sign-in"}
            accessibilityRole="link"
            style={styles.link}
          >
            {isSignIn ? t("auth.signIn.toRegister") : t("auth.register.toSignIn")}
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: {
    padding: theme.space.md,
    gap: theme.space.md,
    flexGrow: 1,
    justifyContent: "center",
  },
  link: {
    color: theme.color.accent,
    fontSize: theme.font.body,
    // A link is a tap target, so it gets the same minimum height as a button.
    minHeight: theme.minTouchTarget,
    lineHeight: theme.minTouchTarget,
    textAlign: "center",
  },
});
