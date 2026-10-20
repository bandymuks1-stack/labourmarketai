import type { SupabaseClient } from "@supabase/supabase-js";

import { correctedOriginalIds } from "@/lib/journal/counted-once";
import { readAllPages } from "@/lib/journal/journal-list-core";

/**
 * The confirmed ORIGINALS a worker's live corrections replace (counted once,
 * lib/journal/counted-once.ts). Editing a confirmed entry leaves the
 * original's `superseded_by` NULL and links the new row by `correction_of`,
 * so a "live" filter alone keeps both. Readers that turn journal links into
 * evidence drop links of these originals — from the worker's live corrections,
 * not from the links themselves, because a correction that dropped a skill has
 * no link to it.
 *
 * PAGED to the end (the server answers at most 1000 rows; ordered by id so no
 * row is skipped or repeated). `null` only for a failed read or the pager's
 * own ceiling — never for a merely long history, which would make callers
 * drop the worker's whole journal-derived capability set.
 */
export async function readCorrectedOriginalIds(
  supabase: SupabaseClient,
  workerId: string,
): Promise<ReadonlySet<string> | null> {
  try {
    const paged = await readAllPages<{ id: string; correction_of: string | null }>(() =>
      (supabase as unknown as { from: (t: string) => any }) // eslint-disable-line @typescript-eslint/no-explicit-any
        .from("journal_entries")
        .select("id, correction_of")
        .eq("worker_id", workerId)
        .is("deleted_at", null)
        .is("superseded_by", null)
        .not("correction_of", "is", null)
        .order("id", { ascending: true }),
    );
    if (paged.error || paged.truncated) return null;
    return correctedOriginalIds(paged.rows);
  } catch {
    return null;
  }
}
