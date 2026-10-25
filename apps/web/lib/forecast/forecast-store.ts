import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

import type { ProjectForecast } from "./forecast-engine";
import type { ForecastFactRows } from "./forecast-facts";
import type { ForecastCandidate, ForecastRecord, ForecastStore } from "./forecast-scheduler-core";

/**
 * The scheduler's database doors (forecast migration 20261024130000). The
 * service role holds no table privilege here (least privilege): it reaches
 * the forecast tables and the fact rows ONLY through three SECURITY DEFINER
 * functions granted to it alone. No person's session is involved, and
 * nothing here is reachable from a user request.
 *
 * A missing function (migration not applied) answers null — the cron route
 * then says "unavailable", never "nothing to do".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { code?: string } | null }>;

function rpcOf(client: SupabaseClient): Rpc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn, args) => (client as any).rpc(fn, args);
}

type CandidateRow = {
  project_id: string;
  mode: string;
  enabled: boolean;
  last_computed_at: string | null;
  last_version: number | null;
  last_inputs_hash: string | null;
  first_signal_at: string | null;
  last_signal_at: string | null;
  max_signal_id: number | string | null;
  last_forecast: ProjectForecast | null;
  project_status: string | null;
};

export function createForecastStore(client: SupabaseClient = createAdminClient() as unknown as SupabaseClient): ForecastStore {
  const rpc = rpcOf(client);
  return {
    async dueCandidates(limit) {
      const { data, error } = await rpc("forecast_due_candidates_v1", { p_limit: limit });
      if (error) {
        console.error("[forecast] due candidates read failed:", error.code);
        return null;
      }
      return ((data ?? []) as CandidateRow[]).map(
        (r): ForecastCandidate => ({
          projectId: r.project_id,
          mode: r.mode,
          enabled: r.enabled,
          lastComputedAt: r.last_computed_at,
          lastVersion: r.last_version,
          lastInputsHash: r.last_inputs_hash,
          firstSignalAt: r.first_signal_at,
          lastSignalAt: r.last_signal_at,
          maxSignalId: r.max_signal_id === null ? null : Number(r.max_signal_id),
          lastForecast: r.last_forecast,
          projectStatus: r.project_status,
        }),
      );
    },
    async factRows(projectId, today) {
      const { data, error } = await rpc("forecast_project_facts_v1", { p_project_id: projectId, p_today: today });
      if (error) {
        console.error("[forecast] facts read failed:", error.code);
        return null;
      }
      return (data ?? null) as ForecastFactRows | null;
    },
    async record(r: ForecastRecord) {
      const { data, error } = await rpc("forecast_record_v1", {
        p_project_id: r.projectId,
        p_mode: r.mode,
        p_reason: r.reason,
        p_computed_at: r.computedAt,
        p_as_of: r.asOf,
        p_engine_version: r.engineVersion,
        p_inputs_hash: r.inputsHash,
        p_forecast: r.forecast,
        p_comparison: r.comparison,
        p_facts_summary: r.factsSummary,
        p_store_version: r.storeVersion,
        p_consumed_signal_id: r.consumedSignalId,
      });
      if (error) {
        console.error("[forecast] record failed:", error.code);
        return null;
      }
      return typeof data === "number" ? data : null;
    },
  };
}
