"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { WorkCardValues } from "@/lib/worker/work-card";
import { saveWorkerCardCore } from "@/lib/worker/work-card-core";

/**
 * Server actions for "Mano darbo kortelė" (slice work-card-state-aware-v1).
 *
 * All writes go through the SECURITY DEFINER RPCs from migration
 * 20260608120000 (save_worker_card / confirm_worker_card), which update ONLY
 * the whitelisted card fields WHERE profile_id = auth.uid(). The system fields
 * (trust_score, profile_completeness) are never touched — no fake score.
 *
 * G4 tail wagon 2: the save itself lives in `work-card-core.ts` as an
 * explicit-caller domain core; this action is the cookie-transport wrapper
 * (FormData parsing + auth + revalidate), same split as express-interest.
 *
 * Tagged returns (never throw across the server-action boundary, so Next.js
 * prod doesn't strip the message): { ok: true } | { ok:false, code, message? }.
 * `needs_migration` is surfaced cleanly when the RPC isn't applied yet.
 */

const RPC_NOT_FOUND_CODE = "42883";
const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

export type WorkCardActionResult =
  | {
      ok: true;
      /** The card AS STORED after the write — read back from `workers`, so the
       *  editor shows what persisted, never what was typed. Absent when the
       *  read-back itself failed (the write did succeed). */
      saved?: WorkCardValues;
    }
  | { ok: false; code: "needs_migration" | "invalid" | "auth" | "error"; message?: string };

/**
 * THE READ-BACK (production walk 2026-09-29). The chat's work card said
 * "Išsaugota" and then showed the OLD salary: the save had persisted, but the
 * panel's props were read before it, and the form reset to them. The saved
 * row is read here, under the owner's own RLS, and returned with the result.
 */
async function readBackCard(
  supabase: SupabaseClient,
  userId: string,
): Promise<WorkCardValues | undefined> {
  try {
    const { data, error } = await asAny(supabase)
      .from("workers")
      .select(
        "availability_status, available_from, current_location_country, preferred_countries, salary_min_eur, salary_max_eur",
      )
      .eq("profile_id", userId)
      .maybeSingle();
    if (error || !data) return undefined;
    return {
      availabilityStatus: data.availability_status ?? null,
      availableFrom: data.available_from ?? null,
      locationCountry: data.current_location_country ?? null,
      preferredCountries: Array.isArray(data.preferred_countries) ? data.preferred_countries : [],
      salaryMin: data.salary_min_eur ?? null,
      salaryMax: data.salary_max_eur ?? null,
    };
  } catch {
    return undefined;
  }
}

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

/** Split on commas / semicolons / newlines ONLY — "Saudi Arabia" is one country, not two
 *  tokens. Resolution to ISO happens in the core (`normalizeCountryList`). */
function parseCountries(raw: FormDataEntryValue | null): string[] | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const codes = s.split(/[,;\n]+/).map((c) => c.trim()).filter((c) => c !== "");
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
  const availableFromRaw = String(formData.get("available_from") ?? "").trim();
  const locationRaw = String(formData.get("location_country") ?? "").trim();

  const result = await saveWorkerCardCore(
    { supabase, userId: user.id },
    {
      availabilityStatus: availabilityRaw === "" ? null : availabilityRaw,
      availableFrom: availableFromRaw === "" ? null : availableFromRaw,
      salaryMin: parseIntOrNull(formData.get("salary_min")),
      salaryMax: parseIntOrNull(formData.get("salary_max")),
      locationCountry: locationRaw === "" ? null : locationRaw,
      // A blank list is "keep" (the RPC coalesces null). The explicit clear
      // is a separate flag (W6): the chat executor sets it only for an
      // explicit empty list, so no blank form field can empty the list.
      preferredCountries:
        String(formData.get("preferred_countries_clear") ?? "") === "1"
          ? []
          : parseCountries(formData.get("preferred_countries")),
    },
  );
  if (!result.ok) return result;

  const saved = await readBackCard(supabase, user.id);
  revalidatePath("/", "layout");
  return saved ? { ok: true, saved } : { ok: true };
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
