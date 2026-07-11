"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  clampNote,
  classifyPrefsError,
  parseContractType,
  parseMaxTripDays,
  triStateToBoolean,
} from "./availability-prefs-model";

/**
 * Server action for the worker's structured work preferences. The ONLY write
 * path is the owner-scoped SECURITY DEFINER RPC
 * `save_worker_availability_prefs` (migration 20260613100000) — it validates
 * again server-side and updates only the caller's own workers row.
 *
 * Tagged returns (never throw across the server-action boundary — Next.js
 * prod strips thrown Error messages): { ok: true } | { ok: false, code }.
 * Same convention as lib/worker/work-card-actions.ts.
 *
 * Tri-state honesty: the 5 boolean prefs arrive as "not_stated" | "yes" |
 * "no"; only an explicit yes/no becomes a boolean — "not_stated" stays null,
 * never a fabricated false.
 */

export type AvailabilityPrefsActionResult =
  | { ok: true }
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

  const { error } = await asAny(supabase).rpc("save_worker_availability_prefs", {
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
  });

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
  return { ok: true };
}
