import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  computeThermometer,
  type ThermometerResult,
} from "./thermometer";

/**
 * Thermometer data builder (S4) — assembles the two owner-formula components
 * for the signed-in worker under their own RLS + the aggregate RPC, and
 * degrades HONESTLY at every seam:
 *  - no worker / no primary profession / no (single) project link →
 *    insufficient_data with the position component missing;
 *  - migrations not applied yet (42P01 table / PGRST202·42883 function) →
 *    the affected component is simply missing — never an error surface,
 *    never a fake number.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export const SMALL_SAMPLE_N = 5;

export interface OwnThermometer {
  readonly result: ThermometerResult;
  /** Sample size behind the position average (workers with declared ranges). */
  readonly positionSampleN: number | null;
  /** Mandatory small-sample flag (n < SMALL_SAMPLE_N) when a score exists. */
  readonly smallSample: boolean;
  readonly country: string | null;
}

const MISSING_FN_CODES = new Set(["42883", "PGRST202"]);
const MISSING_TABLE_CODE = "42P01";

export async function getOwnThermometer(): Promise<OwnThermometer | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id, current_location_country")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker?.id) return null;
  const country: string | null = worker.current_location_country ?? null;

  // Primary profession — the "position" of the formula.
  const { data: wp } = await asAny(supabase)
    .from("worker_professions")
    .select("profession_id")
    .eq("worker_id", worker.id)
    .eq("is_primary", true)
    .maybeSingle();
  const professionId: string | null = wp?.profession_id ?? null;

  // The worker's single active project assignment (ambiguous → no link).
  let projectId: string | null = null;
  const { data: pwa } = await asAny(supabase)
    .from("project_worker_assignments")
    .select("project_id")
    .eq("worker_id", worker.id)
    .eq("status", "active");
  if (Array.isArray(pwa) && pwa.length === 1) {
    projectId = pwa[0]?.project_id ?? null;
  }

  // Component 1 — position average (aggregate RPC; missing fn → missing).
  let positionAvgEur: number | null = null;
  let positionSampleN: number | null = null;
  if (projectId && professionId) {
    const { data, error } = await asAny(supabase).rpc(
      "project_position_salary_avg",
      { p_project_id: projectId, p_profession_id: professionId },
    );
    if (!error && Array.isArray(data) && data.length > 0) {
      const row = data[0] as { avg_mid_eur: number | null; sample_n: number | null };
      if (
        typeof row.avg_mid_eur === "number" ||
        typeof row.avg_mid_eur === "string"
      ) {
        const avg = Number(row.avg_mid_eur);
        if (Number.isFinite(avg) && avg > 0) {
          positionAvgEur = avg;
          positionSampleN = typeof row.sample_n === "number" ? row.sample_n : null;
        }
      }
    } else if (error && !MISSING_FN_CODES.has(error.code ?? "")) {
      // Any non-"not applied yet" error still degrades to missing — but we
      // never surface a partial score.
      positionAvgEur = null;
    }
  }

  // Component 2 — admin-entered market average for profession × country.
  let marketAvgEur: number | null = null;
  if (professionId && country) {
    const { data, error } = await asAny(supabase)
      .from("market_rate_averages")
      .select("avg_rate_eur")
      .eq("profession_id", professionId)
      .eq("country", country)
      .eq("is_active", true)
      .maybeSingle();
    if (!error && data) {
      const avg = Number((data as { avg_rate_eur: unknown }).avg_rate_eur);
      if (Number.isFinite(avg) && avg > 0) marketAvgEur = avg;
    } else if (error && error.code !== MISSING_TABLE_CODE) {
      marketAvgEur = null;
    }
  }

  const result = computeThermometer({ positionAvgEur, marketAvgEur });
  return {
    result,
    positionSampleN,
    smallSample:
      result.kind === "score" &&
      (positionSampleN === null || positionSampleN < SMALL_SAMPLE_N),
    country,
  };
}
