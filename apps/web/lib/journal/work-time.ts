/**
 * CANONICAL WORK-TIME DERIVATION — the one rule that turns Work Journal
 * evidence into work time. Pure: no IO, no persistence, no AI.
 *
 * OWNER RULING 2026-08-18 (timesheet / work-hours canonical truth):
 *   `journal_entry_metrics` is the canonical persisted source for derived,
 *   structured work-time. `journal_entry_work_items` must NOT become a second
 *   hours authority and must NOT be populated merely because readers expect
 *   rows. The chain is:
 *
 *     WORK JOURNAL ENTRY  (original user evidence / fact)
 *       -> STRUCTURED DERIVED METRICS   (journal_entry_metrics)
 *       -> CANONICAL WORK-TIME VALUE    (this module)
 *       -> TIMESHEET / WORKLOAD / CAPACITY / REPORTING
 *
 * WHY THIS MODULE EXISTS. Before it, three different computations claimed to
 * know a worker's hours and disagreed on real production rows:
 *   1. `timesheet_compute_lines_v1` read `journal_entry_work_items`, a table
 *      with zero lifetime inserts and no writer — every timesheet was empty;
 *   2. the calendar/planning strip read ONLY the entry-level `quantity`
 *      metric when it carried a time unit, ignoring the per-fragment times;
 *   3. the reviewer inbox re-parsed the raw text at display time.
 *   On production entry `3c7d80e3…` those give 0 h, 5 h and 9 h for the same
 *   day. This module is now the single rule; SQL mirrors it byte-for-byte and
 *   a guard test pins the pair together.
 *
 * THE RULE (deterministic, and structurally incapable of double counting).
 * Per live journal entry, exactly ONE work-time source is selected:
 *
 *   A. `fragment_time` rows (a per-activity duration, index-bound to the
 *      worker's own `parsed_fragment` phrase and `fragment_activity` label)
 *      win whenever the entry has at least one usable row. One line each.
 *   B. otherwise the entry-level `quantity` metric, but ONLY when its unit is
 *      a TIME unit. One line for the whole entry.
 *   C. otherwise the entry contributes no work-time line at all. It remains a
 *      journal fact; it is simply not an hours fact.
 *
 * A and B are never summed. When an entry carries both, B is recorded as a
 * `conflict` carrying the ignored value — visible and auditable, never
 * silently dropped and never migrated into an authoritative number.
 *
 * UNITS. `hours` and `minutes` total into hours (minutes/60, rounded per line
 * to 2dp — the same place and precision the SQL rounds). `days` NEVER becomes
 * hours: there is no approved workday length, so day units total separately.
 * A non-time unit (square_meters, pieces, …) is productivity output and can
 * never enter work time.
 *
 * PROVENANCE. Every line carries the metric row it came from (`metricId`),
 * that row's own `source` (`worker_input` | `ai_extracted` |
 * `manager_corrected`) and which rule produced it (`derivedFrom`), so a
 * derived hour can always be traced back to the worker's evidence.
 */

import type { EditEntryMetricRow } from "@/lib/journal/edit-entry";

/** Units that mean a number is a DURATION. Mirrors `productivity_units`
 *  rows whose `category = 'time'` (migration 0017). */
export const WORK_TIME_UNIT_SLUGS = ["hours", "minutes", "days"] as const;
export type WorkTimeUnit = (typeof WORK_TIME_UNIT_SLUGS)[number];

const TIME_UNITS = new Set<string>(WORK_TIME_UNIT_SLUGS);
const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const INDEX_RX = /^[1-9][0-9]*$/;

export function isWorkTimeUnit(slug: string | null | undefined): slug is WorkTimeUnit {
  return typeof slug === "string" && TIME_UNITS.has(slug);
}

/** A metric row as this module needs to read it. `created_at` / `id` are used
 *  only to make "latest wins" and "first wins" deterministic; they are
 *  optional so pure tests stay readable. */
export type WorkTimeMetricRow = EditEntryMetricRow & {
  readonly id?: string | null;
  readonly created_at?: string | null;
  readonly source?: string | null;
};

/** Which rule produced a line. */
export type WorkTimeOrigin = "fragment_time" | "entry_quantity";

export type WorkTimeLine = {
  readonly entryId: string;
  /** Stable identity of this derived line — `<entryId>#f<index>` for a
   *  fragment line, `<entryId>#entry` for an entry-level one. Deterministic,
   *  so re-deriving the same evidence yields the same key. */
  readonly lineKey: string;
  /** 1-based fragment index, or null for an entry-level line. */
  readonly fragmentIndex: number | null;
  /** The day the work HAPPENED (`work_date` metric, else the created UTC day). */
  readonly day: string;
  /** The recorded number in its RECORDED unit — never converted by invention. */
  readonly value: number;
  readonly unit: WorkTimeUnit;
  /** Hours this line contributes (0 for `days` — no invented workday). */
  readonly hours: number;
  /** Day units this line contributes (0 unless the unit is `days`). */
  readonly dayUnits: number;
  /** The worker's own phrase this duration was recorded against. */
  readonly evidencePhrase: string | null;
  /** Activity/skill label stored for the same fragment index. */
  readonly workTypeKey: string | null;
  /** Human label: the evidence phrase, else the activity, else the entry's
   *  first line. Never invented text. */
  readonly title: string;
  readonly derivedFrom: WorkTimeOrigin;
  /** `journal_entry_metrics.source` of the row this line came from. */
  readonly metricSource: string | null;
  /** `journal_entry_metrics.id` of the row this line came from, when known. */
  readonly metricId: string | null;
};

