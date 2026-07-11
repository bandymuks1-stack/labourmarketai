import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_PREFS,
  parseContractType,
  parseLicenceCategories,
  parsePayBasis,
  type WorkerAvailabilityPrefs,
  type WorkerAvailabilityPrefsV2,
} from "./availability-prefs-model";

/**
 * Read service for the worker's structured work preferences — the 8
 * availability-pref columns applied by migration 20260613100000
 * (willing_to_relocate … availability_note), plus the 7 DRAFT v2 columns
 * from migration 20260711270000 (PR #721 — human-gated, NOT applied yet).
 * Owner-scoped: reads ONLY the caller's own workers row (profile_id =
 * auth.uid() under existing RLS).
 *
 * Graceful degradation (two-step): first try v1+v2 columns together; if the
 * DB answers 42703 (a selected column does not exist — the v2 pack is not
 * applied), retry with the v1 columns only and mark the v2 section
 * "not-enabled". If even the v1 read fails with 42703/42P01 we surface
 * `kind: "needs-migration"` so the page shows an honest notice instead of
 * crashing SSR. The v2 section NEVER renders a fake empty value set when its
 * columns are absent.
 */

const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// The pref columns are not in the generated Database type until
// `pnpm db:types` runs post-apply — cast at the boundary, same pattern as
// lib/worker/work-card.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

const PREF_COLS =
  "willing_to_relocate, needs_accommodation, has_transport, max_trip_days, preferred_contract_type, team_available, solo_available, availability_note";

/** The 7 DRAFT v2 columns (PR #721) — absent until the owner applies the
 *  human-gated migration; selecting them then answers 42703. */
const PREF_COLS_V2 =
  "pay_basis_preference, night_shifts_ok, weekend_shifts_ok, overtime_ok, driving_licence_categories, own_vehicle, own_tools";

type PrefsRow = {
  willing_to_relocate: boolean | null;
  needs_accommodation: boolean | null;
  has_transport: boolean | null;
  max_trip_days: number | null;
  preferred_contract_type: string | null;
  team_available: boolean | null;
  solo_available: boolean | null;
  availability_note: string | null;
};

type PrefsRowV2 = PrefsRow & {
  pay_basis_preference: string | null;
  night_shifts_ok: boolean | null;
  weekend_shifts_ok: boolean | null;
  overtime_ok: boolean | null;
  driving_licence_categories: string[] | null;
  own_vehicle: boolean | null;
  own_tools: boolean | null;
};

export type AvailabilityPrefsV2Read =
  | { kind: "ok"; values: WorkerAvailabilityPrefsV2 }
  /** The v2 columns are not applied — the section renders its honest
   *  not-enabled explanation, never a fake empty form. */
  | { kind: "not-enabled" };

export type AvailabilityPrefsRead =
  | { kind: "ok"; values: WorkerAvailabilityPrefs; v2: AvailabilityPrefsV2Read }
  | { kind: "needs-migration" }
  | { kind: "no-worker" };

function mapV1(row: PrefsRow): WorkerAvailabilityPrefs {
  return {
    willingToRelocate: row.willing_to_relocate ?? null,
    needsAccommodation: row.needs_accommodation ?? null,
    hasTransport: row.has_transport ?? null,
    maxTripDays: row.max_trip_days ?? null,
    // Validate against the closed vocabulary — a drifted DB value renders
    // as "not stated" rather than an unknown option.
    preferredContractType: parseContractType(row.preferred_contract_type),
    teamAvailable: row.team_available ?? null,
    soloAvailable: row.solo_available ?? null,
    availabilityNote: row.availability_note ?? null,
  };
}

function mapV2(row: PrefsRowV2): WorkerAvailabilityPrefsV2 {
  return {
    payBasisPreference: parsePayBasis(row.pay_basis_preference),
    nightShiftsOk: row.night_shifts_ok ?? null,
    weekendShiftsOk: row.weekend_shifts_ok ?? null,
    overtimeOk: row.overtime_ok ?? null,
    drivingLicenceCategories: parseLicenceCategories(row.driving_licence_categories),
    ownVehicle: row.own_vehicle ?? null,
    ownTools: row.own_tools ?? null,
  };
}

/** Load the signed-in worker's own saved preferences (null = not stated). */
export async function getOwnAvailabilityPrefs(): Promise<AvailabilityPrefsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  // Step 1 — optimistic read of v1 + v2 columns together. Succeeds only once
  // the owner has applied draft migration 20260711270000 (PR #721).
  const full = await asAny(supabase)
    .from("workers")
    .select(`${PREF_COLS}, ${PREF_COLS_V2}`)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!full.error) {
    if (!full.data) return { kind: "no-worker" };
    const row = full.data as PrefsRowV2;
    return {
      kind: "ok",
      values: mapV1(row),
      v2: { kind: "ok", values: mapV2(row) },
    };
  }

  if (full.error.code !== UNDEFINED_COLUMN_CODE) {
    if (full.error.code === RELATION_NOT_FOUND_CODE) {
      return { kind: "needs-migration" };
    }
    console.error(
      "[availability-prefs] read failed:",
      full.error.code,
      full.error.message,
    );
    // Unknown read failure: render the form empty rather than crash the page —
    // saving still goes through the RPC, which reports its own honest state.
    return { kind: "ok", values: EMPTY_PREFS, v2: { kind: "not-enabled" } };
  }

  // Step 2 — 42703: at least one selected column does not exist. The v2 pack
  // is the draft one, so retry with the applied v1 columns only.
  const { data, error } = await asAny(supabase)
    .from("workers")
    .select(PREF_COLS)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (error) {
    if (
      error.code === UNDEFINED_COLUMN_CODE ||
      error.code === RELATION_NOT_FOUND_CODE
    ) {
      return { kind: "needs-migration" };
    }
    console.error("[availability-prefs] read failed:", error.code, error.message);
    return { kind: "ok", values: EMPTY_PREFS, v2: { kind: "not-enabled" } };
  }
  if (!data) return { kind: "no-worker" };

  return {
    kind: "ok",
    values: mapV1(data as PrefsRow),
    v2: { kind: "not-enabled" },
  };
}
