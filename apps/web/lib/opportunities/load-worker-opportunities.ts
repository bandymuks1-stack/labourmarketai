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
import { needFromDemandRow } from "./opportunity-need";
import { buildOwnWorkerContext } from "./worker-subject";
import { listMyInterestSignals } from "./interest";
import {
  listMySavedOpportunities,
  listSavedPublicVacancyIds,
} from "./saved-opportunities";
import { listPublicVacancyPreviewsByIds } from "@/lib/vacancy-store/vacancy-read";
import type { InterestStatus } from "./interest-snapshot";
import {
  buildMyInterestView,
  type LiveNeedFacts,
  type MyInterestViewRow,
} from "./my-interest-view";
import {
  matchWorkerToNeed,
  compareMatches,
  type MatchResultV1,
} from "@/lib/market/match-v1";
import {
  readStructuredDemandPublic,
  type StructuredDemandPublic,
} from "./structured-public";
import {
  loadExternalVacancyCards,
  type ExternalVacanciesResultV1,
} from "./external-vacancies";

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
  /** True when the worker saved this demand as a PRIVATE bookmark (P2-PR5,
   *  #723-compat). Always false while the owner-gated store is absent. */
  readonly saved: boolean;
  /** Worker-safe structured demand detail (P2-PR2). Present only after the
   *  human-gated MP-3 RPC widening is applied AND the row carries a valid
   *  projection — otherwise null and the card degrades honestly ("detailed
   *  conditions not provided"). Parsed through the tolerant public reader;
   *  never the raw payload, never free text. */
  readonly structured: StructuredDemandPublic | null;
}

/** The few fields the saved group renders. Deliberately NOT the whole ad:
 *  the workspace list is a way back to a bookmark, not a second job page. */
export interface SavedVacancyRow {
  readonly id: string;
  readonly title: string;
  readonly occupation: string | null;
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
      /** True only when the #723 saved-opportunities store exists — the save
       *  toggle is rendered only then (feature-detected once per load). */
      readonly savedAvailable: boolean;
      /** The worker's own saved request ids (private bookmarks). The page
       *  joins these against live rows; a saved id with no live row renders
       *  one honest "no longer open" line — facts are never copied. */
      readonly savedRequestIds: readonly string[];
      /** The worker's own saved PUBLIC VACANCIES, already joined against the
       *  live rows. Same private bookmark, second source — the workspace shows
       *  ONE saved list, not one per source. A bookmark whose ad has expired
       *  simply does not come back from the reader, so nothing stale renders.
       *  Empty (and the group hidden) when the worker has none. */
      readonly savedVacancies: readonly SavedVacancyRow[];
      /** "Mano susidomėjimai" (extension A): the worker's OWN interest
       *  signals as display rows, INDEPENDENT of board visibility — a signal
       *  on a closed demand stays, honestly labelled. Empty while the
       *  owner-gated interest table is absent. */
      readonly myInterestRows: readonly MyInterestViewRow[];
      readonly opportunities: readonly OpportunityCard[];
      /** External public-source job ads (real-supply train), matched by the
       *  SAME engine and rendered on the SAME board — an imported vacancy is
       *  an opportunity, never a second product. Empty until the owner
       *  activates a source; `available` is false only while the store's
       *  owner-gated migration is unapplied. */
      readonly externalVacancies: ExternalVacanciesResultV1;
    };

export interface WorkerOpportunitiesOptions {
  /** Board discovery filters forwarded to the EXTERNAL supply retrieval, so
   *  an active profession/country chip narrows what is FETCHED, not merely
   *  what the page hides afterwards. Values come from the closed-set
   *  discovery params (`parseDiscoveryParams`) — never free text. */
  readonly externalDiscovery?: {
    readonly professionSlug?: string | null;
    readonly country?: string | null;
  };
}

