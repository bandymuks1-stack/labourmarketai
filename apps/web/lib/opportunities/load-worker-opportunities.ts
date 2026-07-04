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
import { deriveNeedSkills } from "@/lib/market/need-skills";
import {
  matchWorkerToNeed,
  compareMatches,
  sourceToEvidence,
  type EvidenceTier,
  type MatchResultV1,
  type MatchSubject,
} from "@/lib/market/match-v1";

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
  /** Profile-completeness layer (documents / country / availability). */
  readonly fit: OpportunityFit;
  /** PR4 canonical match — the worker's OWN skills vs the demand's derived
   *  requirement set (same engine as company scouting, inverted). */
  readonly match: MatchResultV1;
  /** The one clear next step for THIS card (never a fake apply/contact). */
  readonly nextAction: WorkerNextAction;
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
    // Canonical slugs + REAL evidence tiers for the worker's own skills —
    // the same MatchSubject shape company scouting uses (PR4).
    asAny(supabase)
      .from("worker_skills")
      .select("id, source, verified, skills ( slug )")
      .eq("worker_id", workerId),
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

  // The worker's own match subject (slug identity, real evidence tiers —
  // verified=true is the manager-confirmed truth even if source lags).
  const tierRank: Record<EvidenceTier, number> = {
    self_declared: 0,
    work_journal: 1,
    manager_confirmed: 2,
  };
  const ownSkillTiers = new Map<string, EvidenceTier>();
  for (const s of (skills?.data ?? []) as {
    source: string | null;
    verified: boolean | null;
    skills: { slug: string | null } | null;
  }[]) {
    const slug = s.skills?.slug;
    if (!slug) continue;
    const tier: EvidenceTier = s.verified ? "manager_confirmed" : sourceToEvidence(s.source);
    const prev = ownSkillTiers.get(slug);
    if (!prev || tierRank[tier] > tierRank[prev]) ownSkillTiers.set(slug, tier);
  }
  const subject: MatchSubject = {
    skills: [...ownSkillTiers.entries()].map(([uri, evidence]) => ({ uri, evidence })),
    professionSlug,
    country,
    availabilityStatus: worker.availability_status ?? null,
    availableFrom: (worker.available_from as string | null) ?? null,
  };

  // Gated worker-visibility RPC — honest fallback when not yet applied.
  let needsDataAccess = true;
  let opportunities: OpportunityCard[] = [];
  try {
    const { data, error } = await asAny(supabase).rpc("list_open_demand_for_workers");
    if (!error && Array.isArray(data)) {
      needsDataAccess = false;
      opportunities = (data as Record<string, unknown>[])
        // DEFAULT-CLOSED (Worker Opportunities v1): a worker only ever sees a
        // need that arrived through an APPROVED supply route — never a raw,
        // unreviewed employer. Approved-route MODEL A (owner decision
        // 2026-07-02, migration 20260702170000): the RPC returns
        // route_status='approved_direct_partner' + a safe company_name ONLY
        // for demand owned by an admin-VERIFIED company
        // (companies.verification_status='verified'); unverified demand never
        // reaches this filter. If the migration is rolled back the RPC stops
        // returning the columns and this predicate closes the board again.
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
          };
          const fit = computeOpportunityFit(readiness, need);
          // PR4 canonical matching, inverted for the worker side: derive the
          // demand's requirement set from the role text the RPC already
          // exposes (underscores → spaces so work-type slugs recognise), via
          // the SAME offline derivation company scouting uses. No ESCO.
          const derived = deriveNeedSkills({
            roleOrWorkType: (need.roleText ?? "").replace(/[_-]+/g, " "),
          });
          const match = matchWorkerToNeed(
            {
              skillIds: derived.skillSlugs,
              needSource: derived.source,
              professionSlug: derived.professionSlug,
              country: need.country,
            },
            subject,
          );
          const nextAction = workerOpportunityNextAction({
            profileFitStatus: fit.status,
            hasAnySkill: subject.skills.length > 0,
            matchStatus: match.status,
          });
          return { need, fit, match, nextAction };
        })
        // Best matches first — the SHARED §19 need-context comparator.
        .sort((a, b) => compareMatches(a.match, b.match));
    }
  } catch {
    // RPC absent (not yet applied) → needsDataAccess stays true. Never fake.
  }

  return { kind: "ready", readiness, needsDataAccess, opportunities };
}
