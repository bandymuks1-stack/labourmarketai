import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocale } from "../../src/i18n/locale-context";
import { OffersScreen } from "../../src/screens/offers";
import { Title } from "../../src/ui/primitives";
import { useWorkspaceEpoch } from "../../src/workspace-epoch";
import { theme } from "../../src/ui/theme";

/**
 * OFFERS — reached from Today, outside the tab bar (`href: null`, same as
 * Opportunities). A prepared answer belongs to the workspace that prepared
 * it; a switch starts the station over.
 */
export default function Screen() {
  const { t } = useLocale();
  const { epoch } = useWorkspaceEpoch();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{t("offers.title")}</Title>
        <OffersScreen key={epoch} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
