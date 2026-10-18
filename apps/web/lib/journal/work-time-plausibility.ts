/**
 * WORK-TIME PLAUSIBILITY CHECKS — owner §13 (issue #1689): overlap and
 * implausible-duration detection over the lines the ONE canonical work-time
 * rule (`deriveEntryWorkTime`) produces. Pure: no IO, no AI, no clock.
 *
 * WARN, NEVER CORRUPT. A check changes NO figure anywhere: the hours stay
 * exactly what the worker recorded and every total keeps counting them. A
 * check is a sentence next to the figures — "26 h on one day across three
 * records" — that lets the person see a duplicate or a typo THEMSELVES and
 * fix the record (edit / supersede) or stand by it with a reason. Nothing is
 * capped, dropped, re-split or "normalised" behind their back.
 *
 * WHAT IS CHECKED (each code is a plain fact, not a judgement of the person):
 *
 *   day_over_24h            the hour lines that fall on one calendar day add
 *                           up to MORE than 24 h — arithmetic, impossible for
 *                           one person; almost always the same work recorded
 *                           twice (chat + composer, or an imported timesheet
 *                           on top of a live record) or a typo (80 h for 8 h).
 *                           The day sum includes the organization's own hour
 *                           records for that day (`work_hour_allocations`:
 *                           timesheet lines entered by an operator or
 *                           imported from a document — passed in by the
 *                           caller as `organizationHoursByDay`), so "an
 *                           imported timesheet on top of a live record" is
 *                           actually caught, not merely claimed. Only days
 *                           that carry a journal line are checked: a day the
 *                           organization recorded and the person never
 *                           journaled has no record here to fix or stand by,
 *                           and the timesheet surface carries its own
 *                           duplicate warning;
 *   long_day                the same sum is above LONG_DAY_HOURS but within a
 *                           day — possible, worth a second look; the threshold
 *                           is a prompt to check, not a rule about work;
 *   line_over_24h           one recorded duration is longer than a day — a
 *                           single record cannot honestly say "30 hours" of a
 *                           day's work (a multi-day figure belongs in `days`);
 *   entry_duration_ignored  the entry stated BOTH per-phrase times and an
 *                           entry-level duration; the canonical rule counted
 *                           the phrases and set the entry-level figure aside
 *                           (`EntryWorkTime.conflict`) — which was recorded
 *                           but, until this module, shown to nobody.
 *
 * WHAT IS NOT CHECKED (and why): "overlapping time spans across entries" —
 * the journal persists durations, not clock spans (`08:00–12:00` is parsed
 * into hours; the span itself is not a metric), so two entries can only be
 * compared by the hours they add to a day, which is the day check above.
 * When stated spans become persisted evidence this module gains a span
 * check; nothing here guesses one from the text.
 *
 * OVERRIDE WITH A REASON. The worker may ACKNOWLEDGE a check — "two shifts,
 * day and night, both real" — and that acknowledgement is an append-only
 * `work_time_override` metric row (`<code>|<day>|<reason>`, source
 * `worker_input`) on one of the entries involved. An acknowledged check is
 * still returned, with the reason: it is shown as acknowledged, never
 * hidden, so the audit trail stays visible to the person and to a reviewer.
 * Only the worker's own row counts (source `worker_input`); nothing the
 * pipeline extracts can wave a check through.
 */

import type { EntryWorkTime, WorkTimeMetricRow } from "@/lib/journal/work-time";

export const WORK_TIME_OVERRIDE_METRIC_SLUG = "work_time_override";

export const WORK_TIME_CHECK_CODES = [
  "day_over_24h",
  "long_day",
  "line_over_24h",
  "entry_duration_ignored",
] as const;
export type WorkTimeCheckCode = (typeof WORK_TIME_CHECK_CODES)[number];

/** Arithmetic: a calendar day has 24 hours. */
export const HOURS_IN_A_DAY = 24;
/** A prompt to look again, not a rule: above this many recorded hours on
 *  one day the section asks the person to check for a duplicate record. */
export const LONG_DAY_HOURS = 16;

/** Minimum / maximum length of an acknowledgement reason (characters). */
export const OVERRIDE_REASON_MIN = 3;
export const OVERRIDE_REASON_MAX = 300;

const DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const CODES = new Set<string>(WORK_TIME_CHECK_CODES);
const round2 = (n: number): number => Math.round(n * 100) / 100;

export function isWorkTimeCheckCode(v: unknown): v is WorkTimeCheckCode {
  return typeof v === "string" && CODES.has(v);
}

