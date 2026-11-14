"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * The worker's own choice to join an agency the product suggested
 * (join_suggested_agency_v1). It puts them on the agency's EXISTING roster —
 * the same row an accepted roster invitation creates — so the profile's
 * "who represents me" list and its withdrawal apply unchanged. No work
 * relationship is created.
 */
export type JoinSuggestedAgencyState =
  | { readonly status: "idle" }
  | { readonly status: "ok" }
  | {
      readonly status: "error";
      readonly code:
        | "auth"
        | "no_worker_profile"
        | "not_available"
        | "consent_text_changed"
        | "already_known"
        | "represented_elsewhere"
        | "consent_required"
        | "needs_migration"
        | "error";
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN = [
  "auth",
  "no_worker_profile",
  "not_available",
  "consent_text_changed",
  "already_known",
  "represented_elsewhere",
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = (supabase: unknown): any => supabase;

export async function joinSuggestedAgencyAction(
  _prev: JoinSuggestedAgencyState,
  form: FormData,
): Promise<JoinSuggestedAgencyState> {
  const companyId = String(form.get("company_id") ?? "").trim();
  const version = String(form.get("consent_text_version") ?? "").trim();
  // The box is never pre-ticked: the choice is only the person's own tick.
  if (form.get("consent") !== "yes") return { status: "error", code: "consent_required" };
  if (!UUID.test(companyId) || version.length === 0 || version.length > 40) {
    return { status: "error", code: "not_available" };
  }
  const supabase = await createClient();
  const { data, error } = await db(supabase).rpc("join_suggested_agency_v1", {
    p_company_id: companyId,
    p_consent_text_version: version,
  });
  if (error) {
    const missing = error.code === "PGRST202" || error.code === "42883";
    return { status: "error", code: missing ? "needs_migration" : "error" };
  }
  const outcome =
    typeof data === "object" && data !== null && "outcome" in data
      ? String((data as { outcome: unknown }).outcome)
      : "";
  if (outcome === "joined") {
    revalidatePath("/[locale]/dashboard", "page");
    revalidatePath("/[locale]/dashboard/profile", "page");
    return { status: "ok" };
  }
  return {
    status: "error",
    code: (KNOWN as readonly string[]).includes(outcome) ? (outcome as (typeof KNOWN)[number]) : "error",
  };
}
