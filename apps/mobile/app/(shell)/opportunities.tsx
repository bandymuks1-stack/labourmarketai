import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocale } from "../../src/i18n/locale-context";
import { OpportunitiesScreen } from "../../src/screens/opportunities";
import { Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";

/**
 * OPPORTUNITIES — reached from Today, outside the tab bar (`href: null` in
 * the shell layout, same as Log work): a fifth tab is the label that
 * truncates at the largest text size, and this is a station, not a home.
 */
export default function Screen() {
  const { t } = useLocale();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{t("opportunities.title")}</Title>
        <OpportunitiesScreen />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
