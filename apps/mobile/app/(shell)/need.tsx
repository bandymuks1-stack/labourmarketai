import React, { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useLocale } from "../../src/i18n/locale-context";
import { NeedIntakeScreen } from "../../src/screens/need-intake";
import { Title } from "../../src/ui/primitives";
import { useWorkspaceEpoch } from "../../src/workspace-epoch";
import { theme } from "../../src/ui/theme";

/** POST A NEED — a station reached from Today (`href: null`), for the
 *  organization the person is acting for. */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  // This station stays mounted in the Tabs navigator, so a finished (or
  // cancelled) need would greet the next visit with its old state. A new key
  // mounts a fresh form for the next need.
  const [intake, setIntake] = useState(0);
  // A preview and its confirmation token belong to the workspace that drafted
  // them: after a switch the form starts over, so Confirm can never send a
  // need drafted for one organization into another (the server resolves the
  // employer again at confirm time).
  const { epoch } = useWorkspaceEpoch();
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Title>{t("need.title")}</Title>
        <NeedIntakeScreen
          key={`${epoch}:${intake}`}
          onDone={() => {
            setIntake((n) => n + 1);
            router.push("/(shell)/today");
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
});
