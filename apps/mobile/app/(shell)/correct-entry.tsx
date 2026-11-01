import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import type { JournalListData } from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { JournalCorrection } from "../../src/screens/journal-correction";
import { NotAvailable, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";
import { useReloadOnReturn } from "../../src/use-reload-on-return";

/** The journal read's own maximum: the entry being corrected is looked up in
 *  the caller's latest live entries, the same rows the journal tab shows. */
const PAGE = { limit: 50 } as const;

/**
 * CORRECT AN ENTRY — reached from an entry in the Work Journal, never a tab.
 *
 * The entry is identified by id and read back through `journal.list` as the
 * caller, so the form starts from the server's record, not from whatever a
 * previous screen happened to hold. An id that is not among the caller's live
 * entries (already corrected, or not theirs) says so instead of offering a
 * form whose save could only be refused.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  const journal = useCapability<JournalListData>("journal.list", PAGE);
  useReloadOnReturn(journal.reload);

  // The screen stays mounted between visits (Tabs): every visit starts a
  // fresh form, never the previous visit's preview or saved state.
  const [visit, setVisit] = useState(0);
  useFocusEffect(useCallback(() => setVisit((n) => n + 1), []));

  const done = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(shell)/journal");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View testID="journal-correct-title">
            <Title>{t("journal.correct.title")}</Title>
          </View>
          <CapabilityGate
            state={journal.state}
            reload={journal.reload}
            refusalText={(code) =>
              code === "no_worker_profile" ? t("profile.noWorkerProfile") : null
            }
          >
            {(data) => {
              const entry = data.entries.find((e) => e.entryId === entryId);
              if (!entry) {
                return (
                  <NotAvailable
                    testID="journal-correct-missing"
                    title={t("journal.correct.missingTitle")}
                    body={t("journal.correct.notFound")}
                  />
                );
              }
              return (
                <JournalCorrection
                  key={`${entry.entryId}-${visit}`}
                  entry={entry}
                  onDone={done}
                />
              );
            }}
          </CapabilityGate>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  flex: { flex: 1 },
  content: { padding: theme.space.md, gap: theme.space.md },
});
