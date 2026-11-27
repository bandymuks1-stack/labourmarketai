import "server-only";

import { cache } from "react";
import { demandsOfWorkspaceFilter } from "@/lib/demand/demand-org-scope";
import { isLabourDemandRow } from "@/lib/demand/market-direction";

import { createClient } from "@/lib/supabase/server";
import { requireEmployerCompany } from "@/lib/company/employer-company-context";
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
 * Backed by migration 20260713160000_agency_clients_v1, applied to production
 * on 2026-09-14 (docs/APPLIED_LEDGER.md). On a database that does not have it
 * (a fresh local stack mid-replay) the client read still reports
 * `needs-migration` and the demand read reports `linkable: false`, so the UI
 * says so instead of failing — the established migration-gated pattern
 * (company locations / team brigades).
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
  // Stage A workspace gate: the agency spine IS the canonical company profile
  // (Direction A — company_type='staffing_agency'), so the ONE employer
  // resolver is the agency-context authority too. No workspace → fail-closed
  // to the module's established `error` shape, never a silent empty list.
  const employer = await requireEmployerCompany();
  if (!employer.ok) return { kind: "error" };
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
 *
 * Own rows only, on purpose: both writes this list feeds, linking a need to a
 * client (`set_demand_agency_client_v1`) and sharing it with an agency
 * (`share_request_with_agency_v1`), accept only the caller's own rows. Read
 * once per render (duplication audit ORG-4): an agency that is also a client
 * asked for the same rows twice on `/partners`.
 */
export const listAgencyDemands = cache(readAgencyDemands);

async function readAgencyDemands(): Promise<AgencyDemandsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "ok", linkable: false, rows: [] };

  // Stage A workspace gate — same rule as listAgencyClients above: these are
  // the agency's EMPLOYER demand rows; no resolved company workspace → the
  // established fail-closed `error` state.
  const employer = await requireEmployerCompany();
  if (!employer.ok) return { kind: "error" };

  // kind + payload let the list drop help-desk and privacy requests to the
  // platform: they are never a need an agency may be shown (P0 2026-11-22).
  const base = "id, title, status, created_at, kind, payload";
  // THE ACTIVE WORKSPACE'S rows, by the one filter every needs reader uses: a
  // person running two companies never sees one company's needs in the other.
  const workspace = demandsOfWorkspaceFilter(user.id, employer.organizationId);
  try {
    let linkable = true;
    let { data, error } = await asAny(supabase)
      .from("customer_requests")
      .select(`${base}, agency_client_id`)
      .eq("profile_id", user.id)
      .or(workspace)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error && (isMissingColumnCode(error.code) || isMissingTableCode(error.code))) {
      linkable = false;
      ({ data, error } = await asAny(supabase)
        .from("customer_requests")
        .select(base)
        .eq("profile_id", user.id)
        .or(workspace)
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
      rows: (data ?? [])
        .filter((r: Record<string, unknown>) =>
          isLabourDemandRow({ kind: r.kind as string | null, payload: r.payload }),
        )
        .map(
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
