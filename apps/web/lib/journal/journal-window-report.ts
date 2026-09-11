import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isEmployerContextFailure,
  requireEmployerCompany,
} from "@/lib/company/employer-company-context";
import { createClient } from "@/lib/supabase/server";
import {
  JOURNAL_ENTRY_CONFIRMATIONS_EMBED,
  JOURNAL_ENTRY_METRICS_EMBED,
  type JournalConfirmationRow,
  type JournalMetricRow,
} from "@/lib/journal/journal-list-core";
import { deriveReviewResult } from "@/lib/journal/review-status";
import {
  deriveWorkIntelligence,
  type WorkIntelligenceEntry,
} from "@/lib/journal/work-intelligence";
import {
  WORKER_NAME_FIELDS,
  resolveWorkerName,
} from "@/lib/journal/worker-name";

/**
 * Windowed journal report (V8 employer daily loop, GAP 4).
 *
 * The manager's "what was recorded last week?" answer — per-worker counts of
 * work-journal entries over a FIXED calendar window, with review state. The
 * pending-review RPC the inbox uses is deliberately NOT part of this path: it
 * answers "what waits on me NOW" (a queue), not "what happened in a window"
 * (history). Review state here is derived from `journal_entry_confirmations`
 * directly.
 *
 * ── SCOPE ──────────────────────────────────────────────────────────────────
 * The org resolves through `requireEmployerCompany()` — the ONE canonical
 * fail-closed resolver (W8 slice 1); no id is ever accepted from the caller.
 * Entries are the org's engagement contexts' entries; `journal_entries` RLS's
 * org-manager branch authorizes the read — nothing here widens or bypasses it.
 *
 * ── WORK TIME (issue #1689, owner §14 — the per-member roll-up) ────────────
 * With `workTime: true` the same read also embeds each entry's metric rows
 * and every member's figures are derived by THE work-intelligence model
 * (`deriveWorkIntelligence` over the one canonical work-time rule): hours
 * counted once per entry, confirmed hours from APPROVED confirmations only,
 * days worked, and the main kind of work the member's own metrics named.
 * No second timesheet universe — the person page (org view) and this table
 * read the same rows through the same model, so they can never disagree.
 * Skills are deliberately not read here: an organization's roll-up answers
 * "how much, on what, backed by what"; the per-member skill reading lives
 * on the person page. Without the option the figures are `null` — NOT
 * MEASURED, never zero (SEP-7).
 *
 * ── REVIEW STATE (fixed 2026-09-11) ───────────────────────────────────────
 * `confirmed` counts entries whose current review result is APPROVED
 * (`deriveReviewResult`, latest-wins); `returned` counts rejected / changes-
 * requested ones; `awaitingReview` counts the rest. Before this, ANY
 * confirmation row — a rejection included — counted as "confirmed", which
 * reached the reports hub tile as well.
 *
 * ── PRIVACY (minimum necessary, enforced by the query) ─────────────────────
 * This is an AGGREGATE report: counts, durations and timestamps only. The
 * entry text (`original_text`) and photos are never selected — not fetched-
 * and-hidden, never in the payload. The work-time rows it embeds are the
 * metric rows (durations, dates, activity labels), not the diary text.
 * Worker names resolve the same way the review report resolves them
 * (workers → profiles full_name / email local part). No absence table is
 * touched here at all.
 *
 * ── WINDOW SEMANTICS (W12 doctrine: dates are UTC calendar days) ───────────
 * today = one UTC calendar day; week = 7 calendar days inclusive ending
 * today; month = 30 calendar days inclusive ending today. Pure derivation in
 * `journalReportWindow` so the boundaries are unit-testable.
 *
 * Read-only. No admin client, no outbound call.
 */

export type JournalWindowKey = "today" | "week" | "month";

export const JOURNAL_WINDOW_KEYS = ["today", "week", "month"] as const;

/** Inclusive UTC calendar-day window. */
export interface JournalReportWindow {
  readonly key: JournalWindowKey;
  /** First UTC day of the window (YYYY-MM-DD, inclusive). */
  readonly startIso: string;
  /** Last UTC day of the window (YYYY-MM-DD, inclusive) — today. */
  readonly endIso: string;
}

