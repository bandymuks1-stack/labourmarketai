import {
  deriveIndependentReviewResult,
  type ConfirmationRow,
} from "@/lib/journal/review-status";

/**
 * CONFIRMED WORK, PER WORKER AND SKILL — the DB feeding of the pure model in
 * `evidence-tier.ts` (`deriveConfirmedWorkTier`). Handoff 2026-10-02 §5.
 *
 *   journal_entry_skills        (which skills an entry shows)
 * ⨝ live journal_entries        (not deleted, not superseded)
 * ⨝ journal_entry_confirmations (latest INDEPENDENT decision is "approved")
 *
 * Semantics, deliberately narrow:
 *   * entry-level: "a manager confirmed this WORK happened". It is NOT a skill
 *     certification (that is `worker_skills.verified`) and is never merged
 *     into it;
 *   * a decision made by the worker themself does not count
 *     (`deriveIndependentReviewResult`) — submitting ≠ being confirmed;
 *   * days = distinct WORK days (the entry's `work_date` metric, else the day
 *     it was recorded);
 *   * RLS-safe: the read runs as the CALLER. Where the caller cannot see a
 *     worker's entries (e.g. an employer who is not that worker's
 *     organization) the worker simply has NO counts — which the matcher reads
 *     as "not known", never as a penalty. No service role, no RPC widening;
 *   * bounded and batched: ONE query for the whole candidate list (no N+1),
 *     capped, and a failed read returns `null` (UNKNOWN), never zeros.
 */

export interface ConfirmedWorkCount {
  readonly confirmedWorkEntries: number;
  readonly confirmedDays: number;
}

/** worker id → skill slug → counts. Only skills with >= 1 confirmed entry. */
export type ConfirmedWorkByWorker = ReadonlyMap<string, ReadonlyMap<string, ConfirmedWorkCount>>;

/** Upper bound on confirmed entries read for one batch. A truncated batch
 *  under-counts (never over-counts); the cap is far above any real roster. */
export const CONFIRMED_WORK_ROW_CAP = 5000;

