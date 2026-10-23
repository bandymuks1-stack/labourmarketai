import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Postgres / PostgREST codes for "this function is not installed here". */
const RPC_ABSENT_CODES = new Set(["42883", "PGRST202", "PGRST205"]);

export type ReviewableIdsRead = { data: unknown; error: { code?: string } | null };

/**
 * THE gated reviewable set — the SECURITY DEFINER `reviewable_journal_entry_ids`
 * RPC (migration 0034), read ONCE per server render (perf 2026-10-22).
 *
 * One `/dashboard/company` render used to call it once for the decisions
 * strip's count, once for the opening brief's review queue and once more per
 * project inside the worker-readiness pulse — the same caller, the same
 * argument-less RPC, the same answer. Every consumer still reads the ONE RPC
 * and parses the raw `{ data, error }` exactly as before; only the round trip
 * is shared. React `cache()` is request-scoped: every navigation reads again,
 * and a server action (no render) reads itself, so a confirm is never answered
 * by the set read before it.
 */
export const readReviewableJournalEntryIds = cache(
  async function readReviewableJournalEntryIds(): Promise<ReviewableIdsRead> {
    const supabase = await createClient();
    return (
      supabase as unknown as {
        rpc: (name: string) => PromiseLike<ReviewableIdsRead>;
      }
    ).rpc("reviewable_journal_entry_ids");
  },
);

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
    const { data, error } = await readReviewableJournalEntryIds();
    if (error) {
      return error.code && RPC_ABSENT_CODES.has(error.code) ? 0 : null;
    }
    return Array.isArray(data) ? data.length : null;
  } catch {
    return null;
  }
}
