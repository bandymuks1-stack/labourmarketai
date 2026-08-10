/**
 * Worker board discovery filters + sort (Marketplace Precision PR 4,
 * Capability D). PURE: parses URL searchParams into a typed filter state,
 * applies it server-side over the ALREADY-AUTHORIZED rows the gated RPC
 * returned, derives the facet values from those same rows, and builds the
 * chip-link query strings. No new data source, no search engine — this is
 * presentation-side narrowing of the existing whitelisted result set.
 *
 * Sorting: "relevance" keeps the existing shared §19 comparator order
 * (compareMatches — the loader already applied it); "newest" reorders by the
 * RPC's whitelisted created_at. Deterministic, stable, no fake urgency.
 */

import type { OpportunityNeed } from "./opportunity-fit";

export interface DiscoveryFilterState {
  /** Work-type slug (need.roleText). */
  readonly profession: string | null;
  /** ISO-2 country. */
  readonly country: string | null;
  /** Urgency/start-period enum (need.startPeriod). */
  readonly start: string | null;
  /** Accommodation enum value. */
  readonly accommodation: string | null;
  /** Transport enum value. */
  readonly transport: string | null;
  /** Required-tool slug (row must require it). */
  readonly tool: string | null;
}

export type DiscoverySort = "relevance" | "newest";

export const EMPTY_DISCOVERY_FILTERS: DiscoveryFilterState = {
  profession: null,
  country: null,
  start: null,
  accommodation: null,
  transport: null,
  tool: null,
};

