/**
 * Bounded employer facet filters for the scouting surface (Wagon 1).
 *
 * URL-param driven (shareable links), SERVER-validated, and strictly
 * NARROWING: filters run in memory over the already-bounded, RLS-scoped
 * supply (buildSupplyCandidates assembles a demand-driven pool bounded by
 * SUPPLY_POOL_BUDGET behind can_view_worker — W10 slice 3 replaced the old
 * newest-200 window) — they can only ever REMOVE candidates, never widen
 * visibility.
 *
 * Validation is allowlist-first:
 *   - syntax bounds first (charset + length caps) so hostile input dies cheap;
 *   - then the value must exist in the facet set DERIVED from the visible
 *     supply itself — a filter value that matches no visible candidate is
 *     dropped (honest no-op), so arbitrary probe values do nothing.
 *
 * Pure, deterministic, unit-tested. No IO.
 */

const SKILL_SLUG_RX = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const COUNTRY_RX = /^[a-zA-Z]{2}$/;

export const SCOUT_FACET_LIMIT = 12;

export interface ScoutFilters {
  readonly skill: string | null;
  readonly country: string | null;
  readonly availableNow: boolean;
}

export const EMPTY_SCOUT_FILTERS: ScoutFilters = {
  skill: null,
  country: null,
  availableNow: false,
};

/** Candidate shape the filters need — structural so both the supply layer
 *  and tests can satisfy it without importing server-only modules. */
export interface FilterableCandidate {
  readonly subject: {
    readonly skills: readonly { readonly uri: string }[];
    readonly country?: string | null;
    readonly availabilityStatus?: string | null;
  };
}

/** Syntax validation of raw URL params. Anything out of bounds → dropped. */
export function parseScoutFilterParams(params: {
  skill?: string | string[] | undefined;
  country?: string | string[] | undefined;
  available?: string | string[] | undefined;
}): ScoutFilters {
  const one = (v: string | string[] | undefined): string | null =>
    typeof v === "string" ? v : null;

  const rawSkill = (one(params.skill) ?? "").trim().toLowerCase();
  const skill = SKILL_SLUG_RX.test(rawSkill) ? rawSkill : null;

  const rawCountry = (one(params.country) ?? "").trim();
  const country = COUNTRY_RX.test(rawCountry) ? rawCountry.toUpperCase() : null;

  const availableNow = one(params.available) === "1";

  return { skill, country, availableNow };
}

export interface ScoutFacets {
  /** Skill slugs present in the visible supply, most common first (≤12). */
  readonly skills: readonly string[];
  /** Country codes present in the visible supply, most common first (≤12). */
  readonly countries: readonly string[];
}

/** Derive the facet allowlists from the visible supply itself. */
export function buildScoutFacets(
  candidates: readonly FilterableCandidate[],
): ScoutFacets {
  const skillCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  for (const c of candidates) {
    for (const s of c.subject.skills) {
      if (SKILL_SLUG_RX.test(s.uri)) {
        skillCounts.set(s.uri, (skillCounts.get(s.uri) ?? 0) + 1);
      }
    }
    const country = (c.subject.country ?? "").trim();
    if (COUNTRY_RX.test(country)) {
      const cc = country.toUpperCase();
      countryCounts.set(cc, (countryCounts.get(cc) ?? 0) + 1);
    }
  }
  const top = (m: Map<string, number>): string[] =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, SCOUT_FACET_LIMIT)
      .map(([k]) => k);
  return { skills: top(skillCounts), countries: top(countryCounts) };
}

/** Clamp filters to the facet allowlist (value not in supply → dropped). */
export function allowlistScoutFilters(
  filters: ScoutFilters,
  facets: ScoutFacets,
): ScoutFilters {
  return {
    skill:
      filters.skill && facets.skills.includes(filters.skill)
        ? filters.skill
        : null,
    country:
      filters.country && facets.countries.includes(filters.country)
        ? filters.country
        : null,
    availableNow: filters.availableNow,
  };
}

/** Apply allowlisted filters. Only ever narrows the input list. */
export function applyScoutFilters<T extends FilterableCandidate>(
  candidates: readonly T[],
  filters: ScoutFilters,
): T[] {
  return candidates.filter((c) => {
    if (filters.skill && !c.subject.skills.some((s) => s.uri === filters.skill)) {
      return false;
    }
    if (
      filters.country &&
      (c.subject.country ?? "").trim().toUpperCase() !== filters.country
    ) {
      return false;
    }
    if (
      filters.availableNow &&
      (c.subject.availabilityStatus ?? "").trim().toLowerCase() !== "available"
    ) {
      return false;
    }
    return true;
  });
}

export function hasActiveScoutFilters(filters: ScoutFilters): boolean {
  return filters.skill !== null || filters.country !== null || filters.availableNow;
}
