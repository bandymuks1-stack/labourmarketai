import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocale } from "../../src/i18n/locale-context";
import { AgencyScreen } from "../../src/screens/agency";
import { Title } from "../../src/ui/primitives";
import { useWorkspaceEpoch } from "../../src/workspace-epoch";
import { theme } from "../../src/ui/theme";

/**
 * AGENCY — reached from Today (organization workspace), outside the tab
 * bar. A prepared answer belongs to the workspace that prepared it; a switch
 * starts the screen over.
 */
export default function Screen() {
  const { t } = useLocale();
  const { epoch } = useWorkspaceEpoch();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("agency.title")}</Title>
        <AgencyScreen key={epoch} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
