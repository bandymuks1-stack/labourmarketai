import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { JournalListData, ProfileGetData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { JournalEntryList } from "../../src/screens/journal-entries";
import { Body, Divider, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

const RECENT_LIMIT = { limit: 5 } as const;

/**
 * TODAY — who is signed in, and their most recent recorded work.
 *
 * Two reads through the canonical capabilities (`profile.get`,
 * `journal.list`), each gated independently so a failing journal read cannot
 * take the person's own name down with it. Everything shown is a recorded
 * fact from the server; a failed read renders as the failure it is.
 */
export default function Screen() {
  const { t } = useLocale();
  const profile = useCapability<ProfileGetData>("profile.get");
  const journal = useCapability<JournalListData>("journal.list", RECENT_LIMIT);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("nav.today")}</Title>
        <CapabilityGate state={profile.state} reload={profile.reload}>
          {(data) => (
            <View style={styles.identity}>
              <Body muted>{t("today.signedInAs")}</Body>
              <Body>
                {data.profile.fullName ?? data.profile.email ?? data.profile.id}
              </Body>
            </View>
          )}
        </CapabilityGate>
        <Divider />
        <Title>{t("today.recentWork")}</Title>
        <CapabilityGate
          state={journal.state}
          reload={journal.reload}
          refusalText={(code) =>
            code === "no_worker_profile" ? t("profile.noWorkerProfile") : null
          }
        >
          {(data) => <JournalEntryList entries={data.entries} />}
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  identity: { gap: theme.space.xs },
});
