"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  clampNote,
  classifyPrefsError,
  parseContractType,
  parseLicenceCategories,
  parseMaxTripDays,
  parsePayBasis,
  triStateToBoolean,
} from "./availability-prefs-model";

/**
 * Server action for the worker's structured work preferences. The ONLY write
 * paths are the owner-scoped SECURITY DEFINER RPCs:
 *   * `save_worker_availability_prefs` (applied migration 20260613100000) —
 *     the 8 v1 fields;
 *   * `save_worker_availability_prefs_v2` (DRAFT migration 20260711270000,
 *     PR #721 — human-gated, NOT applied yet) — the same 8 + the 7 v2 fields.
 * Both validate again server-side and update only the caller's own workers row.
 *
 * v2 fallback honesty: when the form was rendered with the v2 section enabled
 * we try the v2 RPC first. If the DB answers "that function does not exist"
 * (42883 / PGRST202 / 42703 — the draft migration is not applied), we fall
 * back to the v1 RPC so the worker's 8 v1 fields still save, and report
 * `ok: true, v2Saved: false` so the UI can say honestly that the extra fields
 * were NOT saved. We never pretend the v2 fields persisted.
 *
 * Tagged returns (never throw across the server-action boundary — Next.js
 * prod strips thrown Error messages): { ok: true } | { ok: false, code }.
 * Same convention as lib/worker/work-card-actions.ts.
 *
 * Tri-state honesty: every boolean pref arrives as "not_stated" | "yes" |
 * "no"; only an explicit yes/no becomes a boolean — "not_stated" stays null,
 * never a fabricated false.
 */

export type AvailabilityPrefsActionResult =
  | {
      ok: true;
      /** false = the v1 fields saved but the v2 fields did NOT (draft RPC
       *  absent — fell back to v1). Omitted when no v2 attempt was made;
       *  true when the v2 RPC persisted everything. */
      v2Saved?: boolean;
    }
  | {
      ok: false;
      code:
        | "needs_migration"
        | "unauthenticated"
        | "no_worker"
        | "invalid"
        | "error";
      message?: string;
    };

// The RPC is not in the generated Database type until `pnpm db:types` runs
// post-apply — cast at the boundary (same pattern as work-card-actions.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

export async function saveWorkerAvailabilityPrefsAction(
  _prev: AvailabilityPrefsActionResult | null,
  formData: FormData,
): Promise<AvailabilityPrefsActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, code: "unauthenticated" };

  const tri = (name: string): boolean | null =>
    triStateToBoolean(String(formData.get(name) ?? ""));

  const maxTripDays = parseMaxTripDays(String(formData.get("max_trip_days") ?? ""));
  if (!maxTripDays.ok) {
    return { ok: false, code: "invalid", message: "max_trip_days" };
  }

  const v1Args = {
    p_willing_to_relocate: tri("willing_to_relocate"),
    p_needs_accommodation: tri("needs_accommodation"),
    p_has_transport: tri("has_transport"),
    p_max_trip_days: maxTripDays.value,
    p_preferred_contract_type: parseContractType(
      String(formData.get("preferred_contract_type") ?? ""),
    ),
    p_team_available: tri("team_available"),
    p_solo_available: tri("solo_available"),
    p_availability_note: clampNote(String(formData.get("availability_note") ?? "")),
  };

  // The form only submits v2 fields when the read path saw the v2 columns —
  // a hidden input carries that server-derived flag (never user-invented
  // capability: an absent RPC still degrades honestly below).
  const v2Attempted = String(formData.get("prefs_v2_enabled") ?? "") === "true";

  if (v2Attempted) {
    const v2Args = {
      ...v1Args,
      p_pay_basis_preference: parsePayBasis(
        String(formData.get("pay_basis_preference") ?? ""),
      ),
      p_night_shifts_ok: tri("night_shifts_ok"),
      p_weekend_shifts_ok: tri("weekend_shifts_ok"),
      p_overtime_ok: tri("overtime_ok"),
      p_driving_licence_categories: parseLicenceCategories(
        formData.getAll("driving_licence_categories").map(String),
      ),
      p_own_vehicle: tri("own_vehicle"),
      p_own_tools: tri("own_tools"),
    };

    const v2 = await asAny(supabase).rpc("save_worker_availability_prefs_v2", v2Args);

    if (!v2.error) {
      revalidatePath("/", "layout");
      return { ok: true, v2Saved: true };
    }

    const v2Code = classifyPrefsError(v2.error.code);
    if (v2Code !== "needs_migration") {
      if (v2.error.code === "22023") return { ok: false, code: "invalid" };
      if (v2Code === "error") {
        console.error(
          "[availability-prefs] v2 save failed:",
          v2.error.code,
          v2.error.message,
        );
      }
      return { ok: false, code: v2Code };
    }
    // Draft v2 RPC absent → fall through to the applied v1 RPC so the 8 v1
    // fields still save; the result says honestly that v2 did NOT persist.
  }

  const { error } = await asAny(supabase).rpc("save_worker_availability_prefs", v1Args);

  if (error) {
    const code = classifyPrefsError(error.code);
    if (code === "error") {
      // 22023 is the RPC's own out-of-range/vocabulary rejection — an input
      // problem, not a system failure.
      if (error.code === "22023") return { ok: false, code: "invalid" };
      console.error("[availability-prefs] save failed:", error.code, error.message);
    }
    return { ok: false, code };
  }

  revalidatePath("/", "layout");
  return v2Attempted ? { ok: true, v2Saved: false } : { ok: true };
}