export interface ConfirmedEntryRow {
  readonly worker_id: string;
  readonly created_at: string | null;
  readonly journal_entry_confirmations: readonly ConfirmationRow[] | null;
  readonly journal_entry_skills: readonly { skills: { slug: string | null } | null }[] | null;
  readonly journal_entry_metrics?: readonly {
    metric_slug: string;
    value_text: string | null;
    created_at?: string | null;
  }[] | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The work day of an entry: its latest `work_date` metric, else the UTC day
 *  it was recorded. `null` when neither is readable. */
export function entryWorkDay(row: ConfirmedEntryRow): string | null {
  const wd = [...(row.journal_entry_metrics ?? [])]
    .filter((m) => m.metric_slug === "work_date" && m.value_text && DAY_RE.test(m.value_text))
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .pop();
  if (wd?.value_text) return wd.value_text;
  return row.created_at ? row.created_at.slice(0, 10) : null;
}

/** Pure aggregation — the rule lives here, testable without a DB. */
export function aggregateConfirmedWork(
  rows: readonly ConfirmedEntryRow[],
  profileIdByWorker: ReadonlyMap<string, string | null>,
): ConfirmedWorkByWorker {
  const entries = new Map<string, Map<string, number>>();
  const days = new Map<string, Map<string, Set<string>>>();
  for (const r of rows) {
    const result = deriveIndependentReviewResult(
      r.journal_entry_confirmations,
      profileIdByWorker.get(r.worker_id) ?? null,
    );
    if (result !== "approved") continue;
    const day = entryWorkDay(r);
    // One entry counts once per skill, however often the skill is linked.
    const slugs = new Set(
      (r.journal_entry_skills ?? [])
        .map((l) => l.skills?.slug)
        .filter((s): s is string => !!s),
    );
    for (const slug of slugs) {
      const ew = entries.get(r.worker_id) ?? new Map<string, number>();
      ew.set(slug, (ew.get(slug) ?? 0) + 1);
      entries.set(r.worker_id, ew);
      if (day) {
        const dw = days.get(r.worker_id) ?? new Map<string, Set<string>>();
        const set = dw.get(slug) ?? new Set<string>();
        set.add(day);
        dw.set(slug, set);
        days.set(r.worker_id, dw);
      }
    }
  }
  const out = new Map<string, Map<string, ConfirmedWorkCount>>();
  for (const [worker, perSkill] of entries) {
    const m = new Map<string, ConfirmedWorkCount>();
    for (const [slug, n] of perSkill) {
      m.set(slug, {
        confirmedWorkEntries: n,
        confirmedDays: days.get(worker)?.get(slug)?.size ?? 0,
      });
    }
    out.set(worker, m);
  }
  return out;
}

type Sb = {
  from: (t: string) => {
    select: (s: string) => unknown;
  };
};

/**
 * ONE batched read for every worker in `workers`. Caller's RLS applies.
 * Returns `null` when the read failed (UNKNOWN), a (possibly empty) map
 * otherwise.
 */
export async function readConfirmedWorkBySkill(
  supabase: unknown,
  workers: readonly { id: string; profileId: string | null }[],
): Promise<ConfirmedWorkByWorker | null> {
  if (workers.length === 0) return new Map();
  try {
    const res = await (
      (supabase as Sb)
        .from("journal_entries")
        .select(
          "worker_id, created_at, journal_entry_confirmations!inner(confirmation_scope, created_at, confirmer_id), journal_entry_skills!inner(skills(slug)), journal_entry_metrics(metric_slug, value_text, created_at)",
        ) as {
        in: (c: string, v: string[]) => {
          is: (c: string, v: null) => {
            is: (c: string, v: null) => {
              limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
            };
          };
        };
      }
    )
      .in(
        "worker_id",
        workers.map((w) => w.id),
      )
      .is("deleted_at", null)
      .is("superseded_by", null)
      .limit(CONFIRMED_WORK_ROW_CAP);
    if (res.error) return null;
    return aggregateConfirmedWork(
      (res.data ?? []) as ConfirmedEntryRow[],
      new Map(workers.map((w) => [w.id, w.profileId])),
    );
  } catch {
    return null;
  }
}

export interface ConfirmedWorkTotals {
  readonly entries: number;
  readonly days: number;
}

/** Pure: independently confirmed live entries (any skill) and their distinct
 *  work days, for ONE worker. */
export function aggregateConfirmedTotals(
  rows: readonly Pick<
    ConfirmedEntryRow,
    "created_at" | "journal_entry_confirmations" | "journal_entry_metrics"
  >[],
  subjectProfileId: string | null,
): ConfirmedWorkTotals {
  const days = new Set<string>();
  let entries = 0;
  for (const r of rows) {
    if (
      deriveIndependentReviewResult(r.journal_entry_confirmations, subjectProfileId) !==
      "approved"
    )
      continue;
    entries += 1;
    const day = entryWorkDay({
      worker_id: "",
      journal_entry_skills: null,
      ...r,
    });
    if (day) days.add(day);
  }
  return { entries, days: days.size };
}

/** The worker's OWN confirmed-work totals (professional history / CV). One
 *  bounded read as the caller; `null` = unreadable (never a zero). */
export async function readOwnConfirmedWorkTotals(
  supabase: unknown,
  workerId: string,
  profileId: string | null,
): Promise<ConfirmedWorkTotals | null> {
  try {
    const res = await (
      (supabase as Sb)
        .from("journal_entries")
        .select(
          "created_at, journal_entry_confirmations!inner(confirmation_scope, created_at, confirmer_id), journal_entry_metrics(metric_slug, value_text, created_at)",
        ) as {
        eq: (c: string, v: string) => {
          is: (c: string, v: null) => {
            is: (c: string, v: null) => {
              limit: (n: number) => PromiseLike<{ data: unknown; error: unknown }>;
            };
          };
        };
      }
    )
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .is("superseded_by", null)
      .limit(CONFIRMED_WORK_ROW_CAP);
    if (res.error) return null;
    return aggregateConfirmedTotals(
      (res.data ?? []) as ConfirmedEntryRow[],
      profileId,
    );
  } catch {
    return null;
  }
}
