import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import type {
  LivingCvSkillsData,
  ProfileGetData,
  WorkIntelligenceData,
} from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityFailureNotice } from "../../src/screens/capability-failure";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { SkillFigureList } from "../../src/screens/work-figures";
import { Body, Button, Divider, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

/** All time — the Living CV's own scope for a skill's hours. */
const ALL_TIME = { period: "all" } as const;

/**
 * PROFILE — the profile record and the Living CV skills, each read through
 * its canonical capability (`profile.get`, `living_cv.skills.get`), with
 * the skills' recorded hours · share · entries from
 * `journal.work_intelligence.get` — the same figures, in the same order, as
 * the website's Living CV (owner requirement 17, #1724).
 *
 * Three independent gates. The skills list renders as soon as the skill
 * rows are loaded; the figures read may still be loading or may have
 * failed, and the list then SAYS its figures could not be read rather than
 * showing 0 h (UNKNOWN ≠ ZERO). A skill's group names the recorded fact
 * behind it — a manager's confirmation, the Work Journal, the person's own
 * declaration — so an unconfirmed skill never quietly looks confirmed (no
 * fake verification, doctrine §7).
 */
export default function Screen() {
  const { t } = useLocale();
  const router = useRouter();
  const profile = useCapability<ProfileGetData>("profile.get");
  const skills = useCapability<LivingCvSkillsData>("living_cv.skills.get");
  const figures = useCapability<WorkIntelligenceData>(
    "journal.work_intelligence.get",
    ALL_TIME,
  );

  // Loaded figures, or null while loading / after a failure. The list is
  // told which, and never invents a figure for either.
  const figuresData: WorkIntelligenceData | null =
    figures.state.status === "loaded" ? figures.state.data : null;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{t("nav.profile")}</Title>
        <CapabilityGate state={profile.state} reload={profile.reload}>
          {(data) => (
            <View style={styles.identity}>
              <Body>
                {data.profile.fullName ?? data.profile.email ?? data.profile.id}
              </Body>
              {data.profile.fullName !== null && data.profile.email !== null ? (
                <Body muted>{data.profile.email}</Body>
              ) : null}
            </View>
          )}
        </CapabilityGate>
        <Divider />
        <Title>{t("profile.figuresTitle")}</Title>
        {figures.state.status === "failed" &&
        !(
          figures.state.failure.kind === "capability_refused" &&
          figures.state.failure.code === "no_worker_profile"
        ) ? (
          // The figures read failed on its own: shown as the failure it is,
          // with a retry, above a list that also says so per row. A
          // no-worker refusal is already the skills gate's sentence — not
          // repeated here.
          <CapabilityFailureNotice
            failure={figures.state.failure}
            retry={figures.reload}
            testID="profile-figures-failed"
          />
        ) : null}
        <CapabilityGate
          state={skills.state}
          reload={skills.reload}
          refusalText={(code) =>
            code === "no_worker" ? t("profile.noWorkerProfile") : null
          }
        >
          {(data) =>
            data.skills.length === 0 ? (
              <Body muted>{t("profile.skillsEmpty")}</Body>
            ) : (
              <SkillFigureList rows={data.skills} figures={figuresData} />
            )
          }
        </CapabilityGate>
        <Button
          variant="quiet"
          testID="profile-open-journal"
          label={t("profile.openJournal")}
          onPress={() => router.push("/(shell)/journal")}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  identity: { gap: theme.space.xs },
});
