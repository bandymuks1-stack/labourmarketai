import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { SeenState } from "./recommendations-model";

/**
 * Worker opportunity SEEN markers (Job Recommendation Engine surfacing).
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
 * back `available: false` and every write is a quiet no-op — the "new job
 * matches" spine count then stays 0 (honest degradation: a badge that could
 * never clear is noise) and the "Nauja" chip falls back to the 7-day
 * created_at window. A marker stores ONLY (profile, request id, seen_at):
 * no demand facts are ever copied.
 */

/** Relation missing — table not applied yet (Postgres undefined_table). */
const RELATION_NOT_FOUND = "42P01";
/** Function missing — RPC not applied yet (Postgres undefined_function). */
const UNDEFINED_FUNCTION = "42883";
/** Function missing in PostgREST's schema cache (same meaning, REST layer). */
const POSTGREST_FN_NOT_FOUND = "PGRST202";
/** Table missing in PostgREST's schema cache (same meaning, REST layer). */
const POSTGREST_REL_NOT_FOUND = "PGRST205";

function isFeatureAbsentCode(code: string | undefined): boolean {
  return (
    code === RELATION_NOT_FOUND ||
    code === UNDEFINED_FUNCTION ||
    code === POSTGREST_FN_NOT_FOUND ||
    code === POSTGREST_REL_NOT_FOUND
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Max ids per mark call — mirrors the RPC's own hard bound. */
export const MARK_SEEN_MAX_IDS = 100;

/** Process-lifetime memo (P0 perf): once the seen store is proven absent
 *  (draft migration not applied), stop re-asking on EVERY navigation — the
 *  404 was burning a round-trip per authed page load. Cleared naturally on
 *  deploy/instance restart, i.e. after the owner applies the migration. */
let seenStoreAbsent = false;

/** Own seen markers (RLS: the owning profile only). Absent store → honest
 *  `available: false` and an empty set. */
export async function listMyOpportunitySeen(
  supabase: SupabaseClient,
  profileId: string,
): Promise<SeenState> {
  if (seenStoreAbsent) return { seenIds: new Set(), available: false };
  try {
    const { data, error } = await asAny(supabase)
      .from("worker_opportunity_seen")
      .select("customer_request_id")
      .eq("profile_id", profileId);
    if (error) {
      if (isFeatureAbsentCode((error as { code?: string }).code)) {
        seenStoreAbsent = true;
      }
      return { seenIds: new Set(), available: false };
    }
    const seenIds = new Set<string>();
    for (const r of (data ?? []) as { customer_request_id: string }[]) {
      seenIds.add(r.customer_request_id);
    }
    return { seenIds, available: true };
  } catch {
    return { seenIds: new Set(), available: false };
  }
}

export type MarkSeenResult =
  | { kind: "ok"; marked: number }
  | { kind: "no-user" }
  | { kind: "feature-absent" }
  | { kind: "error"; message: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Best-effort first-seen marking (fire-and-forget from render surfaces).
 *  Invalid ids are dropped client-side; the RPC re-validates existence and
 *  caps server-side. Never throws. */
export async function markOpportunitiesSeen(
  requestIds: readonly string[],
): Promise<MarkSeenResult> {
  const ids = [...new Set(requestIds.filter((id) => UUID_RE.test(id)))].slice(
    0,
    MARK_SEEN_MAX_IDS,
  );
  if (ids.length === 0) return { kind: "ok", marked: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-user" };

  try {
    const { data, error } = await asAny(supabase).rpc(
      "mark_worker_opportunities_seen_v1",
      { p_request_ids: ids },
    );
    if (error) {
      const code = (error as { code?: string }).code;
      if (isFeatureAbsentCode(code)) return { kind: "feature-absent" };
      return { kind: "error", message: error.message };
    }
    return { kind: "ok", marked: typeof data === "number" ? data : 0 };
  } catch {
    return { kind: "feature-absent" };
  }
}
