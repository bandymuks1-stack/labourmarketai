import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { JournalEntry } from "../capability-shapes";
import { useLocale } from "../i18n/locale-context";
import { Body, Button } from "../ui/primitives";
import { theme } from "../ui/theme";

/**
 * Work Journal entries, rendered as recorded.
 *
 * The date shown is the entry's own `work_date` metric when the server
 * recorded one (the canonical fact of WHEN the work happened), falling back to
 * the creation timestamp's date — WHEN it was written down. Both are the
 * server's facts; nothing is computed here. Confirmations are shown only when
 * they exist, as a count, because a confirmation is a recorded event and zero
 * of them is not a badge worth inventing.
 */
export function JournalEntryList({
  entries,
  onCorrect,
}: {
  entries: readonly JournalEntry[];
  /** Offered only where correcting belongs (the journal itself), never on
   *  a summary such as Today's recent work. */
  onCorrect?: (entry: JournalEntry) => void;
}) {
  const { t } = useLocale();
  if (entries.length === 0) {
    // A LOADED, genuinely empty answer — the one case where "nothing recorded
    // yet" is the truth rather than a failed read dressed up as one.
    return <Body muted>{t("journal.empty")}</Body>;
  }
  return (
    <View style={styles.list}>
      {entries.map((entry, index) => (
        <View key={entry.entryId} style={styles.entry}>
          <View accessible>
            <Text style={styles.meta}>
              {workDateOf(entry)}
              {entry.confirmations > 0 ? `   ✓ ${entry.confirmations}` : ""}
            </Text>
            <Text style={styles.text}>{entry.text}</Text>
          </View>
          {onCorrect ? (
            <Button
              variant="quiet"
              testID={`journal-entry-correct-${index}`}
              label={t("journal.correct.action")}
              onPress={() => onCorrect(entry)}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function workDateOf(entry: JournalEntry): string {
  const recorded = entry.metrics.find((m) => m.slug === "work_date");
  if (recorded?.valueText) return recorded.valueText;
  return entry.createdAt.slice(0, 10);
}

/** The entry's recorded site, when it carries one. */
export function siteNameOf(entry: JournalEntry): string | null {
  return entry.metrics.find((m) => m.slug === "site_name")?.valueText ?? null;
}

const styles = StyleSheet.create({
  list: { gap: theme.space.sm },
  entry: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
    padding: theme.space.md,
    gap: theme.space.xs,
  },
  meta: {
    color: theme.color.textMuted,
    fontSize: theme.font.small,
  },
  text: {
    color: theme.color.text,
    fontSize: theme.font.body,
    lineHeight: theme.font.body * 1.5,
  },
});
