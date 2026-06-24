/**
 * Pure builder that reconstructs a Work Journal entry's FULL editable state
 * from its persisted metrics + linked skills, so opening "Redaguoti įrašą"
 * preloads everything the worker saved — not just the free text.
 *
 * Owner-smoke follow-up (PR #490): a text-only edit must NOT drop the entry's
 * date / hours / quantity / direction / skills. `supersedeJournalEntry` rebuilds
 * metrics from the submitted form only, so the composer must re-send them — it
 * can only do that if it is preloaded with them. This module is the pure,
 * testable mapping from the stored `journal_entry_metrics` rows to that state.
 *
 * The metric slugs mirror what the save action writes (see `lib/journal/
 * actions.ts`): `quantity` (value_numeric + unit_slug — a TIME unit means it is
 * hours/minutes/days, otherwise a productivity quantity), `work_date`,
 * `work_direction`, `site_name`, `institution_name`, `topic`.
 */

export type EditEntryMetricRow = {
  metric_slug: string;
  value_text: string | null;
  value_numeric: number | null;
  unit_slug: string | null;
};

export type EditEntryAmount = { value: number; unitSlug: string };

export type JournalEditingEntry = {
  id: string;
  originalText: string;
  /** Saved work date (`YYYY-MM-DD`), or null when none was stored. */
  workDate: string | null;
  /** Stored duration when the `quantity` metric used a time unit. */
  time: EditEntryAmount | null;
  /** Stored productivity quantity when the `quantity` metric used a non-time unit. */
  quantity: EditEntryAmount | null;
  workDirectionSlug: string | null;
  siteName: string | null;
  institutionName: string | null;
  topic: string | null;
  /** Skill slugs durably linked to the entry (shown as confirmed chips). */
  skillSlugs: string[];
};

/** Units that mean the `quantity` metric is a DURATION, not a productivity count. */
export const TIME_UNIT_SLUGS = new Set(["hours", "minutes", "days"]);

export function buildEditingEntry(args: {
  id: string;
  originalText: string;
  metrics: ReadonlyArray<EditEntryMetricRow> | null | undefined;
  linkedSkillSlugs?: ReadonlyArray<string> | null;
}): JournalEditingEntry {
  const metrics = args.metrics ?? [];
  const first = (slug: string): EditEntryMetricRow | null =>
    metrics.find((m) => m.metric_slug === slug) ?? null;
  const textOf = (slug: string): string | null => {
    const v = first(slug)?.value_text;
    return v && v.trim().length > 0 ? v : null;
  };

  let time: EditEntryAmount | null = null;
  let quantity: EditEntryAmount | null = null;
  const qty = first("quantity");
  if (qty && typeof qty.value_numeric === "number" && qty.unit_slug) {
    const amount: EditEntryAmount = { value: qty.value_numeric, unitSlug: qty.unit_slug };
    if (TIME_UNIT_SLUGS.has(qty.unit_slug)) time = amount;
    else quantity = amount;
  }

  return {
    id: args.id,
    originalText: args.originalText,
    workDate: textOf("work_date"),
    time,
    quantity,
    workDirectionSlug: textOf("work_direction"),
    siteName: textOf("site_name"),
    institutionName: textOf("institution_name"),
    topic: textOf("topic"),
    skillSlugs: [...new Set((args.linkedSkillSlugs ?? []).filter(Boolean))],
  };
}
