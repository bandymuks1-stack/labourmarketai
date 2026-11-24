"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  SAVED_SEARCH_LABEL_MAX,
  toStoredCriteria,
  type SavedSearchCriteriaKey,
} from "@/lib/opportunities/saved-search-model";
import type { DiscoveryFilterState } from "@/lib/opportunities/discovery-filters";

/**
 * Saved-search writes (DEM-8). Every write goes through the gated SECURITY
 * DEFINER RPCs from migration 20260914140000 — there is no INSERT/UPDATE/
 * DELETE policy on the table, so this is the only path and a direct write is
 * refused by the database (proven in
 * scripts/db-proof/worker-saved-searches.sh).
 *
 * Degradation vocabulary matches `saved-opportunities.ts`: `feature-absent`
 * while the owner-gated migration is unapplied.
 */

const RPC_NOT_FOUND = "42883";
const RELATION_NOT_FOUND = "42P01";
const POSTGREST_FN_NOT_FOUND = "PGRST202";
const POSTGREST_RELATION_NOT_FOUND = "PGRST205";

export type SavedSearchActionResult =
  | { ok: true; id?: string }
  | {
      ok: false;
      code: "auth" | "invalid" | "limit" | "feature-absent" | "error";
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function mapError(error: { code?: string; message?: string }): SavedSearchActionResult {
  const code = error.code ?? "";
  if (
    code === RPC_NOT_FOUND ||
    code === RELATION_NOT_FOUND ||
    code === POSTGREST_FN_NOT_FOUND ||
    code === POSTGREST_RELATION_NOT_FOUND
  ) {
    return { ok: false, code: "feature-absent" };
  }
  const msg = (error.message ?? "").toLowerCase();
  if (msg.includes("limit reached")) return { ok: false, code: "limit" };
  if (
    msg.includes("label required") ||
    msg.includes("criteria required") ||
    msg.includes("short strings") ||
    // The database's own CHECK, if a criteria key ever gets past the model.
    msg.includes("criteria_keys") ||
    msg.includes("criteria_size")
  ) {
    return { ok: false, code: "invalid" };
  }
  console.error("[saved-searches] write failed:", error.message);
  return { ok: false, code: "error" };
}

async function client(): Promise<SupabaseClient | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? supabase : null;
}

export async function saveSearchAction(input: {
  label: string;
  criteria: DiscoveryFilterState;
  notify: boolean;
}): Promise<SavedSearchActionResult> {
  const supabase = await client();
  if (!supabase) return { ok: false, code: "auth" };

  const label = input.label.trim().slice(0, SAVED_SEARCH_LABEL_MAX);
  if (!label) return { ok: false, code: "invalid" };
  const criteria: Record<SavedSearchCriteriaKey, string> | Record<string, string> =
    toStoredCriteria(input.criteria);
  // A question with no dimensions matches the whole board; saving it would
  // create an alert that fires on everything.
  if (Object.keys(criteria).length === 0) return { ok: false, code: "invalid" };

  const { data, error } = await asAny(supabase).rpc("save_worker_search_v1", {
    p_label: label,
    p_criteria: criteria,
    p_notify: input.notify,
  });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true, id: typeof data === "string" ? data : undefined };
}

export async function deleteSearchAction(id: string): Promise<SavedSearchActionResult> {
  const supabase = await client();
  if (!supabase) return { ok: false, code: "auth" };
  if (!id) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("delete_worker_search_v1", { p_id: id });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** The ONLY thing that clears "new since you last looked" is the worker
 *  actually looking. Called when a saved search is opened, never by a
 *  background writer. */
export async function markSearchSeenAction(id: string): Promise<SavedSearchActionResult> {
  const supabase = await client();
  if (!supabase) return { ok: false, code: "auth" };
  if (!id) return { ok: false, code: "invalid" };
  const { error } = await asAny(supabase).rpc("mark_worker_search_seen_v1", { p_id: id });
  if (error) return mapError(error);
  revalidatePath("/", "layout");
  return { ok: true };
}
