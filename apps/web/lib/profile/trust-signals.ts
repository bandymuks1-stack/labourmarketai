import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Workstream C — honest trust signals for the person's OWN profile.
 *
 * Every number is a direct count from canonical tables under the viewer's
 * own RLS — nothing weighted, nothing invented, zero is a plain zero
 * (doctrine §7 + VISION §10: colours/numbers never lie). The visual layer
 * is the TASK 07 living-arena trust block; these semantics stay unchanged.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * NULL MEANS UNREAD, NOT NONE. Each count is null when the read behind it
 * failed, so a surface can say "we could not check" instead of telling a
 * person they have nothing. 0 keeps its ordinary meaning: checked, and there
 * is none yet.
 */
export interface OwnTrustSignals {
  /** worker_skills rows with verified=true (manager-confirmed ladder). */
  readonly verifiedSkills: number | null;
  /** journal_entry_confirmations on the worker's own entries. */
  readonly managerConfirmations: number | null;
  /** Own journal entries (evidence trail length). */
  readonly journalEntries: number | null;
}

export async function getOwnTrustSignals(
  workerId: string,
): Promise<OwnTrustSignals> {
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
      .eq("worker_id", workerId),
  ]);

  // A READ THAT FAILED IS NOT A PERSON WITH NOTHING. Every count here used to
  // fall back to 0, so a timeout told someone with twelve confirmations that
  // they had none - and the surface then offered them the how-to-get-started
  // hint. That is the worst possible moment to be wrong about a person: this
  // block, and the Verified CV built from the same numbers, are where they see
  // what their work has added up to.
  const entryIds = entriesRes.error
    ? null
    : ((entriesRes.data ?? []) as { id: string }[]).map((e) => e.id);

  let confirmations: number | null = 0;
  if (entryIds === null) {
    // Confirmations are counted BY entry id. With no entry list there is
    // nothing to count against, so the answer is unknown, not zero.
    confirmations = null;
  } else if (entryIds.length > 0) {
    const res = await asAny(supabase)
      .from("journal_entry_confirmations")
      .select("id", { count: "exact", head: true })
      .in("entry_id", entryIds);
    confirmations = res.error ? null : (res.count ?? 0);
  }

  return {
    verifiedSkills: skillsRes.error ? null : (skillsRes.count ?? 0),
    managerConfirmations: confirmations,
    journalEntries: entryIds === null ? null : entryIds.length,
  };
}