const WINDOW_DAYS: Record<JournalWindowKey, number> = {
  today: 1,
  week: 7,
  month: 30,
};

/** ISO date `days` calendar days before `todayIso` (UTC — never local time). */
function isoDayMinus(todayIso: string, days: number): string {
  const d = new Date(`${todayIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Pure window derivation: `key` over the UTC day `todayIso` (inclusive). */
export function journalReportWindow(
  key: JournalWindowKey,
  todayIso: string,
): JournalReportWindow {
  return {
    key,
    startIso: isoDayMinus(todayIso, WINDOW_DAYS[key] - 1),
    endIso: todayIso,
  };
}

/**
 * `created_at` bounds for an inclusive day window: `gteIso` at the window's
 * first instant, `ltIso` at the first instant AFTER the window (exclusive) —
 * so a timestamp anywhere inside the last day still counts.
 */
export function windowCreatedAtBounds(window: JournalReportWindow): {
  readonly gteIso: string;
  readonly ltIso: string;
} {
  return {
    gteIso: `${window.startIso}T00:00:00.000Z`,
    ltIso: `${isoDayMinus(window.endIso, -1)}T00:00:00.000Z`,
  };
}

/** What the window's entries add up to in WORK TIME, from the one model.
 *  Every entry counted once; `days`-unit durations kept apart. */
export interface JournalWindowWorkTime {
  readonly hours: number;
  /** Hours on entries the organization APPROVED — self-reported = hours − this. */
  readonly confirmedHours: number;
  /** `days`-unit durations — never converted into hours. */
  readonly dayUnits: number;
  /** Distinct calendar days that carry at least one hour line. */
  readonly daysWorked: number;
  /** Entries in the window that record no usable duration at all. */
  readonly entriesWithoutDuration: number;
  /** The kind of work with the most hours (an activity label the member's
   *  own metrics carried — a profession slug or their own words), or null. */
  readonly mainActivity: { readonly key: string; readonly hours: number } | null;
}

export interface JournalWindowWorkerRow {
  readonly workerId: string;
  readonly name: string;
  readonly entries: number;
  /** Entries with no review decision yet. */
  readonly awaitingReview: number;
  /** Entries whose current review result is APPROVED. */
  readonly confirmed: number;
  /** Entries rejected or sent back for changes (reviewed, not confirmed). */
  readonly returned: number;
  readonly lastEntryAtIso: string;
  /** Work time over this member's window entries; `null` = not measured
   *  (the caller did not ask for work time), never "no hours". */
  readonly work: JournalWindowWorkTime | null;
}

export type JournalWindowReport =
  | {
      readonly applied: true;
      readonly window: JournalReportWindow;
      readonly workers: readonly JournalWindowWorkerRow[];
      readonly totals: {
        readonly entries: number;
        readonly awaitingReview: number;
        readonly confirmed: number;
        readonly returned: number;
        readonly workers: number;
        /** Sum over members; `null` when work time was not measured. */
        readonly work: JournalWindowWorkTime | null;
      };
    }
  | {
      readonly applied: false;
      readonly reason: "not-authed" | "no-org" | "error";
    };

/** Bounded reads — the report never streams unbounded rows. */
const CONTEXT_READ_LIMIT = 500;
const ENTRY_READ_LIMIT = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** One window entry as the report reads it — ids, timestamps, the review
 *  rows and (with `workTime`) the metric rows. Never the entry text. */
export type JournalWindowEntryRow = {
  id: string;
  worker_id: string | null;
  created_at: string;
  engagement_context_id: string | null;
  workers: {
    display_name: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  } | null;
  journal_entry_confirmations: JournalConfirmationRow[] | null;
  /** Present only when the read embedded the metric rows. */
  journal_entry_metrics?: JournalMetricRow[] | null;
};

/** One shared rule for every journal surface — see lib/journal/worker-name.ts
 *  for why the readable source is `workers.display_name` and not `profiles`. */
function workerName(row: JournalWindowEntryRow): string {
  return resolveWorkerName(row.workers);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Work time of one member's window entries — THE work-intelligence model
 * over the rows this report already holds. Pure. Skill links are not part
 * of this read, so the model is asked only what it can answer without them:
 * periods (hours, confirmed hours, days, day units) and activities. Nothing
 * skill-shaped is derived from an empty link set.
 */
export function deriveWindowWorkTime(
  rows: readonly JournalWindowEntryRow[],
  todayIso: string,
): JournalWindowWorkTime {
  const entries: WorkIntelligenceEntry[] = rows.map((r) => ({
    entryId: r.id,
    createdAt: r.created_at,
    metrics: r.journal_entry_metrics ?? [],
    engagementContextId: r.engagement_context_id ?? null,
    reviewResult: deriveReviewResult(r.journal_entry_confirmations),
    linkedSkillIds: [],
  }));
  const wi = deriveWorkIntelligence({
    entries,
    skills: [],
    todayIso,
    focus: "all",
  });
  const all = wi.periods.find((p) => p.key === "all");
  const main = wi.activities[0] ?? null;
  return {
    hours: wi.totalHours,
    confirmedHours: all?.confirmedHours ?? 0,
    dayUnits: all?.dayUnits ?? 0,
    daysWorked: all?.daysWorked ?? 0,
    entriesWithoutDuration: all?.entriesWithoutDuration ?? 0,
    mainActivity: main ? { key: main.key, hours: main.hours } : null,
  };
}

function sumWorkTime(
  parts: readonly JournalWindowWorkTime[],
): JournalWindowWorkTime {
  let hours = 0;
  let confirmedHours = 0;
  let dayUnits = 0;
  let daysWorked = 0;
  let entriesWithoutDuration = 0;
  for (const p of parts) {
    hours += p.hours;
    confirmedHours += p.confirmedHours;
    dayUnits += p.dayUnits;
    daysWorked += p.daysWorked;
    entriesWithoutDuration += p.entriesWithoutDuration;
  }
  // A sum across members has no single "main" kind of work — the total
  // never invents one. `daysWorked` here is member-days (a day two people
  // worked counts twice), which the table's basis line states.
  return {
    hours: round2(hours),
    confirmedHours: round2(confirmedHours),
    dayUnits: round2(dayUnits),
    daysWorked,
    entriesWithoutDuration,
    mainActivity: null,
  };
}

/**
 * Pure roll-up of the window's rows into per-member lines and totals — the
 * part of the report a test can pin without a database. The latest
 * `created_at` wins per member whatever order the rows arrive in.
 */
export function rollUpJournalWindow(
  rows: readonly JournalWindowEntryRow[],
  opts: { readonly workTime: boolean; readonly todayIso: string },
): {
  readonly workers: readonly JournalWindowWorkerRow[];
  readonly totals: Extract<JournalWindowReport, { applied: true }>["totals"];
} {
  type Bucket = {
    name: string;
    rows: JournalWindowEntryRow[];
    awaitingReview: number;
    confirmed: number;
    returned: number;
    lastEntryAtIso: string;
  };
  const byWorker = new Map<string, Bucket>();
  for (const row of rows) {
    const key = row.worker_id ?? "—";
    const bucket = byWorker.get(key) ?? {
      name: workerName(row),
      rows: [],
      awaitingReview: 0,
      confirmed: 0,
      returned: 0,
      lastEntryAtIso: row.created_at,
    };
    bucket.rows.push(row);
    const result = deriveReviewResult(row.journal_entry_confirmations);
    if (result === "approved") bucket.confirmed += 1;
    else if (result === "submitted") bucket.awaitingReview += 1;
    else bucket.returned += 1;
    if (row.created_at > bucket.lastEntryAtIso) bucket.lastEntryAtIso = row.created_at;
    byWorker.set(key, bucket);
  }

  const workers: JournalWindowWorkerRow[] = [...byWorker.entries()]
    .map(([workerId, b]) => ({
      workerId,
      name: b.name,
      entries: b.rows.length,
      awaitingReview: b.awaitingReview,
      confirmed: b.confirmed,
      returned: b.returned,
      lastEntryAtIso: b.lastEntryAtIso,
      work: opts.workTime ? deriveWindowWorkTime(b.rows, opts.todayIso) : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    workers,
    totals: {
      entries: rows.length,
      awaitingReview: workers.reduce((n, w) => n + w.awaitingReview, 0),
      confirmed: workers.reduce((n, w) => n + w.confirmed, 0),
      returned: workers.reduce((n, w) => n + w.returned, 0),
      workers: workers.length,
      work: opts.workTime
        ? sumWorkTime(
            workers
              .map((w) => w.work)
              .filter((w): w is JournalWindowWorkTime => w !== null),
          )
        : null,
    },
  };
}

export async function getJournalWindowReport(
  windowKey: JournalWindowKey,
  todayIso: string = new Date().toISOString().slice(0, 10),
  opts: {
    /** Also embed the metric rows and derive each member's work time. Off
     *  by default so the hub tile and the daily panel stay count-sized. */
    readonly workTime?: boolean;
  } = {},
): Promise<JournalWindowReport> {
  const employer = await requireEmployerCompany();
  if (!employer.ok) {
    if (employer.reason === "unauthenticated") {
      return { applied: false, reason: "not-authed" };
    }
    return {
      applied: false,
      reason: isEmployerContextFailure(employer.reason) ? "error" : "no-org",
    };
  }

  const window = journalReportWindow(windowKey, todayIso);
  const supabase = await createClient();

  // The org's engagement contexts — the person↔org spine the entries hang on.
  // Statuses are deliberately NOT filtered: an entry recorded under a since-
  // ended engagement is still work that happened in this organization.
  const ctxRes = await asAny(supabase)
    .from("engagement_contexts")
    .select("id")
    .eq("organization_id", employer.organizationId)
    .limit(CONTEXT_READ_LIMIT);
  if (ctxRes.error) return { applied: false, reason: "error" };
  const contextIds = ((ctxRes.data ?? []) as { id: string }[]).map((r) => r.id);
  if (contextIds.length === 0) {
    // Measured zero — the org genuinely has no engagements, not a read failure.
    return {
      applied: true,
      window,
      workers: [],
      totals: {
        entries: 0,
        awaitingReview: 0,
        confirmed: 0,
        returned: 0,
        workers: 0,
        work: opts.workTime ? sumWorkTime([]) : null,
      },
    };
  }

  // MINIMISED SELECT — ids, timestamps, the review rows and (on request) the
  // metric rows. The entry text and photos are never requested; the
  // workers→profiles embed carries the display name exactly the way the
  // review report resolves it. RLS's org-manager branch on every embedded
  // table decides what comes back — nothing here widens it.
  const { gteIso, ltIso } = windowCreatedAtBounds(window);
  const select = [
    `id, worker_id, created_at, engagement_context_id, workers(${WORKER_NAME_FIELDS})`,
    JOURNAL_ENTRY_CONFIRMATIONS_EMBED,
    ...(opts.workTime ? [JOURNAL_ENTRY_METRICS_EMBED] : []),
  ].join(", ");
  const entriesRes = await asAny(supabase)
    .from("journal_entries")
    .select(select)
    .in("engagement_context_id", contextIds)
    .gte("created_at", gteIso)
    .lt("created_at", ltIso)
    .is("superseded_by", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(ENTRY_READ_LIMIT);
  // The review rows ride the same select (the list core's projection), so a
  // failed read degrades the WHOLE report rather than silently rendering
  // every entry as unreviewed — a wrong count is worse than none.
  if (entriesRes.error) return { applied: false, reason: "error" };
  const entries = (entriesRes.data ?? []) as JournalWindowEntryRow[];

  const { workers, totals } = rollUpJournalWindow(entries, {
    workTime: opts.workTime === true,
    todayIso: window.endIso,
  });
  return { applied: true, window, workers, totals };
}
