import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  computeOpportunityFit,
  type OpportunityFit,
  type OpportunityNeed,
  type WorkerOpportunityProfile,
} from "./opportunity-fit";

/**
 * Worker-facing opportunities loader. READ-ONLY, own-data only.
 *
 * Readiness is built from the worker's OWN rows (workers / worker_skills /
 * worker_documents / worker_professions — all self-readable under existing
 * RLS). The open-demand list is exposed through a gated, curated SECURITY
 * DEFINER RPC `list_open_demand_for_workers()` mirroring the agency one
 * (`list_open_demand_for_agencies`, migration 20260611150000): caller must be a
 * worker, only status='submitted' needs, only non-personal columns, no
 * profile_id / contacts / free-text notes.
 *
 * That RPC is an OWNER-GATED migration; until it is applied this loader returns
 * `needsDataAccess: true` and an empty list — an honest "opportunities will
 * appear here" state. It NEVER fabricates needs. The moment the RPC exists the
 * board lights up with real demand, with no further code change.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export interface WorkerReadiness extends WorkerOpportunityProfile {
  readonly availabilityStatus: string | null;
  readonly professionSlug: string | null;
}

export interface OpportunityCard {
  readonly need: OpportunityNeed;
  readonly fit: OpportunityFit;
}

export type WorkerOpportunitiesResult =
  | { readonly kind: "no-worker" }
  | {
      readonly kind: "ready";
      readonly readiness: WorkerReadiness;
      /** True until the owner-gated worker-visibility RPC is applied. */
      readonly needsDataAccess: boolean;
      readonly opportunities: readonly OpportunityCard[];
    };

export async function loadWorkerOpportunities(): Promise<WorkerOpportunitiesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  const { data: worker } = await asAny(supabase)
    .from("workers")
    .select("id, availability_status, available_from, current_location_country")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!worker) return { kind: "no-worker" };
  const workerId = worker.id as string;

  const [skills, docs, prof] = await Promise.all([
    asAny(supabase).from("worker_skills").select("id").eq("worker_id", workerId),
    asAny(supabase).from("worker_documents").select("id").eq("worker_id", workerId),
    asAny(supabase)
      .from("worker_professions")
      .select("professions(slug)")
      .eq("worker_id", workerId)
      .eq("is_primary", true)
      .maybeSingle(),
  ]);

  const professionSlug: string | null =
    (prof?.data?.professions as { slug: string | null } | null)?.slug ?? null;
  const country = worker.current_location_country
    ? String(worker.current_location_country).toUpperCase()
    : null;

  const readiness: WorkerReadiness = {
    hasWorkType: Boolean(professionSlug),
    hasSkills: (skills?.data?.length ?? 0) > 0,
    countries: country ? [country] : [],
    availabilitySet:
      worker.availability_status === "available" || Boolean(worker.available_from),
    documentsCount: docs?.data?.length ?? 0,
    availabilityStatus: worker.availability_status ?? null,
    professionSlug,
  };

  // Gated worker-visibility RPC — honest fallback when not yet applied.
  let needsDataAccess = true;
  let opportunities: OpportunityCard[] = [];
  try {
    const { data, error } = await asAny(supabase).rpc("list_open_demand_for_workers");
    if (!error && Array.isArray(data)) {
      needsDataAccess = false;
      opportunities = (data as Record<string, unknown>[]).map((row) => {
        const need: OpportunityNeed = {
          id: String(row.id),
          roleText: (row.role_text as string | null) ?? null,
          country: (row.country as string | null) ?? null,
          teamSize: (row.team_size as number | null) ?? null,
          startPeriod: (row.start_period as string | null) ?? null,
          accommodation: (row.accommodation as string | null) ?? null,
        };
        return { need, fit: computeOpportunityFit(readiness, need) };
      });
    }
  } catch {
    // RPC absent (not yet applied) → needsDataAccess stays true. Never fake.
  }

  return { kind: "ready", readiness, needsDataAccess, opportunities };
}
