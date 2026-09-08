import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type {
  LivingCvSkillsData,
  ProfileGetData,
} from "../../src/capability-shapes";
import { useLocale } from "../../src/i18n/locale-context";
import { CapabilityGate } from "../../src/screens/capability-gate";
import { Body, Divider, Title } from "../../src/ui/primitives";
import { theme } from "../../src/ui/theme";
import { useCapability } from "../../src/use-capability";

/**
 * PROFILE — the profile record and the Living CV skills, each read through
 * its canonical capability (`profile.get`, `living_cv.skills.get`) and each
 * gated independently.
 *
 * A skill renders its recorded verification state, in words — verified is a
 * recorded fact with a confirmer behind it, and an unverified skill must
 * never quietly look like a verified one (no fake verification, doctrine §7).
 */
export default function Screen() {
  const { t } = useLocale();
  const profile = useCapability<ProfileGetData>("profile.get");
  const skills = useCapability<LivingCvSkillsData>("living_cv.skills.get");

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
        <Title>{t("profile.skillsTitle")}</Title>
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
              <View style={styles.list}>
                {data.skills.map((skill) => (
                  <View key={skill.skillId} style={styles.skill} accessible>
                    <Text style={styles.skillName}>
                      {skill.slug ?? skill.skillId}
                    </Text>
                    <Text
                      style={[
                        styles.skillState,
                        skill.verified && styles.skillVerified,
                      ]}
                    >
                      {skill.verified
                        ? t("profile.skillVerified")
                        : t("profile.skillUnverified")}
                    </Text>
                  </View>
                ))}
              </View>
            )
          }
        </CapabilityGate>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.color.background },
  content: { padding: theme.space.md, gap: theme.space.md },
  identity: { gap: theme.space.xs },
  list: { gap: theme.space.sm },
  skill: {
    minHeight: theme.minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  skillName: {
    color: theme.color.text,
    fontSize: theme.font.body,
    flexShrink: 1,
  },
  skillState: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
  skillVerified: {
    color: theme.color.accent,
    fontWeight: "600",
  },
});
