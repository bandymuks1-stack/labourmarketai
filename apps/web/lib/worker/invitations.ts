import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Worker-side pending invitations + explicit acceptance (slice
 * sales-core-nonstop-v1, gap #1). The invited worker can SELECT invitations
 * addressed to their email (RLS, migrations 0025/0027) but cannot self-insert a
 * link — acceptance goes through the SECURITY DEFINER RPCs
 * accept_{company,agency}_worker_invitation (migration 0036), which create the
 * real company_workers / agency_workers link and mark the invitation accepted.
 */

const RPC_NOT_FOUND_CODE = "42883";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export interface PendingWorkerInvitation {
  readonly kind: "company" | "agency";
  /** company_id or agency_id — the argument the accept RPC takes. */
  readonly orgId: string;
  readonly orgName: string;
  readonly note: string | null;
  readonly invitedAt: string;
}

export type AcceptInvitationOutcome =
  | "linked"
  | "already_linked"
  | "no_invitation"
  | "no_worker_profile";

export type AcceptInvitationResult =
  | { kind: "ok"; outcome: AcceptInvitationOutcome }
  | { kind: "needs-migration" }
  | { kind: "error"; message: string };

/** Pending invitations addressed to the current user's email (company + agency). */
export async function listMyPendingWorkerInvitations(): Promise<
  readonly PendingWorkerInvitation[]
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const email = user?.email;
  if (!email) return [];

  const out: PendingWorkerInvitation[] = [];

  const { data: co } = await asAny(supabase)
    .from("company_worker_invitations")
    .select("company_id, note, created_at, companies(display_name, legal_name)")
    .ilike("invited_email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const r of co ?? []) {
    const c = r.companies as { display_name: string | null; legal_name: string | null } | null;
    out.push({
      kind: "company",
      orgId: r.company_id as string,
      orgName: c?.display_name ?? c?.legal_name ?? "—",
      note: (r.note as string | null) ?? null,
      invitedAt: r.created_at as string,
    });
  }

  const { data: ag } = await asAny(supabase)
    .from("agency_worker_invitations")
    .select("agency_id, note, created_at, agencies(legal_name)")
    .ilike("invited_email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const r of ag ?? []) {
    const a = r.agencies as { legal_name: string | null } | null;
    out.push({
      kind: "agency",
      orgId: r.agency_id as string,
      orgName: a?.legal_name ?? "—",
      note: (r.note as string | null) ?? null,
      invitedAt: r.created_at as string,
    });
  }

  return out;
}

async function acceptViaRpc(
  rpcName:
    | "accept_company_worker_invitation"
    | "accept_agency_worker_invitation",
  paramName: "p_company_id" | "p_agency_id",
  orgId: string,
): Promise<AcceptInvitationResult> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase).rpc(rpcName, {
    [paramName]: orgId,
  });
  if (error) {
    if (error.code === RPC_NOT_FOUND_CODE || error.code === RELATION_NOT_FOUND_CODE)
      return { kind: "needs-migration" };
    return { kind: "error", message: error.message };
  }
  return { kind: "ok", outcome: data as AcceptInvitationOutcome };
}

export function acceptCompanyWorkerInvitation(
  companyId: string,
): Promise<AcceptInvitationResult> {
  return acceptViaRpc(
    "accept_company_worker_invitation",
    "p_company_id",
    companyId,
  );
}

export function acceptAgencyWorkerInvitation(
  agencyId: string,
): Promise<AcceptInvitationResult> {
  return acceptViaRpc("accept_agency_worker_invitation", "p_agency_id", agencyId);
}
