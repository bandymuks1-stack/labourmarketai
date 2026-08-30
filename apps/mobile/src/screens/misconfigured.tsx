import React from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocale } from "../i18n/locale-context";
import { theme } from "../ui/theme";
import { NotAvailable, Title } from "../ui/primitives";

/**
 * A build that cannot work says so, specifically.
 *
 * The alternative — a sign-in form that always fails — is worse than useless:
 * it asks a person for a password, refuses it, and teaches them the product is
 * broken when the actual fault is a missing build value.
 *
 * The problem descriptions come from `@labourmarket/client-core` and name the
 * KEY, never the value. An error screen is a screenshot waiting to happen.
 */
export function MisconfiguredScreen({
  problems,
}: {
  problems: readonly string[];
}) {
  const { t } = useLocale();
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("config.problem.title")}</Title>
        <NotAvailable
          tone="warning"
          title={t("app.name")}
          body={t("config.problem.body")}
        >
          {problems.map((problem) => (
            <Text key={problem} style={styles.problem}>
              • {problem}
            </Text>
          ))}
        </NotAvailable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  problem: {
    color: theme.color.warning,
    fontSize: theme.font.small,
    fontFamily: theme.font.mono,
  },
});
