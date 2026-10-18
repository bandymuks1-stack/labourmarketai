import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Postgres / PostgREST codes for "this function is not installed here". */
const RPC_ABSENT_CODES = new Set(["42883", "PGRST202", "PGRST205"]);

/**
 * Count of journal entries the caller can review right now — the same gated set
 * the inbox lists, via the SECURITY DEFINER `reviewable_journal_entry_ids` RPC
 * (migration 0034). Read-only; never widens access.
 *
 * UNKNOWN IS NOT ZERO (SEP-7). A failed read returns `null` so a surface can
 * say "could not be read" instead of "nothing is waiting for you" - the one
 * sentence a reviewer must never be told wrongly. `0` means the RPC answered
 * (or is not installed, so no review queue exists here at all) and nothing
 * waits.
 */
export async function countReviewablePendingEntries(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await (
      supabase as unknown as {
        rpc: (
          name: string,
        ) => Promise<{ data: unknown; error: { code?: string } | null }>;
      }
    ).rpc("reviewable_journal_entry_ids");
    if (error) {
      return error.code && RPC_ABSENT_CODES.has(error.code) ? 0 : null;
    }
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}
