import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SKILL RECOGNITION FEEDBACK → THE LEARNING LEDGER.
 *
 * The worker's answer to a recognised skill (accept / reject, optionally why)
 * has been recorded on the ENTRY since W6 (append-only `skill_rejected`
 * markers, entry skill links). What it never reached was `learning_signals`
 * — the append-only observation ledger the human-in-the-loop learning layer
 * was built on (migration 20260627132759, allowed source `skill_claim`,
 * kind `correction`). Zero writers existed anywhere in the product (found
 * 2026-09-19): the platform asked "is this right?" and kept no record it
 * could learn from.
 *
 * WHAT THIS IS NOT. A signal is an OBSERVATION. It confirms nothing, changes
 * no skill, no confidence, no standing — `proposed_outcome` is suggestion
 * metadata for a later human review. The worker's own decision on the entry
 * stays the only thing that changes the entry. The insert runs under the
 * caller's RLS (`learning_signals_insert`: owns_worker) — the worker writes
 * an observation about themselves and nobody else.
 *
 * Best-effort by design: a failed observation never fails the decision it
 * observes. The decision is the person's; the ledger is ours to keep.
 */

export type SkillFeedbackDecision = "confirmed" | "rejected";

export interface SkillFeedbackInput {
  readonly workerId: string;
  readonly entryId: string;
  readonly slug: string;
  readonly decision: SkillFeedbackDecision;
  /** The person's own words, optional, bounded. Never required: "no" is a
   *  complete answer. */
  readonly reason?: string | null;
}

export const SKILL_FEEDBACK_REASON_MAX = 300;

/** Trim + bound the reason; empty becomes null, never "". */
export function normalizeFeedbackReason(reason: string | null | undefined): string | null {
  if (typeof reason !== "string") return null;
  const clean = reason.replace(/\s+/g, " ").trim();
  if (clean === "") return null;
  return clean.length > SKILL_FEEDBACK_REASON_MAX
    ? clean.slice(0, SKILL_FEEDBACK_REASON_MAX)
    : clean;
}

/** The ledger row, built without touching the database (pure, testable). */
export function buildSkillFeedbackSignal(
  input: SkillFeedbackInput,
  skillId: string | null,
): {
  subject_worker_id: string;
  subject_skill_id: string | null;
  source: "skill_claim";
  source_object_type: "journal_entry";
  source_object_id: string;
  signal_kind: "correction" | "skill_candidate";
  proposed_outcome: {
    decision: SkillFeedbackDecision;
    slug: string;
    reason: string | null;
    surface: "journal_entry_candidate";
  };
  confidence_score: 0;
  confidence_bin: "red";
} {
  return {
    subject_worker_id: input.workerId,
    subject_skill_id: skillId,
    source: "skill_claim",
    source_object_type: "journal_entry",
    source_object_id: input.entryId,
    // A rejection CORRECTS the recogniser; an acceptance is a candidate the
    // person stood behind. Neither is evidence — the confidence stays at the
    // floor so no reader can mistake an observation for a confirmation.
    signal_kind: input.decision === "rejected" ? "correction" : "skill_candidate",
    proposed_outcome: {
      decision: input.decision,
      slug: input.slug,
      reason: normalizeFeedbackReason(input.reason),
      surface: "journal_entry_candidate",
    },
    confidence_score: 0,
    confidence_bin: "red",
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

/**
 * Append one observation. Returns whether the ledger took it; NEVER throws.
 * An absent table or a refused insert is logged and swallowed — the decision
 * this observes has already happened.
 */
export async function recordSkillFeedbackSignal(
  supabase: SupabaseClient,
  input: SkillFeedbackInput,
): Promise<boolean> {
  try {
    const { data: skill } = await asAny(supabase)
      .from("skills")
      .select("id")
      .eq("slug", input.slug)
      .maybeSingle();
    const row = buildSkillFeedbackSignal(input, (skill?.id as string | undefined) ?? null);
    const { error } = await asAny(supabase).from("learning_signals").insert(row);
    if (error) {
      console.warn("[learning] skill feedback signal not recorded", {
        code: error.code,
        message: error.message,
      });
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[learning] skill feedback signal threw", e);
    return false;
  }
}
