import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { SeenState } from "./recommendations-model";
import type { SeenWriteResult } from "@/lib/marketplace/worker-opportunities-shown-core";

/**
 * Worker opportunity SEEN markers — the REPOSITORY/ADAPTER for the canonical
 * marketplace use case (`lib/marketplace/worker-opportunities.ts`).
 *
 * This is the ONE place in the codebase that knows the store's name, the RPC's
 * name, and what a Postgres / PostgREST "that object does not exist" code
 * looks like. Nothing in `app/**` or `components/**` may import it — the
 * boundary is guarded by
 * `apps/web/lib/guards/canonical-marketplace-use-case.test.ts`.
 *
 * Backed by the human-gated draft migration
 * `20260714170000_worker_opportunity_seen_v1.sql` which — WHEN THE OWNER
 * APPLIES IT — adds the first-seen marker table `worker_opportunity_seen`
 * (SELECT own-rows-only under RLS; the demand owner NEVER learns who saw)
 * and ONE RPC-only write path:
 *
 *   mark_worker_opportunities_seen_v1(p_request_ids uuid[]) → integer
 *
 * NOTHING here applies SQL. Until the migration is applied every read comes
 * back `available: false` and every write reports `feature_unavailable` — the
 * "new job matches" spine count then stays 0 (honest degradation: a badge that
 * could never clear is noise) and the "Nauja" chip falls back to the 7-day
 * created_at window. A marker stores ONLY (profile, request id, seen_at): no
 * demand facts are ever copied.
 *
 * HONESTY RULE (Stage B): an absent store and a broken store are NOT the same
 * event. Only the four "object does not exist" codes classify as
 * `feature_unavailable`; every other driver error is returned as
 * `unexpected_error` so the application layer can report it. Previously both
 * collapsed into a quiet no-op, which meant a genuine outage looked exactly
 * like an unapplied migration.
 */

/** Relation missing — table not applied yet (Postgres undefined_table). */
const RELATION_NOT_FOUND = "42P01";
/** Function missing — RPC not applied yet (Postgres undefined_function). */
const UNDEFINED_FUNCTION = "42883";
/** Function missing in PostgREST's schema cache (same meaning, REST layer). */
const POSTGREST_FN_NOT_FOUND = "PGRST202";
/** Table missing in PostgREST's schema cache (same meaning, REST layer). */
const POSTGREST_REL_NOT_FOUND = "PGRST205";

/** The complete set of codes that mean "the owner-gated object is not applied
 *  yet". Anything outside this set is an unexpected failure. */
export const FEATURE_ABSENT_CODES: readonly string[] = [
  RELATION_NOT_FOUND,
  UNDEFINED_FUNCTION,
  POSTGREST_FN_NOT_FOUND,
  POSTGREST_REL_NOT_FOUND,
];

export function isFeatureAbsentCode(code: string | undefined): boolean {
  return code !== undefined && FEATURE_ABSENT_CODES.includes(code);
}

/*
 * Two other codes the RPC can raise, and why they are deliberately NOT
 * feature-absent:
 *
 *   42501 — the function body's "Not authenticated" guard, and also Postgres'
 *           generic insufficient_privilege (a missing EXECUTE grant). The write
 *           path checks the session BEFORE calling, so a signed-out caller
 *           never reaches the RPC; if 42501 still comes back, something is
 *           genuinely misconfigured and deserves the unexpected-error log.
 *   22023 — "Too many ids". Unreachable: the application layer normalizes to
 *           at most MAX_SHOWN_IDS_PER_CALL and this module caps again. If it
 *           ever fires, a bound drifted and that is worth surfacing loudly.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Defensive cap mirroring the RPC's own hard bound. The application layer
 *  normalizes first; this is belt-and-braces at the boundary. */
export const MARK_SEEN_MAX_IDS = 100;

/** Process-lifetime memo (P0 perf): once the seen store is proven absent
 *  (draft migration not applied), stop re-asking on EVERY navigation — the
 *  404 was burning a round-trip per authed page load. Only the PROVEN-absent
 *  classification sets it; an unexpected error must never latch the feature
 *  off. Cleared naturally on deploy/instance restart, i.e. after the owner
 *  applies the migration. */
let seenStoreAbsent = false;

export type SeenReadResult =
  | { readonly kind: "ok"; readonly seenIds: ReadonlySet<string> }
  | { readonly kind: "feature_unavailable" }
  | { readonly kind: "unexpected_error"; readonly message: string };

/** Own seen markers (RLS: the owning profile only), classified. */
export async function readMyOpportunitySeen(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SeenReadResult> {
  if (seenStoreAbsent) return { kind: "feature_unavailable" };
  try {
    const { data, error } = await asAny(supabase)
      .from("worker_opportunity_seen")
      .select("customer_request_id")
      .eq("profile_id", profileId);
    if (error) {
      const code = (error as { code?: string }).code;
      if (isFeatureAbsentCode(code)) {
        seenStoreAbsent = true;
        return { kind: "feature_unavailable" };
      }
      return { kind: "unexpected_error", message: error.message };
    }
    const seenIds = new Set<string>();
    for (const r of (data ?? []) as { customer_request_id: string }[]) {
      seenIds.add(r.customer_request_id);
    }
    return { kind: "ok", seenIds };
  } catch (err) {
    return {
      kind: "unexpected_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Legacy-shaped read for the pure recommendation model. A degraded read
 *  (absent OR broken) yields `available: false` so unseen-ness stays honestly
 *  unknowable; the CLASSIFICATION is preserved by `readMyOpportunitySeen`, and
 *  the use case reports a broken read rather than pretending it was absent. */
export function toSeenState(result: SeenReadResult): SeenState {
  return result.kind === "ok"
    ? { seenIds: result.seenIds, available: true }
    : { seenIds: new Set<string>(), available: false };
}

/**
 * Record first-seen markers via the RPC-only write path. Classifies the
 * outcome; never throws, never decides policy — the application layer decides
 * what a given classification means for the human.
 */
export async function writeOpportunitySeen(
  requestIds: readonly string[],
): Promise<SeenWriteResult> {
  const ids = requestIds.slice(0, MARK_SEEN_MAX_IDS);
  if (ids.length === 0) return { kind: "ok", marked: 0 };
  if (seenStoreAbsent) return { kind: "feature_unavailable" };

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { kind: "not_authenticated" };

    const { data, error } = await asAny(supabase).rpc(
      "mark_worker_opportunities_seen_v1",
      { p_request_ids: ids },
    );
    if (error) {
      const code = (error as { code?: string }).code;
      if (isFeatureAbsentCode(code)) {
        seenStoreAbsent = true;
        return { kind: "feature_unavailable" };
      }
      return { kind: "unexpected_error", message: error.message };
    }
    return { kind: "ok", marked: typeof data === "number" ? data : 0 };
  } catch (err) {
    return {
      kind: "unexpected_error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
