import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  dominantSkill,
  formatHours,
  formatShare,
  periodFigures,
  presentProfileSkills,
  type LivingCvSkillRow,
  type ProfileSkillGroupKey,
  type WorkIntelligenceData,
  type WorkPeriodFigures,
} from "@labourmarket/client-core";

import { useLocale } from "../i18n/locale-context";
import type { MessageKey } from "../i18n/messages";
import { Body } from "../ui/primitives";
import { theme } from "../ui/theme";

/**
 * WORK FIGURES ON THE PHONE — the same numbers the website shows, read
 * through `journal.work_intelligence.get` (one product, one truth — owner
 * requirement 17, #1724). Every figure rendered here is a field of that
 * payload; the ordering rules live in `@labourmarket/client-core`
 * (`work-figures.ts`) where they are proven, and this file only lays them
 * out.
 *
 * A window the server reports as empty is said as empty (a LOADED, empty
 * answer). A read that failed never reaches this component — the screen's
 * `CapabilityGate` renders the failure instead, so nothing here can show a
 * 0 that means "could not read".
 */

/** ŠIANDIEN's figures: today and the last 7 days, and the skill with the
 *  largest share of the week's attributed hours. */
export function TodayFigures({ data }: { data: WorkIntelligenceData }) {
  const { t } = useLocale();
  const today = periodFigures(data, "today");
  const week = periodFigures(data, "week");
  // The payload was requested with `period: "week"`, so `skills` describes
  // the last 7 days — the dominant skill is the week's.
  const dominant = dominantSkill(data.skills);

  return (
    <View style={styles.block} testID="today-figures">
      <PeriodRow label={t("today.periodToday")} figures={today} testID="today-figures-today" />
      <PeriodRow label={t("today.periodWeek")} figures={week} testID="today-figures-week" />
      <View style={styles.dominant} accessible testID="today-dominant-skill">
        <Text style={styles.label}>{t("today.dominantTitle")}</Text>
        {dominant === null ? (
          <Body muted>{t("today.dominantNone")}</Body>
        ) : (
          <Text style={styles.value}>
            {dominant.slug} — {formatShare(dominant.share)} {t("today.dominantShare")}
            {" · "}
            {formatHours(dominant.attributedHours)} {t("profile.hoursShort")}
          </Text>
        )}
      </View>
      {data.coverage.truncated ? (
        <Body muted>{t("today.coverageTruncated")}</Body>
      ) : null}
      <Body muted>{t("today.figuresScope")}</Body>
    </View>
  );
}

function PeriodRow({
  label,
  figures,
  testID,
}: {
  label: string;
  figures: WorkPeriodFigures | null;
  testID: string;
}) {
  const { t } = useLocale();
  return (
    <View style={styles.period} accessible testID={testID}>
      <Text style={styles.label}>{label}</Text>
      {figures === null ? (
        // The server sent no row for this window: UNKNOWN, not 0.
        <Body muted>{t("today.periodMissing")}</Body>
      ) : figures.entries === 0 && figures.hours === 0 && figures.dayUnits === 0 ? (
        <Body muted>{t("today.periodEmpty")}</Body>
      ) : (
        <Text style={styles.value}>
          {t("today.hoursLabel")} {formatHours(figures.hours)}
          {figures.dayUnits > 0 ? ` (+${formatHours(figures.dayUnits)} ${t("today.daysUnitLabel")})` : ""}
          {" · "}
          {t("today.entriesLabel")} {figures.entries}
          {" · "}
          {t("today.daysLabel")} {figures.daysWorked}
          {figures.confirmedHours > 0
            ? ` · ${t("today.confirmedLabel")} ${formatHours(figures.confirmedHours)}`
            : ""}
        </Text>
      )}
    </View>
  );
}

const GROUP_KEY: Record<ProfileSkillGroupKey, MessageKey> = {
  manager_confirmed: "profile.groupManagerConfirmed",
  journal_backed: "profile.groupJournalBacked",
  declared: "profile.groupDeclared",
};

/**
 * The profile's skills with hours · share · entries, ordered as the web's
 * Living CV orders them (confirmed → journal-backed → declared; self-stated
 * free labels are not in this payload and the screen says so). `figures`
 * is `null` when the figures read failed: every row then says its figures
 * could not be read, never 0 h.
 */
export function SkillFigureList({
  rows,
  figures,
}: {
  rows: readonly LivingCvSkillRow[];
  figures: WorkIntelligenceData | null;
}) {
  const { t } = useLocale();
  const presentation = presentProfileSkills(rows, figures?.skills ?? null);

  return (
    <View style={styles.block} testID="profile-skill-figures">
      {!presentation.figuresReadable ? (
        <Body muted>{t("profile.figuresUnavailable")}</Body>
      ) : (
        <Body muted>{t("profile.figuresLegend")}</Body>
      )}
      {presentation.groups.map((group) => (
        <View key={group.key} style={styles.group} testID={`profile-skill-group-${group.key}`}>
          <Text style={styles.groupTitle}>{t(GROUP_KEY[group.key])}</Text>
          {group.items.map((item) => (
            <View key={item.skillId} style={styles.skill} accessible>
              <Text style={styles.skillName}>{item.slug ?? item.skillId}</Text>
              <Text style={styles.skillFigures}>
                {!presentation.figuresReadable
                  ? t("profile.figuresNotRead")
                  : item.figures === null ||
                      (item.figures.attributedHours === 0 && item.figures.entries === 0)
                    ? t("profile.noFigures")
                    : `${formatHours(item.figures.attributedHours)} ${t("profile.hoursShort")} · ${formatShare(item.figures.share)} · ${item.figures.entries} ${t("profile.entriesLabel")}`}
              </Text>
            </View>
          ))}
        </View>
      ))}
      {presentation.figuresReadable && figures !== null && figures.coverage.truncated ? (
        <Body muted>{t("today.coverageTruncated")}</Body>
      ) : null}
      {presentation.selfStatedMissing ? (
        <Body muted>{t("profile.selfStatedMissing")}</Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: theme.space.sm },
  period: {
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  dominant: {
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    gap: theme.space.xs,
    paddingHorizontal: theme.space.md,
    paddingVertical: theme.space.sm,
  },
  label: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
  value: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
  group: { gap: theme.space.sm },
  groupTitle: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
    fontWeight: "600",
  },
  skill: {
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    gap: theme.space.xs,
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
  },
  skillFigures: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
});
