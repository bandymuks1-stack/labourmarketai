import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emitJournalReviewDecisionNotification } from "@/lib/notifications/event-emitters";
import type { JournalReviewDecision } from "@/lib/notifications/events";

/**
 * Journal review -> durable notification, the ONE bridge every review write
 * path calls AFTER its RPC succeeded (single review, skills-verifying
 * confirm, batch approve). Recipient = the worker whose entry was reviewed;
 * the reviewer is never told about their own tap (the emitter skips it).
 *
 * The worker ids are read here under the REVIEWER's own session - service_role
 * holds no grant that would let the emitter look the entry up itself (see the
 * header of lib/notifications/event-emitters.ts). Best-effort and awaited: it
 * can neither fail nor un-do the review, and it never throws.
 */
export interface JournalReviewedItem {
  readonly entryId: string;
  readonly decision: JournalReviewDecision;
}

export async function notifyJournalReviewDecisions(
  supabase: Pick<SupabaseClient, "from">,
  actorProfileId: string,
  items: readonly JournalReviewedItem[],
): Promise<void> {
  if (items.length === 0) return;
  try {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("id, worker_id")
      .in(
        "id",
        items.map((i) => i.entryId),
      );
    if (error) {
      console.warn(
        "[journal] review notify: entries unreadable:",
        error.code ?? "unknown",
      );
      return;
    }
    const workerByEntry = new Map<string, string | null>(
      ((data ?? []) as { id: string; worker_id: string | null }[]).map((r) => [
        r.id,
        r.worker_id,
      ]),
    );
    for (const item of items) {
      await emitJournalReviewDecisionNotification({
        entryId: item.entryId,
        workerId: workerByEntry.get(item.entryId) ?? null,
        actorProfileId,
        decision: item.decision,
      });
    }
  } catch {
    console.warn("[journal] review notify: emit threw");
  }
}
