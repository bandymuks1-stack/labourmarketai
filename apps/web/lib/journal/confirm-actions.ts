"use server";

import "server-only";
import { liveJournalEntriesOnly } from "@/lib/journal/journal-list-core";
import { createClient } from "@/lib/supabase/server";
import { computeConfidence } from "./confidence";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Inline confidence recompute (§6.1) for every worker_skill under the entry's
 *  profession, scoped to the worker. M1 has no entry↔skill link, so counts are
 *  taken at the (worker, profession) granularity and applied uniformly. */
async function recomputeProfessionSkills(
  supabase: DB,
  workerId: string,
  professionId: string | null,
) {
  const { data: psRows } = await supabase
    .from("profession_skills")
    .select("skill_id")
    .eq("profession_id", professionId ?? "");
  const skillIds = (psRows ?? []).map((r) => r.skill_id);
  if (skillIds.length === 0) return;

  // entries for this (worker, profession)
  let entryQuery = liveJournalEntriesOnly(
    supabase.from("journal_entries").select("id").eq("worker_id", workerId),
  );
  entryQuery = professionId
    ? entryQuery.eq("profession_id", professionId)
    : entryQuery.is("profession_id", null);
  const { data: entryRows } = await entryQuery;
  const entryIds = (entryRows ?? []).map((r) => r.id);
  const selfLoggedEntries = entryIds.length;

  let managerConfirmedEntries = 0;
  let uniqueConfirmers = 0;
  let lastConfirmationAt: Date | null = null;
  if (entryIds.length > 0) {
    const { data: confs } = await supabase
      .from("journal_entry_confirmations")
      .select("entry_id, confirmer_id, confirmation_scope, created_at")
      .in("entry_id", entryIds);
    const confirmedEntryIds = new Set<string>();
    const confirmers = new Set<string>();
    for (const c of confs ?? []) {
      const action = (c.confirmation_scope as { action?: string } | null)?.action;
      // Only an explicit approval ('confirm') counts toward confidence — a
      // 'reject' or 'request_changes' evidence row never verifies skills.
      if (action !== "confirm") continue;
      confirmedEntryIds.add(c.entry_id);
      confirmers.add(c.confirmer_id);
      const ts = new Date(c.created_at);
      if (!lastConfirmationAt || ts > lastConfirmationAt) lastConfirmationAt = ts;
    }
    managerConfirmedEntries = confirmedEntryIds.size;
    uniqueConfirmers = confirmers.size;
  }

  const { score, bin } = computeConfidence({
    managerConfirmedEntries,
    selfLoggedEntries,
    uniqueConfirmers,
    lastConfirmationAt,
  });

  // R-5 honesty (2026-09-19): this UPDATE runs under the CALLER's RLS client.
  // `worker_skills_write` is `owns_worker(worker_id) or is_admin()`, so for a
  // manager the statement filters to ZERO rows and PostgREST reports no error
  // — the recompute silently never landed for every manager approval since
  // M1. The real fix is a SECURITY DEFINER recompute (owner packet R-5,
  // blocked on the confidence-bin direction decision); until then the no-op
  // is at least NAMED: the landed row count is read back and a mismatch is
  // logged (counts only — no identities, no content).
  const { data: landed, error } = await supabase
    .from("worker_skills")
    .update({
      confidence_score: score,
      confidence_bin: bin,
      last_recompute_at: new Date().toISOString(),
    })
    .eq("worker_id", workerId)
    .in("skill_id", skillIds)
    .select("skill_id");
  const landedCount = landed?.length ?? 0;
  if (error || landedCount < skillIds.length) {
    console.warn("[journal.confidence-recompute] not_landed", {
      reason: error ? "error" : "rls_filtered",
      code: error?.code ?? null,
      targeted: skillIds.length,
      landed: landedCount,
    });
  }
}

/** Side effects of an APPROVED review: recompute confidence for the entry's
 *  profession skills. Called ONLY by the gated reviewJournalEntry approval
 *  path (the legacy ungated confirmEntry/rejectEntry actions were deleted in
 *  W5 slice 1 — they had no UI caller and bypassed journal_review_enabled).
 *
 *  W4 honesty repair: this used to ALSO blanket-flip `verified=true` on EVERY
 *  self-declared skill under the entry's profession. For a manager the RLS
 *  (owns_worker-only write) silently blocked that write, but an ADMIN session
 *  passed it — one approved entry verified the worker's whole profession with
 *  `source` still 'self_declared'. Verification is per-skill and goes ONLY
 *  through the SECURITY DEFINER `confirm_entry_and_verify_skills` RPC
 *  (confirmEntrySkills), where the reviewer names the exact skills the entry
 *  proves. Approval alone verifies nothing. */
export async function applyApprovalSkillEffects(
  supabase: DB,
  {
    workerId,
    professionId,
  }: { workerId: string; professionId: string | null; confirmerId: string },
): Promise<void> {
  await recomputeProfessionSkills(supabase, workerId, professionId);
}
