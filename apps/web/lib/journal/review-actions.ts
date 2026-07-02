"use server";

import "server-only";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { applyApprovalSkillEffects } from "./confirm-actions";
import { confirmEntryAndVerifySkills } from "@/lib/operations/org-membership";
import { REVIEW_DECISIONS, type ReviewDecision } from "./review-status";

/**
 * Manager review → evidence result (slice manager-review-evidence-result-v1).
 *
 * The single gated review write: an org manager / admin records an evidence
 * result (approve / reject / request changes) for a worker's journal entry via
 * the SECURITY DEFINER RPC `review_journal_entry` (migration 0034). The RPC is
 * the real security boundary — it re-validates manager/admin scope AND requires
 * the worker's employment relationship to have `journal_review_enabled = true`
 * (review is never recorded from a label alone). On approval this also closes
 * the verified-skill loop, identically to the legacy confirm path.
 */

/** Block outcomes the RPC can return instead of the decision. */
export type ReviewBlockCode =
  | "invalid_decision"
  | "entry_not_found"
  | "entry_not_org_scoped"
  | "not_authorized"
  | "review_not_enabled"
  | "no_reviewer_engagement";

export type ReviewActionState =
  | { ok: true; decision: ReviewDecision }
  | {
      ok: false;
      code: ReviewBlockCode | "error" | "needs_migration";
      message?: string;
    };

const RPC_NOT_FOUND_CODE = "42883";

export async function reviewJournalEntry(
  _prev: ReviewActionState | null,
  formData: FormData,
): Promise<ReviewActionState> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const decisionRaw = String(formData.get("decision") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const locale = String(formData.get("locale") ?? "lt");

  if (entryId === "") return { ok: false, code: "error", message: "entry_id required" };
  // Bounded free text: the note is stored uncapped by the 0034 RPC.
  if (note && note.length > 2000) {
    return { ok: false, code: "error", message: "note too long (max 2000 chars)" };
  }
  if (!(REVIEW_DECISIONS as readonly string[]).includes(decisionRaw)) {
    return { ok: false, code: "invalid_decision" };
  }
  const decision = decisionRaw as ReviewDecision;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "error", message: "Not authenticated" };

  // The 0034 RPC is not in the generated types until applied — cast (the same
  // graceful pattern the ops-bridge wrappers use; 42883 → needs_migration).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("review_journal_entry", {
    p_entry_id: entryId,
    p_decision: decision,
    p_note: note,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE) return { ok: false, code: "needs_migration" };
    return { ok: false, code: "error", message: error.message };
  }

  const outcome = data as string;
  if (outcome !== decision) {
    // The RPC returned a block reason instead of the decision.
    return { ok: false, code: outcome as ReviewBlockCode };
  }

  // Approval closes the verified-skill loop (parity with legacy confirmEntry).
  if (decision === "approved") {
    const { data: entry } = await supabase
      .from("journal_entries")
      .select("worker_id, profession_id")
      .eq("id", entryId)
      .maybeSingle();
    if (entry) {
      await applyApprovalSkillEffects(supabase, {
        workerId: entry.worker_id as string,
        professionId: (entry.profession_id as string | null) ?? null,
        confirmerId: user.id,
      });
    }
  }

  revalidatePath(`/${locale}/dashboard/inbox`);
  revalidatePath(`/${locale}/dashboard/journal`);
  return { ok: true, decision };
}

/**
 * Approve an entry AND verify the specific declared skills it proves — the
 * canonical verified-proof path (keystone). Goes through the SECURITY DEFINER
 * `confirm_entry_and_verify_skills` RPC (via lib/operations/org-membership.ts),
 * which is the ONLY way a manager can flip a worker's skill to verified
 * (worker_skills write RLS is owns_worker-only, so the old app-layer update was
 * silently blocked). The manager picks which of the worker's declared skills
 * this entry demonstrates; those become manager-confirmed/verified.
 */
export type ConfirmSkillsState =
  | { ok: true; verified: number }
  | { ok: false; code: string; message?: string };

export async function confirmEntrySkills(
  _prev: ConfirmSkillsState | null,
  formData: FormData,
): Promise<ConfirmSkillsState> {
  const entryId = String(formData.get("entry_id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  const locale = String(formData.get("locale") ?? "lt");
  const skillIds = formData
    .getAll("skill_id")
    .map((v) => String(v).trim())
    .filter((v) => v !== "");

  if (entryId === "") return { ok: false, code: "error", message: "entry_id required" };
  if (skillIds.length === 0) return { ok: false, code: "no_skills" };

  const res = await confirmEntryAndVerifySkills(entryId, skillIds, note, locale);
  if (res.ok) return { ok: true, verified: res.verified ?? skillIds.length };
  // Map the RPC block reasons through unchanged (review_not_enabled,
  // not_authorized, skill_not_owned, no_reviewer_engagement, error, …).
  return { ok: false, code: res.code, message: res.message };
}
