"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  isBridgeUuid,
  isMissingRpcCode,
  toBridgeInviteDelivery,
  validateInviteEmail,
  validateOfferNote,
  type BridgeInviteDelivery,
} from "@/lib/agency/bridge-model";
import { toActiveLocale } from "@/lib/i18n/config";
import {
  createShareableInvitationAction,
  resendInvitationAction,
} from "@/lib/invitations/actions";
import { AGENCY_CLIENT_PROPOSED_ROLE } from "@/lib/invitations/model";
import { emitServerFunnelEvent } from "@/lib/telemetry/server-funnel";
import { FUNNEL_EVENTS } from "@/lib/telemetry/funnel-events";

/**
 * TIME TO FIRST REAL VALUE (real recruiter pilot, 2026-09-04). Every bridge
 * write below is a REAL state-changing action by one of the two subjects, so
 * each success emits `first_real_action` server-side (profile derived from
 * the session; the TTFV model takes the earliest per person, so a later
 * action is harmless). `role_context` names the side that acted - the
 * agency (invite / offer) or the client company (accept / share / decide) -
 * and `step` the action; bounded scalars only, never ids or e-mails. The
 * matching `first_real_result` is emitted where the OTHER side's response
 * becomes visible (agency bridge section / client scouting offers), because
 * a result is received when it is seen, and by the person who receives it.
 */
function emitFirstRealAction(
  roleContext: "agency" | "company",
  step: string,
  entityType: string,
): void {
  emitServerFunnelEvent(FUNNEL_EVENTS.firstRealAction, {
    source: "agency-bridge",
    route: "/dashboard/company",
    metadata: {
      surface: "agency_bridge",
      step,
      role_context: roleContext,
      entity_type: entityType,
    },
  });
}

/**
 * Real two-subject bridge — server actions (issue #859). Thin wrappers around
 * the RPCs from migration 20260723180000, which IS APPLIED on production
 * (verified 2026-09-14: the three tables, the share SELECT policy and
 * `unshare_request_v1(uuid)` are all present). The old wording here —
 * "owner-gated RPCs … until the migration is applied" — described a state
 * that has passed. EVERY authorization rule lives server-side in the SECURITY
 * DEFINER RPCs (agency/client identity, connection-active, share-active,
 * roster ownership, own-request-only, own-JWT-email accept). The
 * `needs-migration` outcome remains for an environment where the objects are
 * absent.
 *
 * DELIVERY (2026-09-24). "No outbound action of any kind" used to be true of
 * this file — and that was the defect: `create_agency_client_connection_v1`
 * inserts a row keyed on the client's e-mail and nothing ever reached that
 * e-mail, so step 1 of the owner's own acceptance walk ended in a row nobody
 * could see. The invite action now ALSO creates an invitation through the
 * ONE invitation primitive (lib/invitations — `invite_company`, marked
 * `proposed_role = agency_client`, same address), which hands the agency the
 * token link to copy or share. The primitive's e-mail is the only outbound
 * step and it stays inert until INVITE_EMAIL_* exists: the result says
 * `created` (link ready, not e-mailed) unless a provider acknowledged a
 * send — never a fake "sent". Never a second invitation system, never a
 * second consent path: the connection is still accepted only through
 * `accept_agency_client_connection_v1`.
 */
export type BridgeActionState =
  | { status: "idle" }
  | {
      status: "ok";
      /** The invitation delivery beside a connection invite (invite / new
       *  link); absent on every other action. */
      invite?: BridgeInviteDelivery;
    }
  | { status: "needs-migration" }
  | { status: "invalid" }
  | { status: "forbidden" }
  | { status: "not-found" }
  | { status: "error"; reason?: string };

