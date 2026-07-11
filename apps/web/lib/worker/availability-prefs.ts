import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  EMPTY_PREFS,
  parseContractType,
  type WorkerAvailabilityPrefs,
} from "./availability-prefs-model";

/**
 * Read service for the worker's structured work preferences — the 8
 * availability-pref columns applied by migration 20260613100000
 * (willing_to_relocate … availability_note). Owner-scoped: reads ONLY the
 * caller's own workers row (profile_id = auth.uid() under existing RLS).
 *
 * Graceful degradation: if the columns are ever absent in the target DB
 * (fresh local stack without the migration), Postgres answers 42703 — we
 * surface `kind: "needs-migration"` so the page shows an honest notice
 * instead of crashing SSR.
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

export type AvailabilityPrefsRead =
  | { kind: "ok"; values: WorkerAvailabilityPrefs }
  | { kind: "needs-migration" }
  | { kind: "no-worker" };

/** Load the signed-in worker's own saved preferences (null = not stated). */
export async function getOwnAvailabilityPrefs(): Promise<AvailabilityPrefsRead> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

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
    // Unknown read failure: render the form empty rather than crash the page —
    // saving still goes through the RPC, which reports its own honest state.
    return { kind: "ok", values: EMPTY_PREFS };
  }
  if (!data) return { kind: "no-worker" };

  const row = data as PrefsRow;
  return {
    kind: "ok",
    values: {
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
    },
  };
}
