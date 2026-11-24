import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { applyApprovalSkillEffects } from "./confirm-actions";
import { notifyJournalReviewDecisions } from "./review-notification";

/**
 * Batch review with the EXCEPTIONS PYRAMID (DESIGN_SOUL §3) — read side.
 *
 * `batch_review_exceptions` (migration 20260611120000, APPLIED to prod) is the
 * server source of truth for which candidate entries deserve individual eyes
 * BEFORE the click: 'worker_first_entries' / 'unusual_hours' / 'new_skill'.
 * The UI surfaces these and collects explicit per-entry acknowledgements;
 * the write side re-checks them server-side, so no excepted entry can ever
 * be swept through silently. RPC absent (42883) → empty map, and the write
 * path falls back to refusing nothing extra (the batch RPC then also being
 * absent makes the whole flow degrade to the per-card chain).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export const BATCH_EXCEPTION_SLUGS = [
  "worker_first_entries",
  "unusual_hours",
  "new_skill",
] as const;

export type BatchExceptionSlug = (typeof BATCH_EXCEPTION_SLUGS)[number];

/** entry_id → exception slugs (real rows only; [] map on any error). */
export async function fetchBatchExceptions(
  entryIds: string[],
): Promise<Map<string, BatchExceptionSlug[]>> {
  const map = new Map<string, BatchExceptionSlug[]>();
  if (entryIds.length === 0) return map;
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc(
      "batch_review_exceptions",
      { p_entry_ids: entryIds },
    );
    if (error || !Array.isArray(data)) return map;
    for (const row of data as { entry_id: string; exception_slug: string }[]) {
      if (
        (BATCH_EXCEPTION_SLUGS as readonly string[]).includes(
          row.exception_slug,
        )
      ) {
        const list = map.get(row.entry_id) ?? [];
        list.push(row.exception_slug as BatchExceptionSlug);
        map.set(row.entry_id, list);
      }
    }
    return map;
  } catch {
    return map;
  }
}

/** Per-entry outcome of the batch write (0034/batch RPC outcome strings). */
export interface BatchEntryOutcome {
  readonly entryId: string;
  readonly outcome: string;
}

/**
 * Entry-only approvals through the real batch RPC (per-entry audit + ONE
 * batch-testimony audit row + server-side exception refusal). Returns the
 * per-entry outcomes verbatim; [] + ok=false when the RPC is missing.
 */
export async function reviewEntriesBatch(
  entryIds: string[],
  acknowledgedExceptionIds: string[],
): Promise<{ ok: boolean; outcomes: BatchEntryOutcome[] }> {
  if (entryIds.length === 0) return { ok: true, outcomes: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await asAny(supabase).rpc(
      "review_journal_entries_batch",
      {
        p_entry_ids: entryIds,
        p_decision: "approved",
        p_note: null,
        p_acknowledged_exception_ids: acknowledgedExceptionIds,
      },
    );
    if (error || !Array.isArray(data)) return { ok: false, outcomes: [] };
    const outcomes = (data as { entry_id: string; outcome: string }[]).map((r) => ({
      entryId: r.entry_id,
      outcome: r.outcome,
    }));
    // DURABLE NOTIFICATION (journal_review_decided): each entry the RPC
    // actually approved tells its worker. Awaited, never throws.
    const approved = outcomes.filter((o) => o.outcome === "approved");
    if (approved.length > 0) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await notifyJournalReviewDecisions(
          supabase,
          user.id,
          approved.map((o) => ({ entryId: o.entryId, decision: "approved" as const })),
        );
        // R-5: each batch-approved entry raises its linked skills' confidence
        // through the same bounded, idempotent SECURITY DEFINER door the single
        // approval uses. Confidence only - nothing is verified.
        for (const o of approved) {
          await applyApprovalSkillEffects(supabase, { entryId: o.entryId, confirmerId: user.id });
        }
      }
    }
    return { ok: true, outcomes };
  } catch {
    return { ok: false, outcomes: [] };
  }
}
