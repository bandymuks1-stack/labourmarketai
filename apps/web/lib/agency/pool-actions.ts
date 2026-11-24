"use server";

import "server-only";

import { revalidatePath } from "next/cache";

import { markAgencyCanOffer, type MarkCanOfferOutcome } from "./pool";

/**
 * S5 pool actions. "Galim pasiūlyti" is a PROPOSAL marker through the gated
 * draft RPC — never a match, never a status change (doctrine §7; the match
 * decision stays human at the workbench). Degrades to needs_gate until the
 * owner applies the S5 draft migration.
 */

export type CanOfferState = { outcome: MarkCanOfferOutcome } | null;

export async function markCanOfferAction(
  _prev: CanOfferState,
  formData: FormData,
): Promise<CanOfferState> {
  const requestId = String(formData.get("request_id") ?? "").trim();
  const locale = String(formData.get("locale") ?? "lt");
  const note = String(formData.get("note") ?? "").trim() || null;
  if (requestId === "") return { outcome: "error" };
  const outcome = await markAgencyCanOffer(requestId, note);
  if (outcome === "marked") {
    revalidatePath(`/${locale}/dashboard/company`);
  }
  return { outcome };
}
