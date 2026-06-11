"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

/**
 * Server actions for "Mano darbo kortelė" (slice work-card-state-aware-v1).
 *
 * All writes go through the SECURITY DEFINER RPCs from migration
 * 20260608120000 (save_worker_card / confirm_worker_card), which update ONLY
 * the whitelisted card fields WHERE profile_id = auth.uid(). The system fields
 * (trust_score, profile_completeness) are never touched — no fake score.
 *
 * Tagged returns (never throw across the server-action boundary, so Next.js
 * prod doesn't strip the message): { ok: true } | { ok:false, code, message? }.
 * `needs_migration` is surfaced cleanly when the RPC isn't applied yet.
 */

const RPC_NOT_FOUND_CODE = "42883";
const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

export type WorkCardActionResult =
  | { ok: true }
  | { ok: false; code: "needs_migration" | "invalid" | "auth" | "error"; message?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function isMigrationMissing(code?: string): boolean {
  return (
    code === RPC_NOT_FOUND_CODE ||
    code === UNDEFINED_COLUMN_CODE ||
    code === RELATION_NOT_FOUND_CODE
  );
}

function parseIntOrNull(raw: FormDataEntryValue | null): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parseCountries(raw: FormDataEntryValue | null): string[] | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const codes = s
    .split(/[,\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 12);
  return codes.length > 0 ? codes : null;
}

/**
 * Save one or more card fields. Only non-empty inputs are sent; the RPC keeps
 * existing values for omitted fields (partial saves are fine — we never wipe a
 * dimension the user did not touch). Stamps the confirmation time.
 */
export async function saveWorkerCardAction(
  _prev: WorkCardActionResult | null,
  formData: FormData,
): Promise<WorkCardActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const availabilityRaw = String(formData.get("availability_status") ?? "").trim();
  const availability =
    availabilityRaw === "" ? null : availabilityRaw;
  if (
    availability !== null &&
    !["available", "busy", "unavailable"].includes(availability)
  ) {
    return { ok: false, code: "invalid", message: "availability" };
  }

  const availableFromRaw = String(formData.get("available_from") ?? "").trim();
  const availableFrom = availableFromRaw === "" ? null : availableFromRaw;

  const salaryMin = parseIntOrNull(formData.get("salary_min"));
  const salaryMax = parseIntOrNull(formData.get("salary_max"));
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    return { ok: false, code: "invalid", message: "salary_range" };
  }

  const locationRaw = String(formData.get("location_country") ?? "").trim();
  const locationCountry =
    locationRaw === "" ? null : locationRaw.toUpperCase().slice(0, 2);
  const preferredCountries = parseCountries(formData.get("preferred_countries"));

  const { error } = await asAny(supabase).rpc("save_worker_card", {
    p_availability_status: availability,
    p_available_from: availableFrom,
    p_location_country: locationCountry,
    p_preferred_countries: preferredCountries,
    p_salary_min: salaryMin,
    p_salary_max: salaryMax,
  });

  if (error) {
    if (isMigrationMissing(error.code)) return { ok: false, code: "needs_migration" };
    console.error("[work-card] save failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * "Taip, galioja" — the owner confirms the card still holds. Refreshes the
 * confirmation time only; changes no field; restarts nothing.
 */
export async function confirmWorkerCardAction(): Promise<WorkCardActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "auth" };

  const { error } = await asAny(supabase).rpc("confirm_worker_card");
  if (error) {
    if (isMigrationMissing(error.code)) return { ok: false, code: "needs_migration" };
    console.error("[work-card] confirm failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
