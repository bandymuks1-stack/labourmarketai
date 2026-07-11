import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Worker saved opportunities (Marketplace Precision Phase-2 PR 5).
 *
 * #723-compat: the human-gated draft migration
 * `20260711310000_worker_saved_opportunities_v1.sql` (branch
 * feat/worker-saved-opportunities-migration-v1) adds — WHEN THE OWNER APPLIES
 * IT — the private-bookmark table `worker_saved_opportunities` (SELECT
 * own-rows-only under RLS; the demand owner NEVER sees who saved) and two
 * RPC-only write paths:
 *
 *   save_worker_opportunity_v1(p_request_id uuid, p_note text) → uuid
 *   unsave_worker_opportunity_v1(p_request_id uuid)            → boolean
 *
 * NOTHING here applies SQL. Until the migration is applied every read comes
 * back `available: false` and every write comes back `feature-absent` — the
 * board then simply does NOT render the save toggle (honest invisibility,
 * never a dead button). A save stores ONLY (worker, request id, optional
 * private note): no copied titles/pay/company names — the board re-joins
 * saves against live rows, so a stale save can never show stale facts.
 */

/** Relation missing — table not applied yet (Postgres undefined_table). */
const RELATION_NOT_FOUND = "42P01";
/** Function missing — RPC not applied yet (Postgres undefined_function). */
const UNDEFINED_FUNCTION = "42883";
/** Function missing in PostgREST's schema cache (same meaning, REST layer). */
const POSTGREST_FN_NOT_FOUND = "PGRST202";

function isFeatureAbsentCode(code: string | undefined): boolean {
  return (
    code === RELATION_NOT_FOUND ||
    code === UNDEFINED_FUNCTION ||
    code === POSTGREST_FN_NOT_FOUND
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface MySavedOpportunities {
  /** The worker's own saved request ids. Empty when the store is absent. */
  readonly requestIds: ReadonlySet<string>;
  /** False until the owner applies the #723 migration — the UI must not
   *  render the save toggle then (feature-detect once per page load). */
  readonly available: boolean;
}

/** Own saved rows (RLS: the saving worker only). 42P01 → feature absent. */
export async function listMySavedOpportunities(
  supabase: SupabaseClient,
  workerId: string,
): Promise<MySavedOpportunities> {
  try {
    const { data, error } = await asAny(supabase)
      .from("worker_saved_opportunities")
      .select("request_id")
      .eq("worker_id", workerId);
    if (error) return { requestIds: new Set(), available: false };
    const requestIds = new Set<string>();
    for (const r of (data ?? []) as { request_id: string }[]) {
      requestIds.add(r.request_id);
    }
    return { requestIds, available: true };
  } catch {
    return { requestIds: new Set(), available: false };
  }
}

export type SavedWriteResult =
  | { kind: "ok"; saved: boolean }
  | { kind: "invalid" }
  | { kind: "no-user" }
  /** The demand is not an open board demand (or no worker profile) — the
   *  RPC's own visibility check (errcode P0002). */
  | { kind: "not-open" }
  /** Table/RPCs not applied yet (owner-gated #723) — the UI never offered
   *  the action; reaching this means a race, surfaced as a quiet no-op. */
  | { kind: "feature-absent" }
  | { kind: "error"; message: string };

/** Save (private bookmark). Idempotent upsert inside the gated RPC. */
export async function saveOpportunity(input: {
  requestId: string;
  note?: string | null;
}): Promise<SavedWriteResult> {
  if (!input.requestId) return { kind: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-user" };

  try {
    const { error } = await asAny(supabase).rpc("save_worker_opportunity_v1", {
      p_request_id: input.requestId,
      p_note: input.note ?? null,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (isFeatureAbsentCode(code)) return { kind: "feature-absent" };
      if (code === "P0002") return { kind: "not-open" };
      return { kind: "error", message: error.message };
    }
    return { kind: "ok", saved: true };
  } catch {
    return { kind: "feature-absent" };
  }
}

/** Remove own bookmark. Missing row is a clean no-op (saved stays false). */
export async function unsaveOpportunity(input: {
  requestId: string;
}): Promise<SavedWriteResult> {
  if (!input.requestId) return { kind: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-user" };

  try {
    const { error } = await asAny(supabase).rpc("unsave_worker_opportunity_v1", {
      p_request_id: input.requestId,
    });
    if (error) {
      const code = (error as { code?: string }).code;
      if (isFeatureAbsentCode(code)) return { kind: "feature-absent" };
      if (code === "P0002") return { kind: "not-open" };
      return { kind: "error", message: error.message };
    }
    return { kind: "ok", saved: false };
  } catch {
    return { kind: "feature-absent" };
  }
}
