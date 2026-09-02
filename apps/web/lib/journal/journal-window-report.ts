import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isEmployerContextFailure,
  requireEmployerCompany,
} from "@/lib/company/employer-company-context";
import { createClient } from "@/lib/supabase/server";
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
 * ── PRIVACY (minimum necessary, enforced by the query) ─────────────────────
 * This is an AGGREGATE report: counts and timestamps only. The entry text
 * (`original_text`) and photos are never selected — not fetched-and-hidden,
 * never in the payload. Worker names resolve the same way the review report
 * resolves them (workers → profiles full_name / email local part). No absence
 * table is touched here at all.
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

export interface JournalWindowWorkerRow {
  readonly workerId: string;
  readonly name: string;
  readonly entries: number;
  readonly awaitingReview: number;
  readonly confirmed: number;
  readonly lastEntryAtIso: string;
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
        readonly workers: number;
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

type EntryRow = {
  id: string;
  worker_id: string | null;
  created_at: string;
  engagement_context_id: string | null;
  workers: {
    display_name: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  } | null;
};

/** One shared rule for every journal surface — see lib/journal/worker-name.ts
 *  for why the readable source is `workers.display_name` and not `profiles`. */
function workerName(row: EntryRow): string {
  return resolveWorkerName(row.workers);
}

export async function getJournalWindowReport(
  windowKey: JournalWindowKey,
  todayIso: string = new Date().toISOString().slice(0, 10),
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
      totals: { entries: 0, awaitingReview: 0, confirmed: 0, workers: 0 },
    };
  }

  // MINIMISED SELECT — counts and timestamps only. The entry text and photos
  // are never requested; the workers→profiles embed carries the display name
  // exactly the way the review report resolves it.
  const { gteIso, ltIso } = windowCreatedAtBounds(window);
  const entriesRes = await asAny(supabase)
    .from("journal_entries")
    .select(
      `id, worker_id, created_at, engagement_context_id, workers(${WORKER_NAME_FIELDS})`,
    )
    .in("engagement_context_id", contextIds)
    .gte("created_at", gteIso)
    .lt("created_at", ltIso)
    .is("superseded_by", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(ENTRY_READ_LIMIT);
  if (entriesRes.error) return { applied: false, reason: "error" };
  const entries = (entriesRes.data ?? []) as EntryRow[];

  // Review state: which of the window's entries carry a confirmation. A
  // failed confirmation read degrades the WHOLE report rather than silently
  // rendering every entry as unreviewed — a wrong count is worse than none.
  const confirmedIds = new Set<string>();
  if (entries.length > 0) {
    const confRes = await asAny(supabase)
      .from("journal_entry_confirmations")
      .select("entry_id")
      .in(
        "entry_id",
        entries.map((e) => e.id),
      );
    if (confRes.error) return { applied: false, reason: "error" };
    for (const c of (confRes.data ?? []) as { entry_id: string | null }[]) {
      if (c.entry_id) confirmedIds.add(c.entry_id);
    }
  }

  type Bucket = {
    name: string;
    entries: number;
    awaitingReview: number;
    confirmed: number;
    lastEntryAtIso: string;
  };
  const byWorker = new Map<string, Bucket>();
  for (const row of entries) {
    const key = row.worker_id ?? "—";
    const bucket = byWorker.get(key) ?? {
      name: workerName(row),
      entries: 0,
      awaitingReview: 0,
      confirmed: 0,
      lastEntryAtIso: row.created_at,
    };
    bucket.entries += 1;
    if (confirmedIds.has(row.id)) bucket.confirmed += 1;
    else bucket.awaitingReview += 1;
    // Entries arrive ordered ascending, so the latest wins.
    bucket.lastEntryAtIso = row.created_at;
    byWorker.set(key, bucket);
  }

  const workers: JournalWindowWorkerRow[] = [...byWorker.entries()]
    .map(([workerId, b]) => ({ workerId, ...b }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    applied: true,
    window,
    workers,
    totals: {
      entries: entries.length,
      awaitingReview: workers.reduce((n, w) => n + w.awaitingReview, 0),
      confirmed: workers.reduce((n, w) => n + w.confirmed, 0),
      workers: workers.length,
    },
  };
}
