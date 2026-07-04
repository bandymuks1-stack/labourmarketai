import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  computeOpportunityFit,
  isApprovedRouteRow,
  safeApprovedCompanyName,
  workerOpportunityNextAction,
  type OpportunityFit,
  type OpportunityNeed,
  type WorkerNextAction,
  type WorkerOpportunityProfile,
} from "./opportunity-fit";
import { needFromRoleText } from "./opportunity-need";
import { buildOwnWorkerContext } from "./worker-subject";
import { listMyInterestSignals } from "./interest";
import type { InterestStatus } from "./interest-snapshot";
import {
  matchWorkerToNeed,
  compareMatches,
  type MatchResultV1,
} from "@/lib/market/match-v1";

/**
 * Worker-facing opportunities loader. READ-ONLY, own-data only.
 *
 * Readiness is built from the worker's OWN rows (workers / worker_skills /
 * worker_documents / worker_professions — all self-readable under existing
 * RLS). The open-demand list comes from the gated, curated SECURITY DEFINER
 * RPC `list_open_demand_for_workers()` (applied; Model A approved routes).
 *
 * PR5: each visible demand runs the SAME PR4 canonical engine (inverted) —
 * the worker's own skills vs the demand's derived requirement set — via the
 * SHARED builders in ./worker-subject + ./opportunity-need (one pipeline for
 * the board AND the express-interest snapshot).
 *
 * It NEVER fabricates needs. Interest state is loaded own-rows-only and the
 * action is offered ONLY when the (owner-gated) interest table exists.
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
  /** Profile-completeness layer (documents / country / availability). */
  readonly fit: OpportunityFit;
  /** PR4 canonical match — the worker's OWN skills vs the demand's derived
   *  requirement set (same engine as company scouting, inverted). */
  readonly match: MatchResultV1;
  /** The one clear next step for THIS card (never a fake apply/contact). */
  readonly nextAction: WorkerNextAction;
  /** The worker's own interest status for this demand (null = none). */
  readonly interestStatus: InterestStatus | null;
}

export type WorkerOpportunitiesResult =
  | { readonly kind: "no-worker" }
  | {
      readonly kind: "ready";
      readonly readiness: WorkerReadiness;
      /** True until the owner-gated worker-visibility RPC is applied. */
      readonly needsDataAccess: boolean;
      /** True only when the interest table exists (owner-gated migration) —
       *  the UI offers the express-interest action only then. */
      readonly interestAvailable: boolean;
      readonly opportunities: readonly OpportunityCard[];
    };

export async function loadWorkerOpportunities(): Promise<WorkerOpportunitiesResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "no-worker" };

  const ctx = await buildOwnWorkerContext(supabase, user.id);
  if (!ctx) return { kind: "no-worker" };

  const { data: docs } = await asAny(supabase)
    .from("worker_documents")
    .select("id")
    .eq("worker_id", ctx.workerId);

  const readiness: WorkerReadiness = {
    hasWorkType: Boolean(ctx.subject.professionSlug),
    hasSkills: ctx.skillRowCount > 0,
    countries: ctx.worker.current_location_country
      ? [ctx.worker.current_location_country]
      : [],
    availabilitySet:
      ctx.worker.availability_status === "available" ||
      Boolean(ctx.worker.available_from),
    documentsCount: docs?.length ?? 0,
    availabilityStatus: ctx.worker.availability_status,
    professionSlug: ctx.subject.professionSlug ?? null,
  };

  // Own interest map (empty + unavailable until the owner-gated table exists).
  const myInterest = await listMyInterestSignals(supabase, ctx.workerId);

  // Gated worker-visibility RPC — honest fallback when not yet applied.
  let needsDataAccess = true;
  let opportunities: OpportunityCard[] = [];
  try {
    const { data, error } = await asAny(supabase).rpc("list_open_demand_for_workers");
    if (!error && Array.isArray(data)) {
      needsDataAccess = false;
      opportunities = (data as Record<string, unknown>[])
        // DEFAULT-CLOSED: only approved supply routes (Model A) reach a worker.
        .filter(isApprovedRouteRow)
        .map((row) => {
          const need: OpportunityNeed = {
            id: String(row.id),
            roleText: (row.role_text as string | null) ?? null,
            country: (row.country as string | null) ?? null,
            teamSize: (row.team_size as number | null) ?? null,
            startPeriod: (row.start_period as string | null) ?? null,
            accommodation: (row.accommodation as string | null) ?? null,
            companyName: safeApprovedCompanyName(row),
            // Present only after the PR8 location-label RPC is applied.
            locationLabel: (row.location_label as string | null) ?? null,
          };
          const fit = computeOpportunityFit(readiness, need);
          const { need: matchNeed } = needFromRoleText(
            need.roleText,
            need.country,
            need.locationLabel ?? null,
          );
          const match = matchWorkerToNeed(matchNeed, ctx.subject);
          const nextAction = workerOpportunityNextAction({
            profileFitStatus: fit.status,
            hasAnySkill: ctx.subject.skills.length > 0,
            matchStatus: match.status,
          });
          return {
            need,
            fit,
            match,
            nextAction,
            interestStatus: myInterest.byRequest.get(need.id) ?? null,
          };
        })
        // Best matches first — the SHARED §19 need-context comparator.
        .sort((a, b) => compareMatches(a.match, b.match));
    }
  } catch {
    // RPC absent (not yet applied) → needsDataAccess stays true. Never fake.
  }

  return {
    kind: "ready",
    readiness,
    needsDataAccess,
    interestAvailable: myInterest.available,
    opportunities,
  };
}
