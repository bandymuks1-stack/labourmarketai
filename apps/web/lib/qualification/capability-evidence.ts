import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { CapabilityEvidence } from "@/lib/qualification/capability-standing";

/**
 * THE PERSON'S OWN RECORDED WORK, counted for a capability question.
 *
 * ── WHY NOT `getOwnTrustSignals` ───────────────────────────────────────────
 * That reader counts `managerConfirmations` as EVERY confirmation row on the
 * person's entries. Owner decision 3 (2026-09-07) is that a confirmation
 * written by the subject themselves is real, permanent, honest evidence and is
 * NOT independent confirmation — and production carries three such rows today,
 * all by one person holding an `owner` engagement.
 *
 * A capability claim is exactly the place that distinction has to hold: "work
 * somebody else confirmed" is the whole content of `demonstrated_capability`.
 * So this read asks the independence question directly, with the same
 * `isSelfConfirmation` predicate every other surface uses, rather than
 * re-deriving it — which is how `review_journal_entry` came to treat a
 * self-confirmation as a confirmation in the first place.
 *
 * ── THREE-VALUED THROUGHOUT ────────────────────────────────────────────────
 * A read that did not answer returns `null`, not 0. `assessCapability` then
 * reports `unknown` rather than `no_evidence`, so a database hiccup can never
 * tell someone their five years of work is not recorded (#1314, §54).
 *
 * ── BOUNDED ────────────────────────────────────────────────────────────────
 * Entry ids are capped. A person with more entries than the cap is answered
 * from the cap, which can only UNDER-state their evidence — the safe
 * direction, and never the one that would claim capability they lack.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

const ENTRY_READ_LIMIT = 1000;

/** Counts only; the credential fields are supplied by the document layer,
 *  which already knows what is recorded and in date. */
export type RecordedWorkEvidence = Pick<
  CapabilityEvidence,
  "independentlyConfirmedEntries" | "recordedEntries" | "verifiedSkills"
>;

/** The honest "we could not answer" shape — never zeros. */
export const UNKNOWN_RECORDED_WORK: RecordedWorkEvidence = {
  independentlyConfirmedEntries: null,
  recordedEntries: null,
  verifiedSkills: null,
};

export async function getOwnRecordedWorkEvidence(
  workerId: string,
  /** The caller's profile id — the subject, needed to tell a self-confirmation
   *  from an independent one. */
  subjectProfileId: string,
): Promise<RecordedWorkEvidence> {
  const supabase = await createClient();

  const [skillsRes, entriesRes] = await Promise.all([
    asAny(supabase)
      .from("worker_skills")
      .select("id", { count: "exact", head: true })
      .eq("worker_id", workerId)
      .eq("verified", true),
    asAny(supabase)
      .from("journal_entries")
      .select("id")
      .eq("worker_id", workerId)
      .limit(ENTRY_READ_LIMIT),
  ]);

  const verifiedSkills = skillsRes.error ? null : (skillsRes.count ?? 0);
  if (entriesRes.error) {
    return { independentlyConfirmedEntries: null, recordedEntries: null, verifiedSkills };
  }
  const entryIds = ((entriesRes.data ?? []) as { id: string }[]).map((e) => e.id);
  const recordedEntries = entryIds.length;
  if (entryIds.length === 0) {
    return { independentlyConfirmedEntries: 0, recordedEntries: 0, verifiedSkills };
  }

  // `confirmer_id` is what makes the independence question answerable at all.
  // A caller that could not read it gets null — not a count that quietly
  // includes the person confirming themselves.
  const confRes = await asAny(supabase)
    .from("journal_entry_confirmations")
    .select("entry_id, confirmer_id")
    .in("entry_id", entryIds)
    .limit(ENTRY_READ_LIMIT);
  if (confRes.error) {
    return { independentlyConfirmedEntries: null, recordedEntries, verifiedSkills };
  }

  const independent = new Set<string>();
  for (const row of (confRes.data ?? []) as Record<string, unknown>[]) {
    const confirmer = (row.confirmer_id as string | null) ?? null;
    // Absent confirmer id → the question cannot be answered FOR THAT ROW, and
    // the safe reading of an unanswerable independence question is "not
    // independent". Under-claiming is always the safe direction here.
    if (!confirmer || confirmer === subjectProfileId) continue;
    independent.add(row.entry_id as string);
  }

  return {
    independentlyConfirmedEntries: independent.size,
    recordedEntries,
    verifiedSkills,
  };
}