function mapErr(code: string | undefined, message: string | undefined): BridgeActionState {
  if (isMissingRpcCode(code) || code === "42P01" || code === "PGRST205") {
    return { status: "needs-migration" };
  }
  const m = (message ?? "").toLowerCase();
  if (m.includes("not_owner") || m.includes("not_agency") || m.includes("connection_not_active") || m.includes("share_not_active"))
    return { status: "forbidden" };
  if (m.includes("request_not_found") || m.includes("worker_not_on_roster")) return { status: "not-found" };
  if (m.includes("invalid") || m.includes("same_company")) return { status: "invalid" };
  return { status: "error", reason: code };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rpc(supabase: unknown): any {
  return supabase;
}

/** The invite link's language: an active locale from the form, else the
 *  default. Never trusted beyond the closed active set (the clamp itself
 *  lives with the locale set, so the conversation opener and the invite
 *  page share it instead of each re-deriving it). */
function inviteLocale(formData: FormData): string {
  return toActiveLocale(String(formData.get("locale") ?? ""));
}

/**
 * The delivery half of a client invite: ONE `invite_company` invitation
 * through the primitive, addressed to the same e-mail, expiring with the
 * connection (14 days). Idempotent per address: the primitive answers
 * `duplicate_pending` while an earlier one is open, and a fresh link then
 * comes from the rotate path (`refreshClientInviteLinkAction`), never from a
 * second row. A throwing primitive is `unavailable` — the connection
 * exists, delivery is UNKNOWN, and the section says so.
 */
async function deliverClientInvitation(
  email: string,
  locale: string,
): Promise<BridgeInviteDelivery> {
  try {
    const result = await createShareableInvitationAction({
      invitationType: "invite_company",
      locale,
      recipientLocale: locale,
      email,
      proposedRole: AGENCY_CLIENT_PROPOSED_ROLE,
      maxUses: 1,
      expiresInDays: 14,
    });
    return toBridgeInviteDelivery(email, result);
  } catch {
    return toBridgeInviteDelivery(email, null);
  }
}

/** AGENCY: invite a client company by email — the connection row PLUS the
 *  invitation that delivers it. */
export async function inviteClientAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const agencyCompanyId = String(formData.get("agencyCompanyId") ?? "");
  const email = validateInviteEmail(String(formData.get("email") ?? ""));
  if (!isBridgeUuid(agencyCompanyId) || !email.ok) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("create_agency_client_connection_v1", {
    p_agency_company_id: agencyCompanyId,
    p_invited_email: email.value,
  });
  if (error) return mapErr(error.code, error.message);
  emitFirstRealAction("agency", "invite_client", "agency_client_connection");
  // The connection is recorded; now it must REACH the person. Awaited: a
  // serverless runtime may freeze the instant the action returns.
  const invite = await deliverClientInvitation(email.value, inviteLocale(formData));
  revalidatePath("/[locale]/dashboard/company", "page");
  revalidatePath("/[locale]/dashboard/company/partners", "page");
  return { status: "ok", invite };
}

/**
 * AGENCY: a fresh link for an invitation that already exists — the
 * primitive's own rotate path (`resend_invitation_v1`: the previous link
 * stops working, the inviter gets the new one, an addressee is e-mailed
 * only when a provider is configured). The invitation id comes from the
 * agency's own sent list; the RPC re-checks that the caller is its inviter.
 */
export async function refreshClientInviteLinkAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const invitationId = String(formData.get("invitationId") ?? "");
  const email = validateInviteEmail(String(formData.get("email") ?? ""));
  if (!isBridgeUuid(invitationId) || !email.ok) return { status: "invalid" };
  const locale = inviteLocale(formData);
  let invite: BridgeInviteDelivery;
  try {
    const result = await resendInvitationAction({
      invitationId,
      email: email.value,
      locale,
      recipientLocale: locale,
      invitationType: "invite_company",
    });
    if (result.status === "not-authed") return { status: "forbidden" };
    invite = toBridgeInviteDelivery(email.value, result);
  } catch {
    invite = toBridgeInviteDelivery(email.value, null);
  }
  revalidatePath("/[locale]/dashboard/company/partners", "page");
  return { status: "ok", invite };
}

