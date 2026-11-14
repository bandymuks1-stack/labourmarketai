"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { placementTermsMissing } from "@/lib/agency/placement-terms";

/**
 * The agency states, replaces or retires its placement term (migration
 * 20261114120000). Every rule is the database's: the caller owns the company
 * and the company acts as an agency; amount, currency, condition and link are
 * checked there. A new term never edits the old one — it retires it, so the
 * term an employer already accepted stays exactly what they accepted.
 */
export type PlacementTermActionState =
  | { readonly status: "idle" }
  | { readonly status: "ok"; readonly outcome: "set" | "retired" | "none" }
  | {
      readonly status: "error";
      readonly code: "auth" | "not_found" | "not_agency" | "invalid" | "needs_migration" | "error";
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: unknown): any => supabase;

function outcomeOf(data: unknown): string {
  return typeof data === "object" && data !== null && "outcome" in data
    ? String((data as { outcome: unknown }).outcome)
    : "";
}

export async function setPlacementTermAction(
  _prev: PlacementTermActionState,
  form: FormData,
): Promise<PlacementTermActionState> {
  const companyId = String(form.get("company_id") ?? "").trim();
  const amount = Number(String(form.get("fee_amount") ?? "").replace(",", ".").trim());
  const currency = String(form.get("currency") ?? "").trim().toUpperCase();
  const condition = String(form.get("condition_text") ?? "").trim();
  const language = String(form.get("condition_language") ?? "").trim();
  const termsUrl = String(form.get("terms_url") ?? "").trim();
  if (
    !UUID.test(companyId) ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount >= 1_000_000 ||
    !/^[A-Z]{3}$/.test(currency) ||
    condition.length === 0 ||
    condition.length > 1000 ||
    !LANG.test(language) ||
    (termsUrl.length > 0 && (!termsUrl.startsWith("https://") || termsUrl.length > 500))
  ) {
    return { status: "error", code: "invalid" };
  }

  const supabase = await createClient();
  const { data, error } = await db(supabase).rpc("set_agency_placement_term_v1", {
    p_company_id: companyId,
    p_fee_amount: amount,
    p_currency: currency,
    p_condition_text: condition,
    p_condition_language: language,
    p_terms_url: termsUrl.length > 0 ? termsUrl : null,
  });
  if (error) {
    return { status: "error", code: placementTermsMissing(error.code) ? "needs_migration" : "error" };
  }
  const outcome = outcomeOf(data);
  if (outcome === "set") {
    revalidatePath("/[locale]/dashboard/company/partners", "page");
    return { status: "ok", outcome: "set" };
  }
  if (outcome === "auth" || outcome === "not_found" || outcome === "not_agency" || outcome === "invalid") {
    return { status: "error", code: outcome };
  }
  return { status: "error", code: "error" };
}

export async function retirePlacementTermAction(
  _prev: PlacementTermActionState,
  form: FormData,
): Promise<PlacementTermActionState> {
  const companyId = String(form.get("company_id") ?? "").trim();
  if (!UUID.test(companyId)) return { status: "error", code: "invalid" };
  const supabase = await createClient();
  const { data, error } = await db(supabase).rpc("retire_agency_placement_term_v1", {
    p_company_id: companyId,
  });
  if (error) {
    return { status: "error", code: placementTermsMissing(error.code) ? "needs_migration" : "error" };
  }
  const outcome = outcomeOf(data);
  if (outcome === "retired" || outcome === "none") {
    revalidatePath("/[locale]/dashboard/company/partners", "page");
    return { status: "ok", outcome };
  }
  if (outcome === "auth" || outcome === "not_found") return { status: "error", code: outcome };
  return { status: "error", code: "error" };
}
