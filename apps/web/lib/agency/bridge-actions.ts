"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  isBridgeUuid,
  isMissingRpcCode,
  validateInviteEmail,
  validateOfferNote,
} from "@/lib/agency/bridge-model";

/**
 * Real two-subject bridge — server actions (issue #859). Thin wrappers around
 * the owner-gated RPCs from migration 20260723180000. EVERY authorization rule
 * lives server-side in the SECURITY DEFINER RPCs (agency/client identity,
 * connection-active, share-active, roster ownership, own-request-only,
 * own-JWT-email accept). Until the migration is applied each action reports
 * `needs-migration`. No outbound action of any kind.
 */
export type BridgeActionState =
  | { status: "idle" }
  | { status: "ok" }
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

/** AGENCY: invite a client company by email. */
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
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "ok" };
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
