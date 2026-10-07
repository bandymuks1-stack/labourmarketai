import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readCounterpartyQueue } from "./counterparty-review";
import { queueBucket } from "./counterparty-review-model";

/**
 * How many submitted entries wait for the CALLER'S decision as a client /
 * customer / contracting party (decision 0018): the queue's "to_decide"
 * bucket, counted from the SAME one-row-per-correction-chain queue the page
 * shows - never a second definition.
 *
 * It is a DIFFERENT job from employer review: attention counters show it as
 * its own, explicitly labelled number and never add it to
 * `countReviewablePendingEntries()`.
 *
 * `null` = unreadable (never rendered as 0). A caller who is no
 * counterparty gets 0.
 */
export async function countCounterpartyToDecide(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const rows = await readCounterpartyQueue(supabase);
    if (rows === null) return null;
    return rows.filter((r) => queueBucket(r) === "to_decide").length;
  } catch {
    return null;
  }
}