/** An entry-level `quantity` duration that the fragment rule superseded. */
export type WorkTimeConflict = {
  readonly reason: "entry_quantity_ignored_fragments_present";
  readonly value: number;
  readonly unit: WorkTimeUnit;
};

export type EntryWorkTime = {
  readonly entryId: string;
  readonly day: string;
  readonly lines: readonly WorkTimeLine[];
  readonly totalHours: number;
  readonly totalDayUnits: number;
  /** Non-null when the entry stated BOTH per-fragment times and an
   *  entry-level duration. The fragments won; this is what was NOT counted. */
  readonly conflict: WorkTimeConflict | null;
};

export type WorkTimeEntryInput = {
  readonly entryId: string;
  /** ISO timestamp — the fallback day when the entry carries no `work_date`. */
  readonly createdAt: string;
  readonly originalText?: string | null;
  readonly metrics: readonly WorkTimeMetricRow[];
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Hours a recorded value contributes. `days` contributes ZERO hours — the
 *  timesheet doctrine forbids inventing a workday length. */
export function workTimeHours(value: number, unit: WorkTimeUnit): number {
  if (unit === "hours") return round2(value);
  if (unit === "minutes") return round2(value / 60);
  return 0;
}

/**
 * The day the work happened: the worker's own `work_date` when it is a plain
 * ISO day, else the UTC day the row was created. A plain `YYYY-MM-DD` needs
 * no timezone conversion and never enters a locale formatter; anything else
 * is ignored rather than guessed at.
 */
export function resolveWorkDay(
  metrics: readonly WorkTimeMetricRow[],
  createdAt: string,
): string {
  const candidates = metrics
    .filter(
      (m) =>
        m.metric_slug === "work_date" &&
        typeof m.value_text === "string" &&
        DAY_RX.test(m.value_text.trim()),
    )
    .sort(cmpLatestFirst);
  const stated = candidates[0]?.value_text?.trim();
  if (stated && DAY_RX.test(stated)) return stated;
  return String(createdAt ?? "").slice(0, 10);
}

/** Newest first, ties broken by id then by nothing else — deterministic. */
function cmpLatestFirst(a: WorkTimeMetricRow, b: WorkTimeMetricRow): number {
  const at = a.created_at ?? "";
  const bt = b.created_at ?? "";
  if (at !== bt) return at < bt ? 1 : -1;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

/** Oldest first — "the first row for this fragment index wins". */
function cmpOldestFirst(a: WorkTimeMetricRow, b: WorkTimeMetricRow): number {
  return -cmpLatestFirst(a, b);
}

/** Split an `"N|rest"` metric value; null when the prefix is not a positive
 *  integer (malformed rows are skipped, never guessed into an association). */
function splitIndexed(
  valueText: string | null | undefined,
): { index: number; rest: string } | null {
  if (typeof valueText !== "string") return null;
  const sep = valueText.indexOf("|");
  if (sep <= 0) return null;
  const head = valueText.slice(0, sep);
  if (!INDEX_RX.test(head)) return null;
  return { index: Number(head), rest: valueText.slice(sep + 1) };
}

function firstLineOf(text: string | null | undefined): string {
  const first = String(text ?? "").trim().split(/\r?\n/, 1)[0] ?? "";
  return first.length > 120 ? `${first.slice(0, 119)}…` : first;
}

/**
 * Derive one entry's canonical work time. Pure and total: a malformed row is
 * skipped, never guessed at; an entry with no usable duration returns zero
 * lines rather than an invented one.
 */
export function deriveEntryWorkTime(entry: WorkTimeEntryInput): EntryWorkTime {
  const metrics = entry.metrics ?? [];
  const day = resolveWorkDay(metrics, entry.createdAt);

  // ── evidence + activity, index-grouped (first row per index wins) ──
  const evidenceByIndex = new Map<number, string>();
  const activityByIndex = new Map<number, string>();
  for (const m of [...metrics].sort(cmpOldestFirst)) {
    if (m.metric_slug !== "parsed_fragment" && m.metric_slug !== "fragment_activity") {
      continue;
    }
    const parsed = splitIndexed(m.value_text);
    if (!parsed) continue;
    const rest = parsed.rest.trim();
    if (!rest) continue;
    const target =
      m.metric_slug === "parsed_fragment" ? evidenceByIndex : activityByIndex;
    if (!target.has(parsed.index)) target.set(parsed.index, rest);
  }

  // ── A. per-fragment durations (first usable row per index wins) ──
  const fragmentByIndex = new Map<number, WorkTimeMetricRow>();
  for (const m of [...metrics].sort(cmpOldestFirst)) {
    if (m.metric_slug !== "fragment_time") continue;
    if (!isUsableDuration(m)) continue;
    const raw = typeof m.value_text === "string" ? m.value_text.trim() : "";
    if (!INDEX_RX.test(raw)) continue;
    const index = Number(raw);
    if (!fragmentByIndex.has(index)) fragmentByIndex.set(index, m);
  }

  // ── B. entry-level duration (latest usable row wins) ──
  const entryQuantity =
    [...metrics]
      .filter((m) => m.metric_slug === "quantity" && isUsableDuration(m))
      .sort(cmpLatestFirst)[0] ?? null;

  const entryTitle = firstLineOf(entry.originalText);
  const lines: WorkTimeLine[] = [];

  if (fragmentByIndex.size > 0) {
    for (const index of [...fragmentByIndex.keys()].sort((a, b) => a - b)) {
      const m = fragmentByIndex.get(index)!;
      const unit = m.unit_slug as WorkTimeUnit;
      const value = m.value_numeric as number;
      const evidence = evidenceByIndex.get(index) ?? null;
      const workTypeKey = activityByIndex.get(index) ?? null;
      lines.push({
        entryId: entry.entryId,
        lineKey: `${entry.entryId}#f${index}`,
        fragmentIndex: index,
        day,
        value,
        unit,
        hours: workTimeHours(value, unit),
        dayUnits: unit === "days" ? value : 0,
        evidencePhrase: evidence,
        workTypeKey,
        title: evidence ?? workTypeKey ?? entryTitle,
        derivedFrom: "fragment_time",
        metricSource: m.source ?? null,
        metricId: m.id ?? null,
      });
    }
  } else if (entryQuantity) {
    const unit = entryQuantity.unit_slug as WorkTimeUnit;
    const value = entryQuantity.value_numeric as number;
    lines.push({
      entryId: entry.entryId,
      lineKey: `${entry.entryId}#entry`,
      fragmentIndex: null,
      day,
      value,
      unit,
      hours: workTimeHours(value, unit),
      dayUnits: unit === "days" ? value : 0,
      evidencePhrase: null,
      workTypeKey: null,
      title: entryTitle,
      derivedFrom: "entry_quantity",
      metricSource: entryQuantity.source ?? null,
      metricId: entryQuantity.id ?? null,
    });
  }

  const conflict: WorkTimeConflict | null =
    fragmentByIndex.size > 0 && entryQuantity
      ? {
          reason: "entry_quantity_ignored_fragments_present",
          value: entryQuantity.value_numeric as number,
          unit: entryQuantity.unit_slug as WorkTimeUnit,
        }
      : null;

  return {
    entryId: entry.entryId,
    day,
    lines,
    totalHours: round2(lines.reduce((sum, l) => sum + l.hours, 0)),
    totalDayUnits: round2(lines.reduce((sum, l) => sum + l.dayUnits, 0)),
    conflict,
  };
}

/** A duration row is usable only when it carries a positive finite number in
 *  a TIME unit. Zero and negative durations are not work time. */
function isUsableDuration(m: WorkTimeMetricRow): boolean {
  return (
    typeof m.value_numeric === "number" &&
    Number.isFinite(m.value_numeric) &&
    m.value_numeric > 0 &&
    isWorkTimeUnit(m.unit_slug)
  );
}

export type WorkTimeDayHours = {
  readonly day: string;
  readonly hours: number;
};

/**
 * Hours per day across several entries, inside `[rangeStart, rangeEnd]`.
 * Several entries on the same day ADD UP — that is a real worker recording
 * two shifts, not a duplicate. `days`-unit lines are excluded (the workload
 * strip states hours only; day units live on the timesheet).
 */
export function workTimeHoursByDay(
  entries: readonly EntryWorkTime[],
  rangeStart: string,
  rangeEnd: string,
): readonly WorkTimeDayHours[] {
  if (!DAY_RX.test(rangeStart) || !DAY_RX.test(rangeEnd)) return [];
  const byDay = new Map<string, number>();
  for (const entry of entries) {
    if (!DAY_RX.test(entry.day)) continue;
    if (entry.day < rangeStart || entry.day > rangeEnd) continue;
    for (const line of entry.lines) {
      if (line.hours <= 0) continue;
      byDay.set(entry.day, (byDay.get(entry.day) ?? 0) + line.hours);
    }
  }
  return [...byDay.entries()]
    .map(([day, hours]) => ({ day, hours: round2(hours) }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The entry's duration as the calendar/planning strip labels it — the SAME
 * canonical rule the timesheet freezes, so the two surfaces cannot disagree.
 * Returns `"<value>|<unit>"` for a single recorded duration, or the summed
 * hours when the entry has several fragments. Null when the entry records no
 * duration at all.
 */
export function workTimeDurationLabel(entry: EntryWorkTime): string | null {
  if (entry.lines.length === 0) return null;
  if (entry.lines.length === 1) {
    const only = entry.lines[0]!;
    return `${only.value}|${only.unit}`;
  }
  if (entry.totalHours > 0) return `${entry.totalHours}|hours`;
  if (entry.totalDayUnits > 0) return `${entry.totalDayUnits}|days`;
  return null;
}
