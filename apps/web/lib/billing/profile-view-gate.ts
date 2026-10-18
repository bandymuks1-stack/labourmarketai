import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EMPLOYER PROFILE-VIEW LIMIT (owner directive 2026-10-18, migration 20261018150000).
 *
 * The free employer plan opens up to 3 UNIQUE anonymized worker profiles per organization;
 * re-opening one of them is free; a working relationship never counts; paid plans and an
 * owner-granted VIP status carry their own limits. The database decides all of it in
 * `record_worker_profile_view_v1` — the limit is computed there from the organization's own
 * state, never passed from here.
 *
 * This wrapper only maps the answer. It never decides identity: a view the gate allows is still
 * the ANONYMOUS professional profile; names stay behind the worker's own disclosure.
 *
 * Open on errors by design: `42501` (the viewer does not act for that organization — e.g. a
 * colleague or the worker's own manager through another path), `P0002` (RLS decides visibility
 * elsewhere), and a missing function before the migration is applied are not "limit reached".
 * Only an explicit `limit_reached` answer closes the page.
 */
export type ProfileViewGate =
  | { readonly kind: "open" }
  | { readonly kind: "limit"; readonly used: number; readonly limit: number; readonly plan: string };

export async function gateWorkerProfileView(
  supabase: SupabaseClient,
  organizationId: string | null,
  workerId: string,
): Promise<ProfileViewGate> {
  if (!organizationId || !workerId) return { kind: "open" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("record_worker_profile_view_v1", {
      p_organization_id: organizationId,
      p_worker_id: workerId,
    });
    if (error || !data || typeof data !== "object") return { kind: "open" };
    const r = data as { allowed?: unknown; reason?: unknown; used?: unknown; limit?: unknown; plan?: unknown };
    if (r.allowed === false && r.reason === "limit_reached") {
      return {
        kind: "limit",
        used: typeof r.used === "number" ? r.used : 0,
        limit: typeof r.limit === "number" ? r.limit : 0,
        plan: typeof r.plan === "string" ? r.plan : "free",
      };
    }
    return { kind: "open" };
  } catch {
    return { kind: "open" };
  }
}
