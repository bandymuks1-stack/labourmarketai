/**
 * Stage 1 of staged candidate retrieval — the PURE half (W10 slice 3, P0-3).
 *
 * ── What this replaces ──────────────────────────────────────────────────
 * `buildSupplyCandidates` used to open with
 *
 *     .from("workers").order("created_at", {ascending:false}).limit(200)
 *
 * i.e. the candidate pool was "the 200 newest registrations", chosen with no
 * reference whatsoever to the demand being staffed. Every filter, every match
 * and the whole ranking then ran in memory over that arbitrary window. A
 * perfectly-qualified worker who registered before the newest 200 was never
 * fetched, so never matched, never ranked and never shown — and the surface
 * said "no candidates" rather than "we did not look".
 *
 * ── What replaces it ────────────────────────────────────────────────────
 * Retrieval is now DEMAND-DRIVEN and DETERMINISTIC, in three stages:
 *
 *   Stage 1 (here + `supply-retrieval` IO in match-subject.ts)
 *     Cheap, index-backed reads that return candidate IDS ONLY, one read per
 *     signal the demand actually carries:
 *       skill      — worker_skills.skill_id  (idx_worker_skills_skill_id)
 *       profession — worker_professions.profession_id
 *                    (idx_worker_professions_profession_id)
 *       location   — workers.current_location_country / preferred_countries
 *     A worker found by more signals is retrieved first (`TIER_WEIGHT`).
 *
 *   Stage 2  full rows for those ids only (`workers.id` primary key).
 *   Stage 3  the EXISTING deterministic ranking, unchanged.
 *
 * ── Why the tiers WIDEN and never filter ────────────────────────────────
 * The match engine does not treat a country mismatch as disqualifying — it
 * records a `country_mismatch` gap and soft-caps the status (match-v1.ts:513).
 * A hard SQL `country = ...` filter would therefore delete candidates the
 * product deliberately still shows. So Stage 1 is a UNION of signal tiers plus
 * a deterministic backfill, never an intersection and never an exclusion:
 * every worker reachable before is still reachable, the demand-relevant ones
 * are simply retrieved FIRST instead of the most recently registered ones.
 * A tier that misses rows (e.g. an odd country casing) costs priority, never
 * reachability — the backfill still carries that worker in.
 *
 * ── The budget is disclosed, not hidden ─────────────────────────────────
 * A pool bound still exists (`SUPPLY_POOL_BUDGET`) because an unbounded read
 * is not a plan either. The difference from the old cap is threefold: it is
 * spent on demand-relevant candidates first, it is ordered by signal and then
 * by id (never by registration date), and when it BINDS the caller learns so
 * (`SupplyRetrievalReport.capped`) and the surface says it out loud.
 *
 * Pure and unit-tested: no IO, no clock, no randomness. Same input → same
 * pool, every run.
 */

import type { MatchNeed } from "@/lib/market/match-v1";

/**
 * Maximum candidates assembled into one pool. Chosen as 2.5× the old cap: it
 * is an operational memory/latency bound on the in-memory engine, NOT a
 * statement about the supply. When it binds, `SupplyRetrievalReport.capped` is
 * true and the employer is told.
 */
export const SUPPLY_POOL_BUDGET = 500;

/**
 * Row ceiling for a single Stage-1 id read. Stage 1 selects ONE column, so
 * this is a memory guard, not a relevance decision; it sits far above the pool
 * budget on purpose. If it ever binds, the tier is reported in
 * `truncatedStages` rather than silently shortened.
 */
export const STAGE1_ID_SCAN_CAP = 10_000;

/** Charset bounds — a value that fails these is dropped from the plan rather
 *  than concatenated into a PostgREST filter. */
const SKILL_SLUG_RX = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const PROFESSION_SLUG_RX = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const COUNTRY_RX = /^[A-Za-z]{2}$/;
const ESCO_URI_RX = /^[A-Za-z0-9:/._-]{1,200}$/;

/** How many distinct requirement values one plan may carry into SQL. Keeps a
 *  pathological demand from building a 500-term `IN (...)`. */
const MAX_PLAN_TERMS = 40;

export type SupplyRetrievalTier = "skill" | "profession" | "location" | "backfill";

/** Retrieval priority. A worker found by several signals scores their sum, so
 *  "has the skill AND is in the country" outranks "has the skill". These
 *  weights order RETRIEVAL only — they never touch the ranking in Stage 3. */
export const TIER_WEIGHT: Record<SupplyRetrievalTier, number> = {
  skill: 4,
  profession: 2,
  location: 1,
  backfill: 0,
};

export interface SupplyRetrievalPlan {
  /** Catalogue skill slugs to resolve to skill ids (deduped, sorted). */
  readonly skillSlugs: readonly string[];
  /** Legacy human-picked ESCO URIs that never got bridged to a slug. */
  readonly escoUris: readonly string[];
  readonly professionSlug: string | null;
  /** ISO-3166 alpha-2, uppercased. Null when the demand's country field is not
   *  a country code (free text like "Netherlands") — the tier is skipped
   *  rather than guessed, and the backfill still reaches those workers. */
  readonly countryCode: string | null;
  readonly budget: number;
  /** False when the demand yielded no usable predicate at all: retrieval then
   *  degrades to the deterministic backfill alone (id order, never recency). */
  readonly demandDriven: boolean;
}

