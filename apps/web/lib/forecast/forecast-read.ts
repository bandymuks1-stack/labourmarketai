import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { computeProjectForecast, type ProjectForecast } from "./forecast-engine";
import { buildForecastFacts, type ForecastFactRows } from "./forecast-facts";

/**
 * THE PROJECT FORECAST ON READ — the engine (#2733) wired to the project
 * course screen, without storage and without a scheduler.
 *
 * Order matters and is the whole security argument:
 *   1. AUTHORITY under the viewer's OWN session: the database's own
 *      `can_manage_project` (the gate every project write already uses). No
 *      session, no manager → null, and nothing below runs.
 *   2. FACTS through the ONE service-only door the applied forecast migration
 *      (20261025045152_project_forecasts_v1) created for exactly this read:
 *      `forecast_project_facts_v1` returns opaque keys, statuses, dates and
 *      numeric rows — never entry text, never names — for the one project the
 *      viewer was just proven to manage. The service role holds no table
 *      privilege on the forecast tables; it only executes this function.
 *   3. The pure engine turns those facts into a FORECAST (SEP-1). Nothing is
 *      written: no forecast row, no signal consumed, no state moved.
 *
 * A failed or missing door answers null — the panel then says the forecast
 * could not be read, never that the project is on track.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: { code?: string } | null }>;

function rpcOf(client: SupabaseClient): Rpc {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn, args) => (client as any).rpc(fn, args);
}

export type ProjectForecastRead =
  | { readonly state: "ok"; readonly forecast: ProjectForecast }
  | { readonly state: "not_manager" }
  | { readonly state: "unavailable" };

export async function readProjectForecast(projectId: string, todayIso: string): Promise<ProjectForecastRead> {
  const session = await createClient();
  const manages = await rpcOf(session as unknown as SupabaseClient)("can_manage_project", { p_project_id: projectId });
  if (manages.error) {
    console.error("[forecast] authority read failed:", manages.error.code);
    return { state: "unavailable" };
  }
  if (manages.data !== true) return { state: "not_manager" };

  const admin = createAdminClient() as unknown as SupabaseClient;
  const facts = await rpcOf(admin)("forecast_project_facts_v1", { p_project_id: projectId, p_today: todayIso });
  if (facts.error || !facts.data) {
    if (facts.error) console.error("[forecast] facts read failed:", facts.error.code);
    return { state: "unavailable" };
  }
  try {
    const forecast = computeProjectForecast(buildForecastFacts(projectId, todayIso, facts.data as ForecastFactRows));
    return { state: "ok", forecast };
  } catch (err) {
    console.error("[forecast] engine failed:", err instanceof Error ? err.name : "unknown");
    return { state: "unavailable" };
  }
}
