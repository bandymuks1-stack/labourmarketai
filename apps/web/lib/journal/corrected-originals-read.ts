import type { SupabaseClient } from "@supabase/supabase-js";

import { correctedOriginalIds } from "@/lib/journal/counted-once";

/**
 * The confirmed ORIGINALS a worker's live corrections replace (counted once,
 * lib/journal/counted-once.ts). Editing a confirmed entry leaves the
 * original's `superseded_by` NULL and links the new row by `correction_of`,
 * so a "live" filter alone keeps both. Readers that turn journal links into
 * evidence drop links of these originals — from the worker's live corrections,
 * not from the links themselves, because a correction that dropped a skill has
 * no link to it. `null` = unreadable (callers degrade, never guess).
 */
/** The server's own row cap; reaching it means "could not see them all". */
const CORRECTIONS_READ_CAP = 1000;

export async function readCorrectedOriginalIds(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ReadonlySet<string> | null> {
  try {
    const { data, error } = await (supabase as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      .from("journal_entries")
      .select("id, correction_of")
      .eq("worker_id", workerId)
      .is("deleted_at", null)
      .is("superseded_by", null)
      .not("correction_of", "is", null)
      .limit(CORRECTIONS_READ_CAP);
    if (error || !Array.isArray(data)) return null;
    // At the cap the set may be incomplete: unknown, never a partial set that
    // would leave some corrected originals counted.
    if (data.length >= CORRECTIONS_READ_CAP) return null;
    return correctedOriginalIds(data as { id: string; correction_of: string | null }[]);
  } catch {
    return null;
  }
}
