import { createClient } from "@/lib/supabase/server";

/**
 * Company-facing worker readiness signals (v1) — read-only, computed from
 * existing data the employer can already see under RLS:
 *   - worker_skills      (worker_skills_select allows is_employer())
 *   - journal_entries    (journal_entries_select allows manages_organization())
 *   - reviewable_journal_entry_ids() (the gated pending set)
 *
 * These are SIGNALS, not a rating and not a performance score. No ranking, no
 * matching, no aggregate number. Each value is a raw, explainable count read
 * straight from stored rows. No schema, no storage, no AI.
 */
export type WorkerReadiness = {
  journalEntries: number;
  declaredSkills: number;
  confirmedSkills: number;
  openReviewItems: number;
  lastActivity: string | null;
};

const EMPTY: WorkerReadiness = {
  journalEntries: 0,
  declaredSkills: 0,
  confirmedSkills: 0,
  openReviewItems: 0,
  lastActivity: null,
};

export async function getWorkerReadiness(
  workerIds: string[],
): Promise<Map<string, WorkerReadiness>> {
  const out = new Map<string, WorkerReadiness>();
  const ids = [...new Set(workerIds.filter(Boolean))];
  if (ids.length === 0) return out;
  for (const id of ids) out.set(id, { ...EMPTY });

  const supabase = await createClient();

  // Skills: declared (all) + confirmed (verified) per worker.
  const { data: skills } = await supabase
    .from("worker_skills")
    .select("worker_id, verified")
    .in("worker_id", ids);
  for (const r of (skills ?? []) as { worker_id: string | null; verified: boolean | null }[]) {
    if (!r.worker_id) continue;
    const w = out.get(r.worker_id);
    if (!w) continue;
    w.declaredSkills += 1;
    if (r.verified === true) w.confirmedSkills += 1;
  }

  // Journal entries the employer can see for these workers (RLS-scoped).
  const { data: entries } = await supabase
    .from("journal_entries")
    .select("id, worker_id, created_at")
    .in("worker_id", ids);
  const entryWorker = new Map<string, string>();
  for (const r of (entries ?? []) as {
    id: string;
    worker_id: string | null;
    created_at: string;
  }[]) {
    if (!r.worker_id) continue;
    const w = out.get(r.worker_id);
    if (!w) continue;
    w.journalEntries += 1;
    if (!w.lastActivity || r.created_at > w.lastActivity) w.lastActivity = r.created_at;
    entryWorker.set(r.id, r.worker_id);
  }

  // Open review items per worker = reviewable pending entries that map to them.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: idRows } = await (supabase as any).rpc("reviewable_journal_entry_ids");
  if (Array.isArray(idRows)) {
    for (const raw of idRows) {
      const eid =
        typeof raw === "string"
          ? raw
          : (raw?.reviewable_journal_entry_ids ?? raw?.id ?? null);
      if (typeof eid !== "string") continue;
      const wid = entryWorker.get(eid);
      if (!wid) continue;
      const w = out.get(wid);
      if (w) w.openReviewItems += 1;
    }
  }

  return out;
}
