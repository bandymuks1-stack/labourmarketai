"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { parseSharePercent, partnershipErrorCode, type PartnershipErrorCode } from "./partnerships-model";

/**
 * AGENCY-TO-AGENCY COOPERATION — the agency's actions (register 4.30,
 * migration 20261118100000, RED, owner-gated). Each one is ONE database
 * function; every rule (who may act, which need, which worker, which share)
 * is checked there and its refusal is passed back as a code.
 */
export type PartnershipActionState =
  | { readonly status: "idle" }
  | { readonly status: "ok" }
  | { readonly status: "error"; readonly code: PartnershipErrorCode };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: unknown): any => supabase;
const field = (form: FormData, name: string): string => String(form.get(name) ?? "").trim();

async function call(fn: string, args: Record<string, unknown>): Promise<PartnershipActionState> {
  const supabase = await createClient();
  const { error } = await db(supabase).rpc(fn, args);
  if (error) return { status: "error", code: partnershipErrorCode(error) };
  revalidatePath("/[locale]/dashboard/company/partners", "page");
  return { status: "ok" };
}

export async function invitePartnerAgencyAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const companyId = field(form, "company_id");
  const email = field(form, "email").toLowerCase();
  const share = parseSharePercent(field(form, "share_percent"));
  if (!UUID.test(companyId)) return { status: "error", code: "error" };
  if (!EMAIL.test(email) || email.length > 254) return { status: "error", code: "invalid_email" };
  if (share === null) return { status: "error", code: "invalid_share" };
  return call("invite_agency_partner_v1", {
    p_lead_company_id: companyId,
    p_invited_email: email,
    p_partner_share_percent: share,
  });
}

export async function acceptPartnershipAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const id = field(form, "partnership_id");
  const companyId = field(form, "company_id");
  if (!UUID.test(id) || !UUID.test(companyId)) return { status: "error", code: "error" };
  return call("accept_agency_partnership_v1", { p_partnership_id: id, p_partner_company_id: companyId });
}

export async function declinePartnershipAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const id = field(form, "partnership_id");
  if (!UUID.test(id)) return { status: "error", code: "error" };
  return call("decline_agency_partnership_v1", { p_partnership_id: id });
}

export async function endPartnershipAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const id = field(form, "partnership_id");
  if (!UUID.test(id)) return { status: "error", code: "error" };
  return call("end_agency_partnership_v1", { p_partnership_id: id });
}

export async function passNeedToPartnerAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const id = field(form, "partnership_id");
  const shareId = field(form, "client_share_id");
  if (!UUID.test(id) || !UUID.test(shareId)) return { status: "error", code: "share_not_active" };
  return call("share_request_with_partner_v1", { p_partnership_id: id, p_client_share_id: shareId });
}

export async function takeBackNeedAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const id = field(form, "partner_share_id");
  if (!UUID.test(id)) return { status: "error", code: "error" };
  return call("unshare_request_with_partner_v1", { p_partner_share_id: id });
}

export async function offerPartnerCandidateAction(
  _prev: PartnershipActionState,
  form: FormData,
): Promise<PartnershipActionState> {
  const id = field(form, "partner_share_id");
  const workerId = field(form, "worker_id");
  if (!UUID.test(id)) return { status: "error", code: "share_not_active" };
  if (!UUID.test(workerId)) return { status: "error", code: "worker_not_on_roster" };
  return call("submit_partner_candidate_offer_v1", { p_partner_share_id: id, p_worker_id: workerId, p_note: null });
}
