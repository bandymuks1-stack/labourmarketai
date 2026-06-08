import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { WorkCardSignals } from "./work-card-state";

/**
 * Read service for "Mano darbo kortelė" (slice work-card-state-aware-v1).
 *
 * Reads the worker's REAL saved card fields (existing public.workers columns)
 * plus profession / skill / journal counts, and shapes them into the pure
 * engine's signals. No fake data, no score.
 *
 * Graceful degradation: if migration 20260608120000 is not applied yet, the
 * `work_card_confirmed_at` column is absent (Postgres 42703). We retry the read
 * without it and treat confirmedAtMs as null (so the card simply never shows the
 * "stale" prompt until the migration lands — everything else still works).
 */

const UNDEFINED_COLUMN_CODE = "42703";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/** Raw saved card values, for pre-filling the (secondary) editor. */
export interface WorkCardValues {
  availabilityStatus: string | null;
  availableFrom: string | null; // ISO date
  locationCountry: string | null;
  preferredCountries: string[];
  salaryMin: number | null;
  salaryMax: number | null;
}

export interface WorkCardData {
  signals: WorkCardSignals;
  values: WorkCardValues;
  name: string;
  professionName: string | null;
  /** True when the worker has no `workers` row yet (brand-new account). */
  noWorkerRow: boolean;
}

type WorkerCardRow = {
  availability_status: string | null;
  available_from: string | null;
  current_location_country: string | null;
  preferred_countries: string[] | null;
  salary_min_eur: number | null;
  salary_max_eur: number | null;
  work_card_confirmed_at?: string | null;
};

const FULL_COLS =
  "availability_status, available_from, current_location_country, preferred_countries, salary_min_eur, salary_max_eur, work_card_confirmed_at";
const BASE_COLS =
  "availability_status, available_from, current_location_country, preferred_countries, salary_min_eur, salary_max_eur";

/**
 * Load the worker's card. `professionName` is resolved by the caller (it needs
 * the i18n profession label), so this returns the primary profession presence
 * via `hasProfession` and leaves the label to the page. To keep it cohesive we
 * accept the already-resolved professionName + counts the dashboard already
 * reads, so we do not double-query.
 */
export async function getWorkerCard(input: {
  workerId: string | null;
  name: string;
  professionName: string | null;
  skillsCount: number;
  evidenceCount: number;
}): Promise<WorkCardData> {
  const { workerId, name, professionName, skillsCount, evidenceCount } = input;

  const emptyValues: WorkCardValues = {
    availabilityStatus: null,
    availableFrom: null,
    locationCountry: null,
    preferredCountries: [],
    salaryMin: null,
    salaryMax: null,
  };

  if (!workerId) {
    return {
      name,
      professionName,
      noWorkerRow: true,
      values: emptyValues,
      signals: {
        hasProfession: !!professionName,
        skillsCount,
        availabilitySet: false,
        locationSet: false,
        paySet: false,
        evidenceCount,
        confirmedAtMs: null,
      },
    };
  }

  const supabase = await createClient();

  // Read the card columns; degrade if the confirmed_at column isn't migrated.
  let row: WorkerCardRow | null = null;
  let confirmedAtSupported = true;
  {
    const full = await asAny(supabase)
      .from("workers")
      .select(FULL_COLS)
      .eq("id", workerId)
      .maybeSingle();
    if (full.error?.code === UNDEFINED_COLUMN_CODE) {
      confirmedAtSupported = false;
      const base = await asAny(supabase)
        .from("workers")
        .select(BASE_COLS)
        .eq("id", workerId)
        .maybeSingle();
      row = (base.data as WorkerCardRow | null) ?? null;
    } else {
      row = (full.data as WorkerCardRow | null) ?? null;
    }
  }

  const preferred = Array.isArray(row?.preferred_countries)
    ? (row!.preferred_countries as string[])
    : [];
  const availabilitySet =
    !!row?.availability_status || !!row?.available_from;
  const locationSet = !!row?.current_location_country || preferred.length > 0;
  const paySet = row?.salary_min_eur != null || row?.salary_max_eur != null;

  const confirmedRaw = confirmedAtSupported ? row?.work_card_confirmed_at : null;
  const confirmedAtMs = confirmedRaw ? Date.parse(confirmedRaw) : null;

  return {
    name,
    professionName,
    noWorkerRow: false,
    values: {
      availabilityStatus: row?.availability_status ?? null,
      availableFrom: row?.available_from ?? null,
      locationCountry: row?.current_location_country ?? null,
      preferredCountries: preferred,
      salaryMin: row?.salary_min_eur ?? null,
      salaryMax: row?.salary_max_eur ?? null,
    },
    signals: {
      hasProfession: !!professionName,
      skillsCount,
      availabilitySet,
      locationSet,
      paySet,
      evidenceCount,
      confirmedAtMs: Number.isNaN(confirmedAtMs as number) ? null : confirmedAtMs,
    },
  };
}
