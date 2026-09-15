import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingRpcCode,
  isMissingTableCode,
  type AgencyConnection,
  type AgencyConnectionsState,
  type ClientConnectionInvite,
  type ClientInvitesState,
  type OfferProgressRow,
  type OfferProgressState,
  type OfferedCandidateRow,
  type SharedRequestRow,
  type SharedRequestsState,
} from "@/lib/agency/bridge-model";

/**
 * Real two-subject bridge — read services (issue #859), backed by migration
 * 20260723180000.
 *
 * THAT MIGRATION IS APPLIED. Read on production 2026-09-14:
 * `agency_client_connections`, `agency_client_request_shares` and
 * `agency_candidate_offers` all exist with RLS enabled, the share SELECT
 * policy carries its `owns_company(c.client_company_id)` clause, and
 * `unshare_request_v1(uuid)` is present — with 2 connections, 1 ACTIVE share
 * and 2 offers actually stored. The header this comment replaces still said
 * the migration was an unapplied owner-gated draft and that every read
 * reports `needs-migration`; that stopped being true and made a live store
 * look dormant. The `needs-migration` branches below stay exactly as they
 * are: they are the honest degradation for an environment where the table is
 * absent, not a statement about production.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(v: unknown): any {
  return v;
}

/** AGENCY side: connections owned by the caller's agency company. */
export async function listAgencyConnections(
  agencyCompanyId: string,
): Promise<AgencyConnectionsState> {
  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase)
      .from("agency_client_connections")
      .select("id, agency_company_id, client_company_id, invited_email, status, created_at")
      .eq("agency_company_id", agencyCompanyId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingTableCode(error.code)) return { kind: "needs-migration" };
      console.error("[bridge] connections read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map(
        (r: Record<string, unknown>): AgencyConnection => ({
          id: r.id as string,
          agencyCompanyId: r.agency_company_id as string,
          clientCompanyId: (r.client_company_id as string | null) ?? null,
          invitedEmail: r.invited_email as string,
          status: r.status as AgencyConnection["status"],
          createdAt: r.created_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}

/** CLIENT side: connection invites addressed to the caller's own email. RLS on
 *  the connection table already scopes by `invited_email = jwt email`, so a
 *  plain select returns only the caller's invites (no email is leaked). */
export async function listMyConnectionInvites(): Promise<ClientInvitesState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { kind: "ok", rows: [] };
  try {
    const { data, error } = await asAny(supabase)
      .from("agency_client_connections")
      .select("id, invited_email, status, created_at, agency_company_id, companies!agency_client_connections_agency_company_id_fkey(display_name, legal_name)")
      .eq("invited_email", user.email.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      if (isMissingTableCode(error.code)) return { kind: "needs-migration" };
      // The embedded FK alias may not resolve in every schema cache; fall back.
      const fb = await asAny(supabase)
        .from("agency_client_connections")
        .select("id, invited_email, status, created_at")
        .eq("invited_email", user.email.toLowerCase())
        .order("created_at", { ascending: false })
        .limit(100);
      if (fb.error) {
        if (isMissingTableCode(fb.error.code)) return { kind: "needs-migration" };
        return { kind: "error" };
      }
      return {
        kind: "ok",
        rows: (fb.data ?? []).map(
          (r: Record<string, unknown>): ClientConnectionInvite => ({
            id: r.id as string,
            agencyName: "—",
            invitedEmail: r.invited_email as string,
            status: r.status as ClientConnectionInvite["status"],
            createdAt: r.created_at as string,
          }),
        ),
      };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map((r: Record<string, unknown>): ClientConnectionInvite => {
        const co = (r.companies ?? {}) as { display_name?: string; legal_name?: string };
        return {
          id: r.id as string,
          agencyName: co.display_name || co.legal_name || "—",
          invitedEmail: r.invited_email as string,
          status: r.status as ClientConnectionInvite["status"],
          createdAt: r.created_at as string,
        };
      }),
    };
  } catch {
    return { kind: "error" };
  }
}

/** AGENCY side: requests connected clients shared with the caller-agency. */
export async function listSharedRequestsForAgency(): Promise<SharedRequestsState> {
  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase).rpc("list_shared_requests_for_agency_v1");
    if (error) {
      if (isMissingTableCode(error.code) || error.code === "42883" || error.code === "PGRST202") {
        return { kind: "needs-migration" };
      }
      console.error("[bridge] shared-requests read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map(
        (r: Record<string, unknown>): SharedRequestRow => ({
          shareId: r.share_id as string,
          connectionId: r.connection_id as string,
          requestId: r.request_id as string,
          title: (r.title as string | null) ?? "—",
          roleText: (r.role_text as string | null) ?? null,
          country: (r.country as string | null) ?? null,
          status: (r.status as string | null) ?? "draft",
          sharedAt: r.shared_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}

/**
 * CLIENT side: what this client is CURRENTLY disclosing, per connection.
 *
 * The agency has always been able to see what was shared with it
 * (`list_shared_requests_for_agency_v1`); the client doing the disclosing
 * could not see or withdraw it, and the only withdrawal available was
 * revoking the whole relationship. This read closes that half with the
 * authority that already exists: `agency_client_request_shares_select`
 * (migration 20260723180000 §2) admits the client owner of the connection,
 * and the client owns the `customer_requests` rows the titles come from, so
 * no RPC and no new grant is needed.
 *
 * `connectionIds` NARROWS, never widens: a caller who happens to own both an
 * agency and a client company sees only the connections this surface listed
 * for them, not everything RLS would allow.
 */
export async function listSharedRequestsByClient(
  connectionIds: readonly string[],
): Promise<SharedRequestsState> {
  const ids = connectionIds.slice(0, 100);
  if (ids.length === 0) return { kind: "ok", rows: [] };
  const supabase = await createClient();
  const map = (r: Record<string, unknown>, req: Record<string, unknown>): SharedRequestRow => ({
    shareId: r.id as string,
    connectionId: r.connection_id as string,
    requestId: r.request_id as string,
    title: (req.title as string | null) ?? "\u2014",
    roleText: (req.role_or_work_type as string | null) ?? null,
    country: (req.country as string | null) ?? null,
    status: (req.status as string | null) ?? "draft",
    sharedAt: r.created_at as string,
  });
  try {
    const { data, error } = await asAny(supabase)
      .from("agency_client_request_shares")
      .select(
        "id, connection_id, request_id, created_at, customer_requests!agency_client_request_shares_request_id_fkey(title, role_or_work_type, country, status)",
      )
      .in("connection_id", ids)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (isMissingTableCode(error.code)) return { kind: "needs-migration" };
      // The embedded FK alias may not resolve in every schema cache; the
      // share rows still answer "what is disclosed", which is the point.
      const fb = await asAny(supabase)
        .from("agency_client_request_shares")
        .select("id, connection_id, request_id, created_at")
        .in("connection_id", ids)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(200);
      if (fb.error) {
        if (isMissingTableCode(fb.error.code)) return { kind: "needs-migration" };
        console.error("[bridge] client shares read failed:", fb.error.code);
        return { kind: "error" };
      }
      return {
        kind: "ok",
        rows: (fb.data ?? []).map((r: Record<string, unknown>) => map(r, {})),
      };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map((r: Record<string, unknown>) =>
        map(r, (r.customer_requests ?? {}) as Record<string, unknown>),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}

/** AGENCY side: the caller-agency's offers + derived client-review stage. */
export async function listAgencyOfferProgress(): Promise<OfferProgressState> {
  const supabase = await createClient();
  try {
    const { data, error } = await asAny(supabase).rpc("list_agency_offer_progress_v1");
    if (error) {
      if (isMissingTableCode(error.code) || error.code === "42883" || error.code === "PGRST202") {
        return { kind: "needs-migration" };
      }
      console.error("[bridge] offer-progress read failed:", error.code);
      return { kind: "error" };
    }
    return {
      kind: "ok",
      rows: (data ?? []).map(
        (r: Record<string, unknown>): OfferProgressRow => ({
          offerId: r.offer_id as string,
          requestId: r.request_id as string,
          workerId: r.worker_id as string,
          offerStatus: r.offer_status as OfferProgressRow["offerStatus"],
          reviewStage: r.review_stage as OfferProgressRow["reviewStage"],
          createdAt: r.created_at as string,
        }),
      ),
    };
  } catch {
    return { kind: "error" };
  }
}

/** CLIENT side: agency-offered candidate worker ids for a request the caller
 *  owns — the client's scouting page renders these as candidates. */
export async function listOfferedCandidatesForRequest(
  requestId: string,
): Promise<readonly OfferedCandidateRow[]> {
  const supabase = await createClient();
  const toRow = (r: Record<string, unknown>): OfferedCandidateRow => ({
    offerId: r.offer_id as string,
    workerId: r.worker_id as string,
    agencyName: (r.agency_name as string | null) ?? "—",
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as string,
    offerStatus: ((r.offer_status as string | null) ?? "offered") as OfferedCandidateRow["offerStatus"],
    bookingId: (r.booking_id as string | null) ?? null,
    decidedAt: (r.decided_at as string | null) ?? null,
  });
  try {
    // v2 (migration 20260903101000) carries the client's decision + booking and
    // includes decided offers; until it is applied, the v1 read (open offers
    // only) answers — same surface, honestly narrower.
    const v2 = await asAny(supabase).rpc(
      "list_agency_offered_candidates_for_request_v2",
      { p_request_id: requestId },
    );
    if (!v2.error) return (v2.data ?? []).map(toRow);
    if (!isMissingRpcCode(v2.error.code)) return [];
    const { data, error } = await asAny(supabase).rpc(
      "list_agency_offered_candidates_for_request_v1",
      { p_request_id: requestId },
    );
    if (error) return [];
    return (data ?? []).map(toRow);
  } catch {
    return [];
  }
}
