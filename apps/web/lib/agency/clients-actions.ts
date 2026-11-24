"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingRpcCode,
  validateAgencyClientInput,
} from "@/lib/agency/clients-model";

/**
 * Agency client write actions (canonical journey P5) — thin wrappers around
 * the owner-gated RPCs from draft migration 20260713160000_agency_clients_v1.
 * All permission checks happen server-side inside the RPCs (agency = the
 * caller's own canonical companies row). Until the migration is applied the
 * RPCs are missing and each action reports `needs-migration` honestly.
 *
 * No outbound action of any kind: these write private CRM records and a
 * nullable link column on the caller's OWN demand rows — nothing is sent to
 * clients, workers, or anyone else.
 */

export type AgencyClientActionState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "removed" }
  | { status: "linked" }
  | { status: "needs-migration" }
  | { status: "invalid" }
  | { status: "error" };

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function saveAgencyClientAction(
  _prev: AgencyClientActionState,
  formData: FormData,
): Promise<AgencyClientActionState> {
  const validated = validateAgencyClientInput({
    name: String(formData.get("name") ?? ""),
    contactName: String(formData.get("contactName") ?? ""),
    contactEmail: String(formData.get("contactEmail") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!validated.ok) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("save_agency_client_v1", {
    p_name: validated.value.name,
    p_contact_name: validated.value.contactName,
    p_contact_email: validated.value.contactEmail,
    p_note: validated.value.note,
    p_client_id: null,
  });
  if (error) {
    if (isMissingRpcCode(error.code)) return { status: "needs-migration" };
    console.error("[agency-clients] save failed:", error.code);
    return { status: "error" };
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "saved" };
}

export async function removeAgencyClientAction(
  _prev: AgencyClientActionState,
  formData: FormData,
): Promise<AgencyClientActionState> {
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("remove_agency_client_v1", {
    p_id: id,
  });
  if (error) {
    if (isMissingRpcCode(error.code)) return { status: "needs-migration" };
    console.error("[agency-clients] remove failed:", error.code);
    return { status: "error" };
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "removed" };
}

export async function linkDemandToClientAction(
  _prev: AgencyClientActionState,
  formData: FormData,
): Promise<AgencyClientActionState> {
  const requestId = String(formData.get("requestId") ?? "");
  const clientIdRaw = String(formData.get("clientId") ?? "");
  if (!UUID_RE.test(requestId)) return { status: "invalid" };
  // Empty select value = clear the link (honest unlink, never a fake state).
  const clientId = clientIdRaw === "" ? null : clientIdRaw;
  if (clientId !== null && !UUID_RE.test(clientId)) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("set_demand_agency_client_v1", {
    p_request_id: requestId,
    p_client_id: clientId,
  });
  if (error) {
    if (isMissingRpcCode(error.code)) return { status: "needs-migration" };
    console.error("[agency-clients] link failed:", error.code);
    return { status: "error" };
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "linked" };
}
