"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  isMissingRpcCode,
  isOfferUuid,
  validateOfferInput,
} from "@/lib/agency/candidate-offers-model";

/**
 * Agency candidate-offer write actions (agency→client bridge v1) — thin
 * wrappers around the owner-gated RPCs from draft migration
 * 20260723170000_agency_candidate_offers_v1. EVERY authorization rule lives
 * server-side inside the RPCs (agency = the caller's own staffing_agency
 * company; worker = an ACTIVE roster member; need = the caller's own demand).
 * Until the migration is applied the RPCs are missing and each action reports
 * `needs-migration` honestly.
 *
 * No outbound action of any kind: an offer is a private candidate-proposal
 * record — nothing is sent to the worker, the client, or anyone else. Booking
 * stays the separate, existing propose_booking_request path.
 */

export type AgencyOfferActionState =
  | { status: "idle" }
  | { status: "offered" }
  | { status: "withdrawn" }
  | { status: "needs-migration" }
  | { status: "not-agency" }
  | { status: "not-roster" }
  | { status: "not-found" }
  | { status: "invalid" }
  | { status: "error" };

/** Map a Postgres errcode / message from the RPC to an honest action state. */
function offerErrorState(
  code: string | undefined,
  message: string | undefined,
): AgencyOfferActionState {
  if (isMissingRpcCode(code)) return { status: "needs-migration" };
  const m = (message ?? "").toLowerCase();
  if (m.includes("not_agency")) return { status: "not-agency" };
  if (m.includes("worker_not_on_roster")) return { status: "not-roster" };
  if (m.includes("request_not_found")) return { status: "not-found" };
  if (m.includes("invalid_note")) return { status: "invalid" };
  return { status: "error" };
}

export async function submitAgencyOfferAction(
  _prev: AgencyOfferActionState,
  formData: FormData,
): Promise<AgencyOfferActionState> {
  const validated = validateOfferInput({
    requestId: String(formData.get("requestId") ?? ""),
    workerId: String(formData.get("workerId") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!validated.ok) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "submit_agency_candidate_offer_v1",
    {
      p_request_id: validated.value.requestId,
      p_worker_id: validated.value.workerId,
      p_note: validated.value.note,
    },
  );
  if (error) {
    const state = offerErrorState(error.code, error.message);
    if (state.status === "error") {
      console.error("[agency-offers] submit failed:", error.code);
    }
    return state;
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "offered" };
}

export async function withdrawAgencyOfferAction(
  _prev: AgencyOfferActionState,
  formData: FormData,
): Promise<AgencyOfferActionState> {
  const id = String(formData.get("id") ?? "");
  if (!isOfferUuid(id)) return { status: "invalid" };

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc(
    "withdraw_agency_candidate_offer_v1",
    { p_offer_id: id },
  );
  if (error) {
    const state = offerErrorState(error.code, error.message);
    if (state.status === "error") {
      console.error("[agency-offers] withdraw failed:", error.code);
    }
    return state;
  }
  revalidatePath("/[locale]/dashboard/company", "page");
  return { status: "withdrawn" };
}
