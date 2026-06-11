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

export interface OwnTrustSignals {
  /** worker_skills rows with verified=true (manager-confirmed ladder). */
  readonly verifiedSkills: number;
  /** journal_entry_confirmations on the worker's own entries. */
  readonly managerConfirmations: number;
  /** Own journal entries (evidence trail length). */
  readonly journalEntries: number;
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

  const entryIds = ((entriesRes.data ?? []) as { id: string }[]).map(
    (e) => e.id,
  );
  let confirmations = 0;
  if (entryIds.length > 0) {
    const { count } = await asAny(supabase)
      .from("journal_entry_confirmations")
      .select("id", { count: "exact", head: true })
      .in("entry_id", entryIds);
    confirmations = count ?? 0;
  }

  return {
    verifiedSkills: skillsRes.count ?? 0,
    managerConfirmations: confirmations,
    journalEntries: entryIds.length,
  };
}