export interface SupplyRetrievalReport {
  /** `demand_staged` — planned from a MatchNeed. `explicit_ids` — the caller
   *  named the workers (admin workbench), so Stage 1 is skipped entirely. */
  readonly strategy: "demand_staged" | "explicit_ids";
  readonly budget: number;
  /** Pool members that at least one demand signal retrieved. */
  readonly matchedByDemand: number;
  /** Pool members that only the deterministic backfill retrieved. */
  readonly backfilled: number;
  readonly poolSize: number;
  /** True when more candidates were retrievable than the budget allowed. The
   *  employer-facing surface MUST say so when this is true. */
  readonly capped: boolean;
  /** Stage-1 reads that hit `STAGE1_ID_SCAN_CAP`. Non-empty means the tier's
   *  id set is incomplete — reported, never hidden. */
  readonly truncatedStages: readonly SupplyRetrievalTier[];
}

/** Normalise first, THEN bound: the charset check judges the value that would
 *  actually reach SQL, not the raw text. */
function dedupeBounded(
  values: readonly string[],
  rx: RegExp,
  normalize: (v: string) => string = (v) => v,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (typeof raw !== "string") continue;
    const value = normalize(raw.trim());
    if (!rx.test(value)) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= MAX_PLAN_TERMS) break;
  }
  return out.sort();
}

/**
 * Derive the Stage-1 plan from a demand. Sanitising happens HERE, once: a
 * value that fails its charset bound is dropped from the plan, so nothing
 * unvalidated ever reaches a PostgREST filter.
 */
export function planSupplyRetrieval(
  need: MatchNeed,
  budget: number = SUPPLY_POOL_BUDGET,
): SupplyRetrievalPlan {
  const skillSlugs = dedupeBounded(need.skillIds ?? [], SKILL_SLUG_RX, (v) => v.toLowerCase());
  const escoUris = dedupeBounded(need.escoSkillUris ?? [], ESCO_URI_RX);
  const rawProfession = (need.professionSlug ?? "").trim().toLowerCase();
  const professionSlug = PROFESSION_SLUG_RX.test(rawProfession) ? rawProfession : null;
  const rawCountry = (need.country ?? "").trim();
  const countryCode = COUNTRY_RX.test(rawCountry) ? rawCountry.toUpperCase() : null;

  return {
    skillSlugs,
    escoUris,
    professionSlug,
    countryCode,
    budget: Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : SUPPLY_POOL_BUDGET,
    demandDriven:
      skillSlugs.length > 0 ||
      escoUris.length > 0 ||
      professionSlug !== null ||
      countryCode !== null,
  };
}

export interface TierResult {
  readonly tier: SupplyRetrievalTier;
  readonly ids: readonly string[];
  /** The read hit `STAGE1_ID_SCAN_CAP` — this tier's id set is incomplete. */
  readonly truncated?: boolean;
}

export interface PoolSelection {
  /** Pool member ids, in retrieval order: strongest signal first, then id
   *  ascending. Deterministic — the same tiers always produce this list. */
  readonly ids: readonly string[];
  readonly report: SupplyRetrievalReport;
}

/**
 * Union the tier id sets into ONE deterministic, budget-bounded pool.
 *
 * Ordering: total signal weight DESC, then worker id ASC. Registration date
 * plays no part, so no candidate can be pushed out of the pool by newer
 * accounts. Ties break on the id, which is stable across runs — the same
 * demand always assembles the same pool, so the same candidate list comes
 * back on every reload.
 */
export function selectPoolIds(
  tiers: readonly TierResult[],
  budget: number = SUPPLY_POOL_BUDGET,
): PoolSelection {
  const weightById = new Map<string, number>();
  const truncatedStages: SupplyRetrievalTier[] = [];

  for (const tier of tiers) {
    if (tier.truncated) truncatedStages.push(tier.tier);
    const weight = TIER_WEIGHT[tier.tier];
    const seenInTier = new Set<string>();
    for (const id of tier.ids) {
      if (typeof id !== "string" || id === "" || seenInTier.has(id)) continue;
      seenInTier.add(id);
      weightById.set(id, (weightById.get(id) ?? 0) + weight);
    }
  }

  const ordered = [...weightById.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const effectiveBudget =
    Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : SUPPLY_POOL_BUDGET;
  const selected = ordered.slice(0, effectiveBudget);

  return {
    ids: selected.map(([id]) => id),
    report: {
      strategy: "demand_staged",
      budget: effectiveBudget,
      matchedByDemand: selected.filter(([, w]) => w > 0).length,
      backfilled: selected.filter(([, w]) => w === 0).length,
      poolSize: selected.length,
      capped: ordered.length > effectiveBudget,
      truncatedStages,
    },
  };
}

/** Report for the `explicit_ids` strategy (the admin workbench names the
 *  workers itself, so no Stage-1 planning runs). */
export function explicitIdsReport(
  requested: readonly string[],
  selected: readonly string[],
  budget: number = SUPPLY_POOL_BUDGET,
): SupplyRetrievalReport {
  return {
    strategy: "explicit_ids",
    budget,
    matchedByDemand: selected.length,
    backfilled: 0,
    poolSize: selected.length,
    capped: requested.length > selected.length,
    truncatedStages: [],
  };
}
