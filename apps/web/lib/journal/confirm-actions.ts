"use server";

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { parseApprovalConfidenceStatus } from "./manager-approval-confidence";

type DB = Awaited<ReturnType<typeof createClient>>;

/** Side effects of an APPROVED review: raise the confidence of the skills the
 *  approved entry is LINKED to (owner decision R-5, 2026-10-08).
 *
 *  The write goes through the SECURITY DEFINER
 *  `recompute_worker_skill_confidence_from_manager_approval_v1`; the previous
 *  inline UPDATE ran under the manager's RLS (`worker_skills_write` is
 *  owns_worker-or-admin) and silently matched ZERO rows. The function
 *  re-checks that the caller is the entry's employer reviewer with a live
 *  approval, derives the skills only from the entry's own skill links, and
 *  touches confidence_score / confidence_bin only - NEVER `verified`, `source`
 *  or provenance. Idempotent per distinct approved entry. Counterparty
 *  (client_accept) never calls this.
 *
 *  Called ONLY by the gated reviewJournalEntry approval path. Verification is
 *  per-skill and goes ONLY through `confirm_entry_and_verify_skills`
 *  (confirmEntrySkills). Approval alone verifies nothing (W4 honesty rule). */
export async function applyApprovalSkillEffects(
  supabase: DB,
  { entryId }: { entryId: string; confirmerId: string },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "recompute_worker_skill_confidence_from_manager_approval_v1",
    { p_entry_id: entryId },
  );
  const parsed = parseApprovalConfidenceStatus(data);
  if (error || !parsed.ok) {
    // The review itself is committed; a confidence miss is NAMED, never silent
    // (counts/codes only - no identities, no content).
    console.warn("[journal.confidence-recompute] not_landed", {
      code: error?.code ?? (parsed.ok ? null : parsed.code),
    });
  }
}
