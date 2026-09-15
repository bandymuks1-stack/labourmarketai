import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  alertableSearches,
  toDiscoveryFilterState,
  type SavedSearch,
  type SavedSearchReading,
} from "@/lib/opportunities/saved-search-model";
import { emitSavedSearchMatchNotification } from "@/lib/notifications/event-emitters";

/**
 * The worker's own saved searches (DEM-8).
 *
 * Shaped on `lib/opportunities/saved-opportunities.ts`, deliberately: it is
 * the closest architectural sibling — a private, worker-owned marker store
 * behind an owner-gated migration — and copying its degradation vocabulary
 * means the board does not learn a fourth dialect for "not applied yet".
 *
 * While migration 20260914140000 is unapplied every read returns
 * `available: false` and the board renders NO saved-search controls at all:
 * honest invisibility, never a dead button.
 *
 * Authorization is the database's. `worker_saved_searches_select` admits the
 * saving worker and admins; there is no INSERT/UPDATE/DELETE policy, so the
 * three SECURITY DEFINER RPCs are the only door. Nothing here widens that.
 */

const RELATION_NOT_FOUND = "42P01";
const UNDEFINED_COLUMN = "42703";
const POSTGREST_RELATION_NOT_FOUND = "PGRST205";

function isFeatureAbsent(code: string | undefined): boolean {
  return (
    code === RELATION_NOT_FOUND ||
    code === UNDEFINED_COLUMN ||
    code === POSTGREST_RELATION_NOT_FOUND
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface MySavedSearches {
  readonly searches: readonly SavedSearch[];
  /** False until the owner applies the migration — the UI must not render a
   *  control that cannot work. */
  readonly available: boolean;
}

const READ_LIMIT = 50;

export async function getMySavedSearches(): Promise<MySavedSearches> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { searches: [], available: false };

  const res = await asAny(supabase)
    .from("worker_saved_searches")
    .select("id, label, criteria, notify, last_seen_at")
    .order("created_at", { ascending: false })
    .limit(READ_LIMIT);
  if (res.error) {
    // A missing relation is "not applied". A real failure is ALSO not an
    // empty list of searches — in both cases the controls stay hidden rather
    // than telling the worker they have saved nothing.
    return { searches: [], available: false };
  }

  type Row = {
    id: string;
    label: string;
    criteria: unknown;
    notify: boolean | null;
    last_seen_at: string | null;
  };
  const searches: SavedSearch[] = ((res.data ?? []) as Row[]).map((r) => ({
    id: r.id,
    label: r.label,
    criteria: toDiscoveryFilterState(r.criteria),
    notify: r.notify !== false,
    lastSeenAt: r.last_seen_at,
  }));
  return { searches, available: true };
}

export { isFeatureAbsent as isSavedSearchStoreAbsent };

/**
 * Record, durably, that a saved search has answers the worker has not seen.
 *
 * Called from the worker's OWN board render, AFTER their own read has already
 * counted the matches under their own authorization. The emitter therefore
 * never decides what matches — it only records that something did, and the
 * count is recomputed live wherever the notification lands.
 *
 * Fire-and-forget and deliberately unawaited by the caller: a board render
 * must never fail, or wait, because a notification could not be written. The
 * store's exactly-once key does the rest, so re-rendering the board twice in
 * a minute emits nothing the second time.
 */
export async function notifySavedSearchMatches(
  readings: readonly SavedSearchReading[],
  todayIso: string,
): Promise<void> {
  const alertable = alertableSearches(readings);
  if (alertable.length === 0) return;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    for (const search of alertable) {
      await emitSavedSearchMatchNotification({
        recipientProfileId: user.id,
        savedSearchId: search.id,
        todayIso,
      });
    }
  } catch (error) {
    console.error("[saved-searches] alert emit failed:", error);
  }
}
