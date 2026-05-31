import { createClient } from "@/lib/supabase/server";
import { recognizeEntryDepth } from "@/lib/structuring/recognize-entry";
import { getManagerEvidence } from "@/lib/operations/manager-evidence";

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
  workerName: string;
  entries: ReviewReportEntry[];
};

export type ReviewReport = {
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
  workers: { profiles: { full_name: string | null; email: string | null } | null } | null;
};

export async function getReviewReport(
  slugToName: (slug: string) => string,
  unitToName: (slug: string) => string,
): Promise<ReviewReport> {
  const supabase = await createClient();

  // Same gated set the inbox uses (degrades to empty before migration 0034).
  let reviewableIds: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idRows } = await (supabase as any).rpc("reviewable_journal_entry_ids");
  if (Array.isArray(idRows)) {
    reviewableIds = idRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) =>
        typeof r === "string" ? r : (r?.reviewable_journal_entry_ids ?? r?.id ?? null),
      )
      .filter((v: unknown): v is string => typeof v === "string");
  }

  const byWorker = new Map<string, ReviewReportWorker>();
  let pendingEntries = 0;

  if (reviewableIds.length > 0) {
    const { data: rows } = await supabase
      .from("journal_entries")
      .select(
        "id, original_text, created_at, worker_id, workers!inner(profiles(full_name, email))",
      )
      .in("id", reviewableIds)
      .order("created_at", { ascending: true });

    for (const raw of (rows ?? []) as EntryRow[]) {
      const prof = raw.workers?.profiles;
      const workerName =
        prof?.full_name ?? (prof?.email ? prof.email.split("@")[0] : "—");
      const depth = recognizeEntryDepth(raw.original_text ?? "");
      const entry: ReviewReportEntry = {
        id: raw.id,
        date: raw.created_at,
        works: depth.works.map((w) => slugToName(w.slug)),
        hours:
          depth.hours && depth.hours.certain
            ? { value: depth.hours.value, unit: unitToName(depth.hours.unit) }
            : null,
        certainty: depth.certainty,
        needsClarification: depth.needsClarification,
      };
      const key = raw.worker_id ?? workerName;
      const bucket = byWorker.get(key) ?? { workerName, entries: [] };
      bucket.entries.push(entry);
      byWorker.set(key, bucket);
      pendingEntries += 1;
    }
  }

  const evidence = await getManagerEvidence();

  return {
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
