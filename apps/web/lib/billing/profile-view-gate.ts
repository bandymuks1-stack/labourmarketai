import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * EMPLOYER PROFILE-VIEW LIMIT (owner directive 2026-10-18, migration 20261018150000).
 *
 * The free employer plan opens up to 3 UNIQUE anonymized worker profiles per organization;
 * re-opening one of them is free; a working relationship never counts; paid plans and an
 * owner-granted VIP status carry their own limits. The database decides all of it in
 * `record_worker_profile_view_v1` — the limit is computed there from the organization's own
 * state, never passed from here — and the discovery projection releases the DETAIL fields only
 * after such a counted view, so the limit holds on the data, not only on this page.
 *
 * Called ONLY for a viewer WITHOUT a working relationship (the person page decides that first).
 * Fail-closed for that viewer:
 *   - no organization acting for the view → `needs-organization` (a view must be counted somewhere);
 *   - the viewer does not manage that organization (42501) → `needs-organization`;
 *   - any other error → `unavailable`.
 * The ONE open fallback is a missing function: before the migration is applied the page behaves
 * exactly as today.
 */
export type ProfileViewGate =
  | { readonly kind: "open" }
  | { readonly kind: "limit"; readonly used: number; readonly limit: number; readonly plan: string }
  | { readonly kind: "needs-organization" }
  | { readonly kind: "unavailable" };

const MISSING_FUNCTION = new Set(["42883", "PGRST202"]);

export async function gateWorkerProfileView(
  supabase: SupabaseClient,
  organizationId: string | null,
  workerId: string,
): Promise<ProfileViewGate> {
  if (!workerId) return { kind: "unavailable" };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("record_worker_profile_view_v1", {
      p_organization_id: organizationId,
      p_worker_id: workerId,
    });
    if (error) {
      const code = typeof error.code === "string" ? error.code : "";
      if (MISSING_FUNCTION.has(code)) return { kind: "open" };
      // No organization (22023 on a null argument) or not a manager of it (42501).
      if (code === "22023" || code === "42501") return { kind: "needs-organization" };
      return { kind: "unavailable" };
    }
    if (!data || typeof data !== "object") return { kind: "unavailable" };
    const r = data as { allowed?: unknown; reason?: unknown; used?: unknown; limit?: unknown; plan?: unknown };
    if (r.allowed === false && r.reason === "limit_reached") {
      return {
        kind: "limit",
        used: typeof r.used === "number" ? r.used : 0,
        limit: typeof r.limit === "number" ? r.limit : 0,
        plan: typeof r.plan === "string" ? r.plan : "free",
      };
    }
    return r.allowed === true ? { kind: "open" } : { kind: "unavailable" };
  } catch {
    return { kind: "unavailable" };
  }
}
