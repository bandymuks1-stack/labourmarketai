import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  entrySkillKey,
  planReviewQueueInserts,
  type QueueEntryFacts,
  type QueueSignalRow,
} from "@/lib/learning/signal-queue-plan";

/**
 * EDU-5 — the ONE producer: worker signal → the manager's review queue.
 *
 * Runs in the MANAGER's own session, so every read and write is the
 * existing RLS, not a new authority: `learning_signals_select` shows a
 * manager only signals whose `organization_id` they manage,
 * `journal_entries_select` only entries of their organisation's engagement
 * contexts, and `learning_review_queue_insert` only rows for an organisation
 * they manage. A worker cannot reach another organisation's queue by writing
 * a foreign `organization_id` on a signal: the plan re-derives the
 * organisation from the entry and drops any signal that disagrees.
 *
 * Idempotent per (entry, skill): see `planReviewQueueInserts`. There is no
 * unique index behind it (that would be a migration), so two managers opening
 * the brief in the same instant could in principle both insert; the cost is
 * one duplicate pending suggestion, never a confirmation. The queue is
 * re-read right before the insert to shrink that window.
 *
 * NEVER throws and NEVER confirms. Absent tables / refused reads degrade to
 * "nothing produced".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (c: SupabaseClient): any => c;

const SIGNAL_WINDOW = 200;

export async function produceReviewQueueFromSignals(
  supabase: SupabaseClient,
): Promise<{ inserted: number }> {
  try {
    const { data: sigRows, error: sigErr } = await asAny(supabase)
      .from("learning_signals")
      .select(
        "id, subject_worker_id, subject_skill_id, organization_id, source, source_object_type, source_object_id, signal_kind, proposed_outcome",
      )
      .eq("source", "skill_claim")
      .eq("signal_kind", "skill_candidate")
      .not("organization_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(SIGNAL_WINDOW);
    if (sigErr || !Array.isArray(sigRows) || sigRows.length === 0) return { inserted: 0 };
    const signals = sigRows as QueueSignalRow[];

    const entryIds = [
      ...new Set(signals.map((s) => s.source_object_id).filter((v): v is string => !!v)),
    ];
    if (entryIds.length === 0) return { inserted: 0 };

    const readQueuedKeys = async (): Promise<Set<string>> => {
      const { data: queued } = await asAny(supabase)
        .from("learning_review_queue")
        .select("journal_entry_id, subject_skill_id")
        .in("journal_entry_id", entryIds);
      const keys = new Set<string>();
      for (const q of (queued ?? []) as Array<Record<string, unknown>>) {
        if (q.journal_entry_id && q.subject_skill_id) {
          keys.add(entrySkillKey(String(q.journal_entry_id), String(q.subject_skill_id)));
        }
      }
      return keys;
    };

    const { data: entryRows } = await asAny(supabase)
      .from("journal_entries")
      .select(
        "id, worker_id, superseded_by, deleted_at, engagement_contexts(organization_id, journal_review_enabled)",
      )
      .in("id", entryIds);

    const entries = new Map<string, QueueEntryFacts>();
    for (const e of (entryRows ?? []) as Array<Record<string, unknown>>) {
      const ec = e.engagement_contexts as {
        organization_id?: string | null;
        journal_review_enabled?: boolean | null;
      } | null;
      entries.set(String(e.id), {
        workerId: String(e.worker_id ?? ""),
        organizationId: ec?.organization_id ?? null,
        reviewEnabled: ec?.journal_review_enabled === true,
        stale: e.superseded_by != null || e.deleted_at != null,
      });
    }
    // Plan, then RE-READ the queue and plan again immediately before the
    // insert: a concurrent session that queued the same (entry, skill) in
    // between is seen and skipped. This narrows the window to a few
    // milliseconds; only a unique index closes it entirely (follow-up).
    if (planReviewQueueInserts(signals, entries, await readQueuedKeys()).length === 0) {
      return { inserted: 0 };
    }
    const rows = planReviewQueueInserts(signals, entries, await readQueuedKeys());
    if (rows.length === 0) return { inserted: 0 };
    const { error } = await asAny(supabase).from("learning_review_queue").insert(rows);
    if (error) {
      console.warn("[learning] review queue not produced", { code: error.code });
      return { inserted: 0 };
    }
    return { inserted: rows.length };
  } catch (e) {
    console.warn("[learning] review queue producer threw", e);
    return { inserted: 0 };
  }
}

/** Pending suggestions the caller may see (RLS: their organisation's). */
export async function countPendingReviewQueue(supabase: SupabaseClient): Promise<number> {
  try {
    const { count, error } = await asAny(supabase)
      .from("learning_review_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    return error ? 0 : (count ?? 0);
  } catch {
    return 0;
  }
}
