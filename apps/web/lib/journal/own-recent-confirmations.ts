import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  deriveOwnRecentConfirmations,
  OWN_RECENT_CONFIRMATIONS_LIMIT,
  windowStartIso,
  type OwnConfirmationRow,
  type OwnRecentConfirmations,
} from "@/lib/journal/own-recent-confirmations-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/**
 * The caller's OWN fresh confirmations (owner contract §14, the person's
 * side). ONE bounded read under the caller's RLS
 * (`journal_entry_confirmations_select` admits the rows on entries the
 * caller's worker owns): the newest evidence rows inside the trailing window,
 * joined to the person's entries by the entry index — never the person's
 * whole history, never another person's rows.
 *
 * Scale (owner constraint §1b): `journal_entries(worker_id, created_at)` +
 * `journal_entry_confirmations(entry_id)` are the indexed paths; the read is
 * limited and time-bounded. Null on any failure — a failed read never
 * invents a confirmation.
 */
export async function loadOwnRecentConfirmations(
  workerId: string,
  now: Date = new Date(),
): Promise<OwnRecentConfirmations | null> {
  if (!/^[0-9a-f-]{36}$/i.test(workerId)) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await asAny(supabase)
      .from("journal_entry_confirmations")
      .select("entry_id, created_at, confirmer_role, confirmation_scope, journal_entries!inner(worker_id)")
      .eq("journal_entries.worker_id", workerId)
      .gte("created_at", windowStartIso(now))
      .order("created_at", { ascending: false })
      .limit(OWN_RECENT_CONFIRMATIONS_LIMIT);
    if (error) return null;
    return deriveOwnRecentConfirmations((data ?? []) as OwnConfirmationRow[]);
  } catch {
    return null;
  }
}