const str = (v: string | string[] | undefined): string | null => {
  const s = Array.isArray(v) ? v[0] : v;
  const t = (s ?? "").trim();
  // Bounded: filter values are closed-set slugs/enums; anything oversized or
  // containing markup-ish characters is ignored (never reflected).
  if (t === "" || t.length > 64 || /[<>"'&]/.test(t)) return null;
  return t;
};

export function parseDiscoveryParams(
  sp: Record<string, string | string[] | undefined>,
): { filters: DiscoveryFilterState; sort: DiscoverySort } {
  return {
    filters: {
      profession: str(sp.profession),
      country: str(sp.country),
      start: str(sp.start),
      accommodation: str(sp.accommodation),
      transport: str(sp.transport),
      tool: str(sp.tool),
    },
    sort: str(sp.sort) === "newest" ? "newest" : "relevance",
  };
}

export function activeFilterEntries(
  f: DiscoveryFilterState,
): ReadonlyArray<readonly [keyof DiscoveryFilterState, string]> {
  return (Object.entries(f) as [keyof DiscoveryFilterState, string | null][]) //
    .filter((e): e is [keyof DiscoveryFilterState, string] => e[1] != null);
}

export function activeFilterCount(f: DiscoveryFilterState): number {
  return activeFilterEntries(f).length;
}

/** Whether ONE need row passes the active filters (AND semantics). */
export function needMatchesFilters(
  need: OpportunityNeed,
  f: DiscoveryFilterState,
): boolean {
  if (f.profession != null && need.roleText !== f.profession) return false;
  if (f.country != null && (need.country ?? "").toUpperCase() !== f.country.toUpperCase()) {
    return false;
  }
  if (f.start != null && need.startPeriod !== f.start) return false;
  if (f.accommodation != null && need.accommodation !== f.accommodation) return false;
  if (f.transport != null && need.transport !== f.transport) return false;
  if (f.tool != null && !(need.requiredTools ?? []).includes(f.tool)) return false;
  return true;
}

export function applyDiscoveryFilters<T extends { readonly need: OpportunityNeed }>(
  cards: readonly T[],
  f: DiscoveryFilterState,
): T[] {
  return cards.filter((c) => needMatchesFilters(c.need, f));
}

/**
 * Whether ONE external public-source ad passes the active filters.
 *
 * External ads carry fewer facts than platform demands, and an unknown is
 * NEVER treated as a match ("an ad that does not state a language requirement
 * is not 'no language required'" — the presentation contract's rule, applied
 * to filtering). So:
 *   - `profession` filters on the categorizer's declared professionSlug;
 *   - `country` filters on the publisher's stated country;
 *   - `start` / `accommodation` / `transport` / `tool` are facts external ads
 *     do not carry — an active filter there EXCLUDES external ads rather than
 *     pretending the unknown satisfies the person's stated requirement.
 */
export function externalAdMatchesFilters(
  view: {
    readonly professionSlug: string | null;
    readonly country: string | null;
  },
  f: DiscoveryFilterState,
): boolean {
  if (f.start != null || f.accommodation != null || f.transport != null || f.tool != null) {
    return false;
  }
  if (f.profession != null && view.professionSlug !== f.profession) return false;
  if (
    f.country != null &&
    (view.country ?? "").toUpperCase() !== f.country.toUpperCase()
  ) {
    return false;
  }
  return true;
}

/** Stable "newest first" reorder by the RPC's created_at (nulls last). The
 *  input order is the relevance order, so ties keep their relevance rank. */
export function sortDiscoveryCards<T extends { readonly need: OpportunityNeed }>(
  cards: readonly T[],
  sort: DiscoverySort,
): T[] {
  if (sort !== "newest") return [...cards];
  return [...cards].sort((a, b) => {
    const ca = a.need.createdAt ?? "";
    const cb = b.need.createdAt ?? "";
    if (ca === cb) return 0;
    if (ca === "") return 1;
    if (cb === "") return -1;
    return cb < ca ? -1 : 1;
  });
}

export interface DiscoveryFacets {
  readonly professions: readonly string[];
  readonly countries: readonly string[];
  readonly starts: readonly string[];
  readonly accommodations: readonly string[];
  readonly transports: readonly string[];
  readonly tools: readonly string[];
}

/** Distinct facet values present in the loaded (authorized) rows — the chips
 *  offer only values that actually exist, never an invented vocabulary. */
export function collectDiscoveryFacets(
  needs: readonly OpportunityNeed[],
): DiscoveryFacets {
  const uniq = (vals: (string | null | undefined)[]): string[] =>
    [...new Set(vals.filter((v): v is string => !!v && v.trim() !== ""))].sort();
  return {
    professions: uniq(needs.map((n) => n.roleText)),
    countries: uniq(needs.map((n) => (n.country ?? "").toUpperCase() || null)),
    starts: uniq(needs.map((n) => n.startPeriod)),
    accommodations: uniq(needs.map((n) => n.accommodation)),
    transports: uniq(needs.map((n) => n.transport ?? null)),
    tools: uniq(needs.flatMap((n) => [...(n.requiredTools ?? [])])),
  };
}

/** Query string for a chip link: current state with one dimension patched
 *  (null clears it). Toggling an active value passes null to clear. */
export function buildDiscoveryQuery(
  f: DiscoveryFilterState,
  sort: DiscoverySort,
  patch: Partial<Record<keyof DiscoveryFilterState, string | null>> & {
    sort?: DiscoverySort;
  } = {},
): string {
  const next: DiscoveryFilterState = {
    profession: "profession" in patch ? (patch.profession ?? null) : f.profession,
    country: "country" in patch ? (patch.country ?? null) : f.country,
    start: "start" in patch ? (patch.start ?? null) : f.start,
    accommodation:
      "accommodation" in patch ? (patch.accommodation ?? null) : f.accommodation,
    transport: "transport" in patch ? (patch.transport ?? null) : f.transport,
    tool: "tool" in patch ? (patch.tool ?? null) : f.tool,
  };
  const nextSort = patch.sort ?? sort;
  const q = new URLSearchParams();
  for (const [k, v] of activeFilterEntries(next)) q.set(k, v);
  if (nextSort !== "relevance") q.set("sort", nextSort);
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}
