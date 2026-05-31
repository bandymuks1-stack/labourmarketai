import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Count of journal entries the caller can review right now — the same gated set
 * the inbox lists, via the SECURITY DEFINER `reviewable_journal_entry_ids` RPC
 * (migration 0034). Returns 0 if the RPC is not applied yet (42883) — honest,
 * no mock data. Read-only; never widens access.
 */
export async function countReviewablePendingEntries(): Promise<number> {
  const supabase = await createClient();
  const { data } = await (
    supabase as unknown as {
      rpc: (name: string) => Promise<{ data: unknown }>;
    }
  ).rpc("reviewable_journal_entry_ids");
  return Array.isArray(data) ? data.length : 0;
}
