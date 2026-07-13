import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingColumnCode,
  isMissingTableCode,
  type AgencyClient,
  type AgencyClientsState,
  type AgencyDemandRow,
  type AgencyDemandsState,
} from "@/lib/agency/clients-model";

/**
 * Agency client read service (canonical journey P5).
 *
 * Backed by the OWNER-GATED draft migration 20260713160000_agency_clients_v1
 * (NOT applied yet). Until the owner applies it, the client read reports
 * `needs-migration` and the demand read reports `linkable: false` — the UI
 * shows the honest "prepared, owner activation pending" state, exactly the
 * established migration-gated pattern (company locations / team brigades).
 *
 * REUSE, not a parallel model: the demand list below reads the CANONICAL
 * public.customer_requests table (the same rows the scouting page and the
 * demand wizard operate on) scoped to the caller's own profile_id by RLS.
 * No candidate data, no second demand store, no outbound action.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(v: unknown): any {
  return v;
}

export async function listAgencyClients(): Promise<AgencyClientsState> {
  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase)
      .from("agency_clients")
      .select("id, name, contact_name, contact_email, note, created_at")
      .order("created_at", { ascending: true });
    if (error) {
      if (isMissingTableCode(error.code)) return { kind: "needs-migration" };
      console.error("[agency-clients] read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map(
        (r: Record<string, unknown>): AgencyClient => ({
          id: r.id as string,
          name: r.name as string,
          contactName: (r.contact_name as string | null) ?? null,
          contactEmail: (r.contact_email as string | null) ?? null,
          note: (r.note as string | null) ?? null,
          createdAt: r.created_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * The agency's OWN demands from the canonical customer_requests table
 * (owner-scoped SELECT via RLS; same 50-row window as the scouting list).
 *
 * The `agency_client_id` column exists only after the owner-gated migration;
 * a missing-column error (42703) falls back to the columns that exist today
 * and reports `linkable: false` — an honest "not yet linkable" state, never
 * a fabricated link.
 */
export async function listAgencyDemands(): Promise<AgencyDemandsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", linkable: false, rows: [] };

  const base = "id, title, status, created_at";
  try {
    let linkable = true;
    let { data, error } = await asAny(supabase)
      .from("customer_requests")
      .select(`${base}, agency_client_id`)
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error && (isMissingColumnCode(error.code) || isMissingTableCode(error.code))) {
      linkable = false;
      ({ data, error } = await asAny(supabase)
        .from("customer_requests")
        .select(base)
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50));
    }
    if (error) {
      if (isMissingTableCode(error.code)) {
        return { kind: "ok", linkable: false, rows: [] };
      }
      console.error("[agency-clients] demand read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      linkable,
      rows: (data ?? []).map(
        (r: Record<string, unknown>): AgencyDemandRow => ({
          id: r.id as string,
          title: (r.title as string | null) ?? "—",
          status: (r.status as string | null) ?? "draft",
          agencyClientId: (r.agency_client_id as string | null) ?? null,
          createdAt: r.created_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}