export type WorkTimeOverride = {
  readonly code: WorkTimeCheckCode;
  readonly day: string;
  readonly reason: string;
};

/** `<code>|<day>|<reason>` — the persisted shape of an acknowledgement. */
export function formatWorkTimeOverride(o: WorkTimeOverride): string {
  return `${o.code}|${o.day}|${o.reason}`;
}

/** Parse a persisted override value; null for anything malformed (a row
 *  that cannot be read acknowledges nothing — fail closed). */
export function parseWorkTimeOverride(
  valueText: string | null | undefined,
): WorkTimeOverride | null {
  if (typeof valueText !== "string") return null;
  const first = valueText.indexOf("|");
  if (first <= 0) return null;
  const second = valueText.indexOf("|", first + 1);
  if (second <= first + 1) return null;
  const code = valueText.slice(0, first);
  const day = valueText.slice(first + 1, second);
  const reason = valueText.slice(second + 1).trim();
  if (!isWorkTimeCheckCode(code) || !DAY_RX.test(day) || !reason) return null;
  return { code, day, reason };
}

/** A reason as the worker typed it, trimmed and bounded; null when unusable. */
export function normalizeOverrideReason(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const reason = raw.replace(/\s+/g, " ").trim();
  if (reason.length < OVERRIDE_REASON_MIN || reason.length > OVERRIDE_REASON_MAX) {
    return null;
  }
  return reason;
}

export type WorkTimeCheck = {
  readonly code: WorkTimeCheckCode;
  /** Stable identity: `<code>|<day>` for a day check, `<code>|<entryId>`
   *  for an entry check — the same evidence yields the same key. */
  readonly key: string;
  /** The calendar day the check is about. */
  readonly day: string;
  /** The figure the check is about: the day's summed hours, the line's
   *  hours, or the set-aside entry-level duration's hours. */
  readonly hours: number;
  /** For a day check: how many of `hours` come from the organization's own
   *  hour records (timesheet lines / imports) rather than from the journal
   *  — named so the person can see WHICH ledger doubled the day. 0 for an
   *  entry check and when no organization record fell on that day. */
  readonly organizationHours: number;
  /** The entries involved — every entry with an hour line on that day for a
   *  day check; the one entry for an entry check. Sorted, deduplicated. */
  readonly entryIds: readonly string[];
  /** The worker's own phrase / title of the line, for line checks. */
  readonly title: string | null;
  /** For `entry_duration_ignored`: the figure the rule set aside, in its
   *  recorded unit. */
  readonly ignored: { readonly value: number; readonly unit: string } | null;
  /** The worker's acknowledgement, when one of the involved entries carries
   *  a matching `work_time_override` row. Shown, never used to hide. */
  readonly acknowledged: { readonly reason: string; readonly entryId: string } | null;
};

export type PlausibilityEntryInput = {
  readonly time: EntryWorkTime;
  readonly metrics: readonly WorkTimeMetricRow[];
};

const CODE_ORDER: Record<WorkTimeCheckCode, number> = {
  day_over_24h: 0,
  line_over_24h: 1,
  long_day: 2,
  entry_duration_ignored: 3,
};

/** Overrides per entry — only the worker's own rows count. */
function overridesOf(metrics: readonly WorkTimeMetricRow[]): WorkTimeOverride[] {
  const out: WorkTimeOverride[] = [];
  for (const m of metrics) {
    if (m.metric_slug !== WORK_TIME_OVERRIDE_METRIC_SLUG) continue;
    if (m.source !== "worker_input") continue;
    const parsed = parseWorkTimeOverride(m.value_text);
    if (parsed) out.push(parsed);
  }
  return out;
}

/**
 * Derive every check the recorded lines support. Deterministic and total:
 * the same entries in any order yield the same checks in the same order
 * (open before acknowledged, then newest day first, then by severity).
 */
export type PlausibilityOptions = {
  /** Hours the organization recorded per calendar day (`YYYY-MM-DD` →
   *  hours) — live `work_hour_allocations` rows for the same person. Added
   *  to the day sum of days that carry a journal line; never a line, never
   *  an entry, never attributed to anything. */
  readonly organizationHoursByDay?: ReadonlyMap<string, number>;
};

