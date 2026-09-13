import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import type {
  JournalListData,
  ProfileGetData,
  WorkIntelligenceData,
} from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { JournalEntryList } from "../../src/screens/journal-entries";
import { TodayFigures } from "../../src/screens/work-figures";
import { Body, Button, Divider, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

const RECENT_LIMIT = { limit: 5 } as const;
/** The week scope: `periods` still carries every window (today included);
 *  `skills` then describes the last 7 days, which is what the dominant
 *  skill on ŠIANDIEN is about. */
const WEEK_SCOPE = { period: "week" } as const;

/**
 * TODAY (ŠIANDIEN) — who is signed in, what their work adds up to today and
 * this week, and their most recent recorded work.
 *
 * Three reads through the canonical capabilities (`profile.get`,
 * `journal.work_intelligence.get`, `journal.list`), each gated independently
 * so a failing figures read cannot take the person's own name or their
 * entries down with it. The figures are the SAME the website shows — the
 * one work-time rule on the server — and a failed figures read renders as
 * the failure it is, never as 0 h (#1314, SEP-7).
 *
 * The stations the web reaches from ŠIANDIEN are reachable from here too:
 * the work journal and the profile with its skills.
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const profile = useCapability<ProfileGetData>("profile.get");
  const figures = useCapability<WorkIntelligenceData>(
    "journal.work_intelligence.get",
    WEEK_SCOPE,
  );
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
        <Title>{t("today.figuresTitle")}</Title>
        <CapabilityGate
          state={figures.state}
          reload={figures.reload}
          refusalText={(code) =>
            code === "no_worker_profile" ? t("profile.noWorkerProfile") : null
          }
        >
          {(data) => <TodayFigures data={data} />}
        </CapabilityGate>
        <View style={styles.stations}>
          <Button
            variant="quiet"
            testID="today-open-journal"
            label={t("today.openJournal")}
            onPress={() => router.push("/(shell)/journal")}
          />
          <Button
            variant="quiet"
            testID="today-open-profile"
            label={t("today.openProfile")}
            onPress={() => router.push("/(shell)/profile")}
          />
        </View>
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
  stations: { gap: theme.space.sm },
});
