import type { SupabaseClient } from "@supabase/supabase-js";

import { liveJournalEntriesOnly } from "@/lib/journal/journal-list-core";
import { createClient } from "@/lib/supabase/server";
import {
  anyRecordedConfirmation,
  countCrossPartyConfirmed,
  withCrossPartyStandingConfirmation,
} from "@/lib/evidence/skill-confirmation-standing";
import { readCrossPartyStandingStates } from "@/lib/evidence/skill-confirmation-standing-read";
import { readReviewableJournalEntryIds } from "@/lib/journal/reviewable-count";

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
  /**
   * Skills whose recorded confirmation still STANDS
   * (lib/evidence/skill-confirmation-standing.ts, through the cross-party DB
   * door). `null` = UNKNOWN: the door could not say whether a recorded
   * confirmation still stands — shown as unknown, never as 0.
   */
  confirmedSkills: number | null;
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

  // Skills: declared (all) + confirmed per worker. The stored `verified` flag
  // is sticky (never set back after the confirming work is rejected,
  // corrected or deleted), so "confirmed" counts only confirmations that
  // still STAND — decided by the cross-party door, beside the journal read
  // below (no extra round trip), and only when there is a flag to judge.
  const { data: skills } = await supabase
    .from("worker_skills")
    .select("worker_id, skill_id, verified")
    .in("worker_id", ids);
  const skillRows = (skills ?? []) as {
    worker_id: string | null;
    skill_id: string | null;
    verified: boolean | null;
  }[];

  // Journal entries the employer can see for these workers (RLS-scoped).
  const [{ data: entries }, standing] = await Promise.all([
    liveJournalEntriesOnly(
      supabase.from("journal_entries").select("id, worker_id, created_at").in("worker_id", ids),
    ),
    anyRecordedConfirmation(skillRows)
      ? readCrossPartyStandingStates(supabase as unknown as SupabaseClient, ids)
      : Promise.resolve(new Map()),
  ]);
  const judged = withCrossPartyStandingConfirmation(skillRows, standing);
  const judgedByWorker = new Map<string, typeof judged>();
  for (const r of judged) {
    if (!r.worker_id || !out.has(r.worker_id)) continue;
    const list = judgedByWorker.get(r.worker_id) ?? [];
    list.push(r);
    judgedByWorker.set(r.worker_id, list);
  }
  for (const [wid, rows] of judgedByWorker) {
    const w = out.get(wid)!;
    w.declaredSkills = rows.length;
    w.confirmedSkills = countCrossPartyConfirmed(rows);
  }
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
  // The ONE `reviewable_journal_entry_ids` read, shared across every project's
  // pulse in the same render (request-scoped, see reviewable-count.ts).
  const { data: idRows } = await readReviewableJournalEntryIds();
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