export function deriveWorkTimeChecks(
  entries: readonly PlausibilityEntryInput[],
  options: PlausibilityOptions = {},
): readonly WorkTimeCheck[] {
  const overridesByEntry = new Map<string, WorkTimeOverride[]>();
  for (const e of entries) overridesByEntry.set(e.time.entryId, overridesOf(e.metrics));

  const ack = (
    code: WorkTimeCheckCode,
    day: string,
    entryIds: readonly string[],
  ): WorkTimeCheck["acknowledged"] => {
    for (const id of entryIds) {
      const hit = (overridesByEntry.get(id) ?? []).find(
        (o) => o.code === code && o.day === day,
      );
      if (hit) return { reason: hit.reason, entryId: id };
    }
    return null;
  };

  const checks: WorkTimeCheck[] = [];

  // ── per day: the hour lines that fall on one calendar day ─────────────
  const byDay = new Map<string, { hours: number; entryIds: Set<string> }>();
  for (const e of entries) {
    const day = e.time.day;
    if (!DAY_RX.test(day)) continue;
    let hours = 0;
    for (const line of e.time.lines) if (line.hours > 0) hours += line.hours;
    if (hours <= 0) continue;
    let acc = byDay.get(day);
    if (!acc) {
      acc = { hours: 0, entryIds: new Set() };
      byDay.set(day, acc);
    }
    acc.hours += hours;
    acc.entryIds.add(e.time.entryId);
  }
  for (const [day, acc] of byDay) {
    // The organization's own records for the SAME day sit on top of the
    // journal's lines — the "imported timesheet over a live record" case.
    const orgRaw = options.organizationHoursByDay?.get(day) ?? 0;
    const organizationHours = Number.isFinite(orgRaw) && orgRaw > 0 ? round2(orgRaw) : 0;
    const hours = round2(acc.hours + organizationHours);
    const code: WorkTimeCheckCode | null =
      hours > HOURS_IN_A_DAY ? "day_over_24h" : hours > LONG_DAY_HOURS ? "long_day" : null;
    if (!code) continue;
    const entryIds = [...acc.entryIds].sort();
    checks.push({
      code,
      key: `${code}|${day}`,
      day,
      hours,
      organizationHours,
      entryIds,
      title: null,
      ignored: null,
      acknowledged: ack(code, day, entryIds),
    });
  }

  // ── per entry: a single line longer than a day; a set-aside duration ──
  for (const e of entries) {
    const { entryId, day } = e.time;
    if (!DAY_RX.test(day)) continue;
    const tooLong = e.time.lines.find((l) => l.hours > HOURS_IN_A_DAY);
    if (tooLong) {
      checks.push({
        code: "line_over_24h",
        key: `line_over_24h|${entryId}`,
        day,
        hours: round2(tooLong.hours),
        organizationHours: 0,
        entryIds: [entryId],
        title: tooLong.title || null,
        ignored: null,
        acknowledged: ack("line_over_24h", day, [entryId]),
      });
    }
    if (e.time.conflict) {
      const { value, unit } = e.time.conflict;
      checks.push({
        code: "entry_duration_ignored",
        key: `entry_duration_ignored|${entryId}`,
        day,
        hours: round2(e.time.totalHours),
        organizationHours: 0,
        entryIds: [entryId],
        title: null,
        ignored: { value, unit },
        acknowledged: ack("entry_duration_ignored", day, [entryId]),
      });
    }
  }

  return checks.sort(
    (a, b) =>
      Number(a.acknowledged !== null) - Number(b.acknowledged !== null) ||
      b.day.localeCompare(a.day) ||
      CODE_ORDER[a.code] - CODE_ORDER[b.code] ||
      a.key.localeCompare(b.key),
  );
}

/** What an INTAKE surface (chat flow, composer) shows right after a save:
 *  the open day-level check the saved entry takes part in, reduced to the
 *  four facts the sentence needs. */
export type WorkDayCheck = {
  readonly code: Extract<WorkTimeCheckCode, "day_over_24h" | "long_day">;
  readonly day: string;
  readonly hours: number;
  /** Records that carry hours on that day, the saved one included. */
  readonly entries: number;
};

/** The day-level check an intake surface shows right after a save: the
 *  most severe OPEN day check the saved entry takes part in, or null. Entry
 *  checks and acknowledged checks are the section's business. */
export function openDayCheckFor(
  checks: readonly WorkTimeCheck[],
  entryId: string,
): WorkTimeCheck | null {
  return (
    checks.find(
      (c) =>
        (c.code === "day_over_24h" || c.code === "long_day") &&
        c.acknowledged === null &&
        c.entryIds.includes(entryId),
    ) ?? null
  );
}
