import { createClient } from "@/lib/supabase/server";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";
import { reviewerHoursOf } from "@/lib/journal/reviewer-hours";
import type { WorkTimeMetricRow } from "@/lib/journal/work-time";
import { getManagerEvidence } from "@/lib/operations/manager-evidence";
import {
  WORKER_NAME_FIELDS,
  resolveWorkerName,
} from "@/lib/journal/worker-name";

/**
 * Company review report preview (v1) — read-only, computed from existing data.
 *
 * Aggregates the entries the caller can currently review (the same RLS-scoped
 * `reviewable_journal_entry_ids` set the inbox uses) into a per-worker preview:
 * dates, recognized works, detected hours (only when explicit + unambiguous),
 * and an honest uncertainty note. Confirmed / corrections totals come from the
 * caller's own recorded review actions (getManagerEvidence). Nothing is
 * fabricated: no fake totals, no project/client layer (that stays RED), no
 * verification claims. No schema, no storage, no AI.
 */

export type ReviewReportEntry = {
  id: string;
  date: string;
  works: string[];
  hours: { value: number; unit: string } | null;
  certainty: "clear" | "partial" | "unclear";
  needsClarification: boolean;
};

export type ReviewReportWorker = {
  /** The grouping key (the worker id; the name only when no id is readable). */
  workerKey: string;
  workerName: string;
  entries: ReviewReportEntry[];
};

export type ReviewReport = {
  /** The reviewable set or its rows did not answer — UNKNOWN, not "nothing
   *  to review" (SEP-7, the inbox's own rule). */
  loadFailed: boolean;
  workers: ReviewReportWorker[];
  totals: {
    pendingEntries: number;
    workers: number;
    confirmations: number;
    correctionsRequested: number;
  };
  lastActivity: string | null;
};

type EntryRow = {
  id: string;
  original_text: string | null;
  created_at: string;
  worker_id: string | null;
  journal_entry_metrics: WorkTimeMetricRow[] | null;
  workers: {
    display_name: string | null;
    profiles: { full_name: string | null; email: string | null } | null;
  } | null;
};

export async function getReviewReport(
  slugToName: (slug: string) => string,
  unitToName: (slug: string) => string,
): Promise<ReviewReport> {
  const supabase = await createClient();

  // Same gated set the inbox uses (degrades to empty before migration 0034).
  let reviewableIds: string[] = [];
  let loadFailed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idRows, error: idError } = await (supabase as any).rpc("reviewable_journal_entry_ids");
  if (idError) {
    loadFailed = true;
  } else if (Array.isArray(idRows)) {
    reviewableIds = idRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) =>
        typeof r === "string" ? r : (r?.reviewable_journal_entry_ids ?? r?.id ?? null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
  }

  const byWorker = new Map<string, ReviewReportWorker>();
  let pendingEntries = 0;

  if (!loadFailed && reviewableIds.length > 0) {
    // LEFT join on workers, exactly as the inbox reads the same set (walk
    // 2026-10-11): an inner join dropped every entry whose worker row the
    // reviewer may not read — a learner's, for their institution — so the
    // report counted fewer pending entries than the inbox beside it.
    const { data: rows, error: rowsError } = await supabase
      .from("journal_entries")
      .select(
        `id, original_text, created_at, worker_id, journal_entry_metrics(metric_slug, value_text, value_numeric, unit_slug, source, created_at), workers(${WORKER_NAME_FIELDS})`,
      )
      .in("id", reviewableIds)
      .order("created_at", { ascending: true });
    if (rowsError) loadFailed = true;

    for (const raw of (rows ?? []) as EntryRow[]) {
      const workerName = resolveWorkerName(raw.workers);
      const depth = recognizeEntryDepth(raw.original_text ?? "");
      const stored = reviewerHoursOf({
        id: raw.id,
        createdAt: raw.created_at,
        metrics: raw.journal_entry_metrics ?? [],
      });
      const entry: ReviewReportEntry = {
        id: raw.id,
        date: raw.created_at,
        works: depth.works.map((w) => slugToName(w.slug)),
        // The STORED work time (one canonical rule), never a text re-parse;
        // only a clear reading is reported (reviewer-hours.ts).
        hours: stored && stored.certain ? { value: stored.value, unit: unitToName(stored.unit) } : null,
        certainty: depth.certainty,
        needsClarification: depth.needsClarification,
      };
      const key = raw.worker_id ?? workerName;
      const bucket = byWorker.get(key) ?? { workerKey: key, workerName, entries: [] };
      bucket.entries.push(entry);
      byWorker.set(key, bucket);
      pendingEntries += 1;
    }
  }

  const evidence = await getManagerEvidence();

  return {
    loadFailed,
    workers: [...byWorker.values()].sort((a, b) =>
      a.workerName.localeCompare(b.workerName),
    ),
    totals: {
      pendingEntries,
      workers: byWorker.size,
      confirmations: evidence?.confirmations ?? 0,
      correctionsRequested: evidence?.correctionsRequested ?? 0,
    },
    lastActivity: evidence?.lastActivity ?? null,
  };
}