/** CLIENT: accept a connection invite as one of the caller's own companies. */
export async function acceptConnectionAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const connectionId = String(formData.get("connectionId") ?? "");
  const clientCompanyId = String(formData.get("clientCompanyId") ?? "");
  if (!isBridgeUuid(connectionId) || !isBridgeUuid(clientCompanyId)) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await rpc(supabase).rpc("accept_agency_client_connection_v1", {
    p_connection_id: connectionId,
    p_client_company_id: clientCompanyId,
  });
  if (error) return mapErr(error.code, error.message);
  if (data === "not_found") return { status: "not-found" };
  if (data === "accepted" || data === "already_active") {
    if (data === "accepted") {
      emitFirstRealAction("company", "accept_connection", "agency_client_connection");
    }
    revalidatePath("/[locale]/dashboard/company", "page");
    return { status: "ok" };
  }
  return { status: "error", reason: String(data) };
}

/** CLIENT: decline a connection invite. */
export async function declineConnectionAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!isBridgeUuid(connectionId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("decline_agency_client_connection_v1", {
    p_connection_id: connectionId,
  });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}

/** EITHER SIDE: revoke a connection (soft; blocks new shares/offers). */
export async function revokeConnectionAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const connectionId = String(formData.get("connectionId") ?? "");
  if (!isBridgeUuid(connectionId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("revoke_agency_client_connection_v1", {
    p_connection_id: connectionId,
  });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}

/** CLIENT: share one of the caller's own requests with a connected agency. */
export async function shareRequestAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const connectionId = String(formData.get("connectionId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!isBridgeUuid(connectionId) || !isBridgeUuid(requestId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("share_request_with_agency_v1", {
    p_connection_id: connectionId,
    p_request_id: requestId,
  });
  if (error) return mapErr(error.code, error.message);
  emitFirstRealAction("company", "share_request", "agency_client_request_share");
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}

/** CLIENT: stop sharing a request (blocks new offers; keeps audit). */
export async function unshareRequestAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const shareId = String(formData.get("shareId") ?? "");
  if (!isBridgeUuid(shareId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("unshare_request_v1", { p_share_id: shareId });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}

/** AGENCY: offer an active roster worker for a shared request. */
export async function submitOfferAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const shareId = String(formData.get("shareId") ?? "");
  const workerId = String(formData.get("workerId") ?? "");
  const note = validateOfferNote(String(formData.get("note") ?? ""));
  if (!isBridgeUuid(shareId) || !isBridgeUuid(workerId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("submit_agency_candidate_offer_v1", {
    p_request_share_id: shareId,
    p_worker_id: workerId,
    p_note: note,
  });
  if (error) return mapErr(error.code, error.message);
  emitFirstRealAction("agency", "offer_candidate", "agency_candidate_offer");
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}

/** CLIENT: accept (→ canonical booking proposed to the worker) or decline an
 *  agency's candidate offer. Migration 20260903101000; until applied the
 *  action reports `needs-migration` and the surface says so. */
export async function respondCandidateOfferAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const offerId = String(formData.get("offerId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = validateOfferNote(String(formData.get("note") ?? ""));
  if (!isBridgeUuid(offerId)) return { status: "invalid" };
  if (decision !== "accepted" && decision !== "declined") return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("respond_agency_candidate_offer_v1", {
    p_offer_id: offerId,
    p_decision: decision,
    p_note: note,
  });
  if (error) {
    const m = (error.message ?? "").toLowerCase();
    if (m.includes("offer_not_open") || m.includes("offer_not_found")) return { status: "not-found" };
    return mapErr(error.code, error.message);
  }
  emitFirstRealAction("company", "offer_" + decision, "agency_candidate_offer");
  revalidatePath("/[locale]/dashboard/company/scouting", "page");
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}

/** AGENCY: withdraw an offer. */
export async function withdrawOfferAction(
  _prev: BridgeActionState,
  formData: FormData,
): Promise<BridgeActionState> {
  const offerId = String(formData.get("offerId") ?? "");
  if (!isBridgeUuid(offerId)) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await rpc(supabase).rpc("withdraw_agency_candidate_offer_v1", {
    p_offer_id: offerId,
  });
  if (error) return mapErr(error.code, error.message);
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
}
