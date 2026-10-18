import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * DISCOVERY READS OF A WORKER (owner command 2026-10-18, migration 20261018160000).
 *
 * The raw `workers` row — which carries the person's name and free text — is readable only by the
 * worker, an admin, or a viewer with a WORKING RELATIONSHIP (RLS `caller_has_worker_relation_v1`).
 * A worker an employer found through the employer-visibility consent is reached ONLY through the
 * two definer reads below, which return professional fields and ids, never a name or free text:
 *
 *   - list_discoverable_worker_profiles_v1(ids) — the professional projection;
 *   - list_discoverable_worker_ids_v1(country, limit) — which discoverable workers, as ids.
 *
 * Every helper here answers "the relationship read first, the discovery projection for the rest",
 * so a related viewer keeps the full row and a discovery viewer gets the anonymous projection.
 *
 * The projection carries NO profile id: a pseudonymous key that joins to public business records
 * (companies / agencies / service offerings) could de-anonymise a person. A server flow that needs
 * one for a found worker asks a CONTEXT-BOUND door instead — a worker shortlisted on, or interested
 * in, the caller's own demand (`candidateProfileForContact`).
 * Fail-closed and migration-tolerant: an unavailable function (before the migration is applied)
 * or any error answers "nothing more" — the caller then sees exactly what the table returned.
 */

/** The projection's row — snake_case, the same names as the `workers` columns it mirrors. */
export interface DiscoverableWorkerRow {
  readonly id: string;
  readonly experience_years: number | null;
  readonly current_location_country: string | null;
  readonly preferred_countries: readonly string[] | null;
  readonly availability_status: string | null;
  readonly available_from: string | null;
  readonly salary_min_eur: number | null;
  readonly salary_max_eur: number | null;
  readonly preferred_contract_type: string | null;
  readonly pay_basis_preference: string | null;
  readonly night_shifts_ok: boolean | null;
  readonly weekend_shifts_ok: boolean | null;
  readonly overtime_ok: boolean | null;
  readonly driving_licence_categories: readonly string[] | null;
  readonly own_vehicle: boolean | null;
  readonly own_tools: boolean | null;
  /** Monday of the week the profile was last active — a bucket, never an exact timestamp. */
  readonly last_active_week: string | null;
  /** True for a documented QA fixture — computed in SQL, so the name never has to leave it. */
  readonly is_synthetic_fixture: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROJECTION_CAP = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function cleanIds(ids: readonly (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))];
}

/** Professional projection for discoverable workers among `ids` (up to 500 per call). */
export async function readDiscoverableWorkers(
  supabase: SupabaseClient,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, DiscoverableWorkerRow>> {
  const out = new Map<string, DiscoverableWorkerRow>();
  const unique = cleanIds(ids);
  for (let i = 0; i < unique.length; i += PROJECTION_CAP) {
    const chunk = unique.slice(i, i + PROJECTION_CAP);
    try {
      const { data, error } = await asAny(supabase).rpc("list_discoverable_worker_profiles_v1", {
        p_worker_ids: chunk,
      });
      if (error || !Array.isArray(data)) continue;
      for (const r of data as DiscoverableWorkerRow[]) {
        if (r && typeof r.id === "string") out.set(r.id, r);
      }
    } catch {
      // unavailable → nothing more (fail closed)
    }
  }
  return out;
}

/** Ids of discoverable workers, optionally by country (resident or preferred); ordered by id. */
export async function readDiscoverableWorkerIds(
  supabase: SupabaseClient,
  country: string | null,
  limit: number,
): Promise<{ ids: string[]; available: boolean }> {
  try {
    const { data, error } = await asAny(supabase).rpc("list_discoverable_worker_ids_v1", {
      p_country: country,
      p_limit: limit,
    });
    if (error || !Array.isArray(data)) return { ids: [], available: false };
    return {
      ids: (data as { id?: unknown }[])
        .map((r) => r?.id)
        .filter((v): v is string => typeof v === "string"),
      available: true,
    };
  } catch {
    return { ids: [], available: false };
  }
}

/**
 * worker id → profile id, server-side only, for workers this viewer has a WORKING RELATIONSHIP with
 * (the RLS-scoped table). A found worker has no profile id here by design — see the file header.
 */
export async function readWorkerProfileIds(
  supabase: SupabaseClient,
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = cleanIds(ids);
  if (unique.length === 0) return out;
  try {
    const { data } = await asAny(supabase).from("workers").select("id, profile_id").in("id", unique);
    for (const w of (data ?? []) as { id: string; profile_id: string | null }[]) {
      if (w.profile_id) out.set(w.id, w.profile_id);
    }
  } catch {
    // fall through to the projection
  }
  return out;
}

/**
 * The profile id needed to open a thread with a candidate: a related worker from the table, a found
 * worker ONLY when shortlisted on / interested in the caller's own demand `requestId`
 * (candidate_profile_for_contact_v1). Null otherwise.
 */
export async function candidateProfileForContact(
  supabase: SupabaseClient,
  workerId: string,
  requestId: string,
): Promise<string | null> {
  const related = (await readWorkerProfileIds(supabase, [workerId])).get(workerId);
  if (related) return related;
  if (!UUID_RE.test(workerId) || !UUID_RE.test(requestId)) return null;
  try {
    const { data, error } = await asAny(supabase).rpc("candidate_profile_for_contact_v1", {
      p_worker_id: workerId,
      p_request_id: requestId,
    });
    return !error && typeof data === "string" && UUID_RE.test(data) ? data : null;
  } catch {
    return null;
  }
}

/** Can this caller reach the worker at all — related (table) or discoverable (projection)? */
export async function workerReachable(supabase: SupabaseClient, workerId: string): Promise<boolean> {
  if (!UUID_RE.test(workerId)) return false;
  try {
    const { data } = await asAny(supabase).from("workers").select("id").eq("id", workerId).maybeSingle();
    if (data) return true;
  } catch {
    // fall through
  }
  return (await readDiscoverableWorkers(supabase, [workerId])).has(workerId);
}
