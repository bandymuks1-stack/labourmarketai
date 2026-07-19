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

/**
 * One persisted activity fragment of the entry, reconstructed from the
 * INDEX-GROUPED metric rows the save action writes (`parsed_fragment` =
 * `"N|rawPhrase"`, `fragment_activity` = `"N|label"`, `fragment_time` with
 * `value_text = "N"` + value_numeric + unit_slug, `unknown_phrase` =
 * `"N|rawPhrase|userLabel"`). The index prefix is the truthful
 * activity↔time association — a fragment's time can never drift to another
 * activity across save → DB → reload.
 */
export type EditEntryActivity = {
  /** 1-based fragment index as stored in the metric rows. */
  index: number;
  /** The worker's original phrase for this fragment (evidence). */
  rawPhrase: string | null;
  /** Activity/skill label stored for the fragment (slug or free label). */
  activityLabel: string | null;
  /** Per-activity time (`fragment_time` row for the same index). */
  time: EditEntryAmount | null;
  /** Worker-typed clarification for an unknown fragment, when present. */
  userLabel: string | null;
};

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
  /** Persisted activity fragments with their OWN times (index-grouped). */
  activities: EditEntryActivity[];
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
    activities: buildActivities(metrics),
  };
}

/** Split an `"N|rest"` metric value into its index + payload (null when the
 *  prefix is not a positive integer — malformed rows are skipped, never
 *  guessed into an association). */
function splitIndexed(valueText: string | null): {
  index: number;
  rest: string;
} | null {
  if (!valueText) return null;
  const sep = valueText.indexOf("|");
  if (sep <= 0) return null;
  const index = Number(valueText.slice(0, sep));
  if (!Number.isInteger(index) || index <= 0) return null;
  return { index, rest: valueText.slice(sep + 1) };
}

/** Reconstruct the entry's activity fragments from the index-grouped metric
 *  rows (see `EditEntryActivity`). First row per index wins — the save action
 *  writes each index once, so duplicates only exist on malformed data. */
function buildActivities(
  metrics: ReadonlyArray<EditEntryMetricRow>,
): EditEntryActivity[] {
  const byIndex = new Map<number, EditEntryActivity>();
  const get = (index: number): EditEntryActivity => {
    let a = byIndex.get(index);
    if (!a) {
      a = { index, rawPhrase: null, activityLabel: null, time: null, userLabel: null };
      byIndex.set(index, a);
    }
    return a;
  };
  for (const m of metrics) {
    switch (m.metric_slug) {
      case "parsed_fragment": {
        const p = splitIndexed(m.value_text);
        if (p && p.rest.trim()) {
          const a = get(p.index);
          if (a.rawPhrase === null) a.rawPhrase = p.rest.trim();
        }
        break;
      }
      case "fragment_activity": {
        const p = splitIndexed(m.value_text);
        if (p && p.rest.trim()) {
          const a = get(p.index);
          if (a.activityLabel === null) a.activityLabel = p.rest.trim();
        }
        break;
      }
      case "fragment_time": {
        const index = Number(m.value_text ?? "");
        if (
          Number.isInteger(index) &&
          index > 0 &&
          typeof m.value_numeric === "number" &&
          m.unit_slug
        ) {
          const a = get(index);
          if (a.time === null) {
            a.time = { value: m.value_numeric, unitSlug: m.unit_slug };
          }
        }
        break;
      }
      case "unknown_phrase": {
        // "N|rawPhrase|userLabel" — keep the worker's clarification label.
        const p = splitIndexed(m.value_text);
        if (p) {
          const sep = p.rest.indexOf("|");
          const label = sep >= 0 ? p.rest.slice(sep + 1).trim() : "";
          if (label) {
            const a = get(p.index);
            if (a.userLabel === null) a.userLabel = label;
          }
        }
        break;
      }
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}
