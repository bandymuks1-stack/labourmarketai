import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ACTIVE_LOCALES, isPreviewTranslation } from "@labourmarket/client-core";

import { useActorContext } from "../../src/context-provider";
import { useAuth } from "../../src/auth-context";
import { useLocale } from "../../src/i18n/locale-context";
import { LANGUAGE_NAMES } from "../../src/i18n/messages";
import { Body, Button, Divider, NotAvailable, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";

/**
 * SETTINGS — the screen that actually works today.
 *
 * Language and sign-out need nothing from the canonical domain, so they are
 * real. Context switching needs to know which contexts the person holds, which
 * is a read this client cannot make yet, so it says so instead of guessing.
 *
 * Every active language is offered, and the ones that are AI-seeded and
 * awaiting human review are labelled as previews (doctrine §7.4) — the same
 * honesty the web selector applies. A person choosing Russian should know it
 * has not been read by a Russian speaker yet.
 */
export default function Settings() {
  const { locale, setLocale, t } = useLocale();
  const { holdings, active, switchTo } = useActorContext();
  const { signOut, busy, state } = useAuth();

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("language.title")}</Title>
        <View style={styles.list}>
          {ACTIVE_LOCALES.map((code) => {
            const selected = code === locale;
            return (
              <Pressable
                key={code}
                testID={`language-${code}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={LANGUAGE_NAMES[code]}
                onPress={() => void setLocale(code)}
                style={({ pressed }) => [
                  styles.row,
                  selected && styles.rowSelected,
                  pressed && styles.rowPressed,
                ]}
              >
                <Text style={styles.rowLabel}>{LANGUAGE_NAMES[code]}</Text>
                {isPreviewTranslation(code) ? (
                  <Text style={styles.tag}>{t("language.preview")}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Divider />

        <Title>{t("context.title")}</Title>
        {holdings.status === "known" ? (
          <View style={styles.list}>
            {holdings.contexts.map((context) => (
              <Pressable
                key={context.label + context.mode}
                accessibilityRole="radio"
                accessibilityState={{ selected: active?.label === context.label }}
                onPress={() => switchTo(context)}
                style={styles.row}
              >
                <Text style={styles.rowLabel}>{context.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <NotAvailable
            title={t("context.unavailable.title")}
            body={t("context.unavailable.body")}
          />
        )}

        <Divider />

        {state.status === "signed_in" ? (
          // The account's own identifier, not a name we could only have got by
          // reading a profile we cannot read. Showing the wrong person's name
          // would be worse than showing none.
          <Body muted>{state.session.userId}</Body>
        ) : null}
        <Button
          testID="sign-out"
          variant="quiet"
          busy={busy}
          label={t("auth.signOut")}
          onPress={() => void signOut()}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  list: { gap: theme.space.sm },
  row: {
    minHeight: theme.minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space.md,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  rowSelected: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.surfaceRaised,
  },
  rowPressed: { opacity: 0.75 },
  rowLabel: { color: theme.color.text, fontSize: theme.font.body },
  tag: {
    color: theme.color.warning,
    fontSize: theme.font.small,
  },
});
