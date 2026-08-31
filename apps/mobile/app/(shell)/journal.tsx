import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { JournalListData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { JournalEntryList } from "../../src/screens/journal-entries";
import { Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

const PAGE = { limit: 20 } as const;

/**
 * WORK JOURNAL — the caller's own entries, read through `journal.list`:
 * the same live rows the web journal page shows, under the same RLS.
 * Reading only, this slice — writing goes through the draft→confirm
 * capabilities and is a slice of its own.
 */
export default function Screen() {
  const { t } = useLocale();
  const journal = useCapability<JournalListData>("journal.list", PAGE);

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("nav.journal")}</Title>
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
});