export async function loadWorkerOpportunities(
  options?: WorkerOpportunitiesOptions,
): Promise<WorkerOpportunitiesResult> {
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

  // Own PRIVATE bookmarks (P2-PR5) — same honest feature detection: absent
  // store → unavailable, and the board never renders the save toggle.
  const mySaved = await listMySavedOpportunities(supabase, ctx.workerId);

  // Gated worker-visibility RPC — honest fallback when not yet applied.
  let needsDataAccess = true;
  let opportunities: OpportunityCard[] = [];
  try {
    const { data, error } = await asAny(supabase).rpc(
      "list_open_demand_for_workers",
    );
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
            // Present only after the transport RPC recreate is applied —
            // the loader tolerates the missing field (honest degradation).
            transport: (row.transport as string | null) ?? null,
            // Present only after the required-tools RPC recreate is applied —
            // same honest degradation; only string elements pass (defence in
            // depth on top of the RPC's slug whitelist).
            requiredTools: Array.isArray(row.required_tools)
              ? (row.required_tools as unknown[]).filter(
                  (s): s is string => typeof s === "string",
                )
              : null,
            companyName: safeApprovedCompanyName(row),
            // Present only after the PR8 location-label RPC is applied.
            locationLabel: (row.location_label as string | null) ?? null,
            routeStatus: (row.route_status as string | null) ?? null,
            // Whitelisted RPC column — powers the "newest" sort only.
            createdAt: (row.created_at as string | null) ?? null,
          };
          const fit = computeOpportunityFit(readiness, need);
          // W10 P0-1: derived from the ROW, so the match is computed against
          // the same structured demand this card renders below (`structured:`).
          // It used to be built from `role_text` alone — the card showed the
          // employer's engagement form, pay, licence and shifts, and the match
          // beside them had evaluated none of them.
          const { need: matchNeed } = needFromDemandRow(row);
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
            saved: mySaved.requestIds.has(need.id),
            // Present only after the MP-3 structured-exposure RPC recreate is
            // applied — the tolerant reader turns an absent/invalid field into
            // an honest null (same degradation pattern as transport/tools).
            structured: readStructuredDemandPublic(row),
          };
        })
        // Best matches first — the SHARED §19 need-context comparator.
        .sort((a, b) => compareMatches(a.match, b.match));
    }
  } catch {
    // RPC absent (not yet applied) → needsDataAccess stays true. Never fake.
  }

  // Extension A: join the worker's own signals against the live board rows —
  // live facts win; a missing live row marks the demand honestly as closed
  // and the snapshot context (what the worker saw at click time) fills in.
  const liveNeedById = new Map<string, LiveNeedFacts>(
    opportunities.map((o) => [
      o.need.id,
      {
        roleText: o.need.roleText,
        companyName: o.need.companyName ?? null,
        locationLabel: o.need.locationLabel ?? null,
        country: o.need.country,
      },
    ]),
  );
  const myInterestRows = buildMyInterestView(myInterest.rows, liveNeedById);

  // External public-source ads, RLS-scoped through the worker's OWN client —
  // a board that needed service_role to render would mean the policy was
  // wrong. Matched with the SAME subject the platform demands used above.
  const externalVacancies = await loadExternalVacancyCards(
    supabase,
    ctx.subject,
    {
      nowIso: new Date().toISOString(),
      professionSlug: options?.externalDiscovery?.professionSlug ?? null,
      country: options?.externalDiscovery?.country ?? null,
    },
  );

  // Own saved PUBLIC VACANCIES — the second source of the same bookmark. The
  // ids come from the worker's own rows; the titles come from the live ads
  // through the same browsable predicate the board uses, so an expired
  // bookmark drops out instead of rendering a job that no longer exists.
  let savedVacancies: readonly SavedVacancyRow[] = [];
  const mySavedVacancies = await listSavedPublicVacancyIds(
    supabase,
    ctx.workerId,
  );
  if (mySavedVacancies.available && mySavedVacancies.vacancyIds.size > 0) {
    const previews = await listPublicVacancyPreviewsByIds(
      supabase,
      [...mySavedVacancies.vacancyIds],
      new Date().toISOString(),
    );
    if (previews.status === "ok") {
      savedVacancies = previews.previews.map((v) => ({
        id: v.id,
        title: v.title,
        occupation: v.occupation,
      }));
    }
  }

  return {
    kind: "ready",
    readiness,
    needsDataAccess,
    interestAvailable: myInterest.available,
    savedAvailable: mySaved.available,
    savedRequestIds: [...mySaved.requestIds],
    savedVacancies,
    myInterestRows,
    opportunities,
    externalVacancies,
  };
}
