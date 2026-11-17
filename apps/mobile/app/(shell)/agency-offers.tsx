import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocale } from "../../src/i18n/locale-context";
import { AgencyOffersScreen } from "../../src/screens/agency-offers";
import { Title } from "../../src/ui/primitives";
import { useWorkspaceEpoch } from "../../src/workspace-epoch";
import { theme } from "../../src/ui/theme";

/**
 * AGENCY OFFERS — reached from Today (employer workspace), outside the tab
 * bar. A prepared answer belongs to the workspace that prepared it; a switch
 * starts the screen over.
 */
export default function Screen() {
  const { t } = useLocale();
  const { epoch } = useWorkspaceEpoch();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("agencyOffers.title")}</Title>
        <AgencyOffersScreen key={epoch} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
