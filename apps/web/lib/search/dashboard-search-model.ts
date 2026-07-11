/**
 * Universal dashboard search — pure model (control room PR K, capability gap
 * map §11).
 *
 * Pure string work + bounds only. No DB, no IO, no fetch — the server
 * composition (lib/search/dashboard-search.ts) does the reading with the
 * caller's OWN RLS-scoped helpers, and the API route
 * (app/api/dashboard-search/route.ts) does the authentication.
 *
 * Design contract (guard: lib/guards/universal-search-reports.test.ts):
 *
 *  - ONE normalization truth: matching reuses the command registry's
 *    `normalizeForSearch` (lowercase + diacritics strip) so "kortele" finds
 *    "kortelė" in object titles exactly like it does in commands.
 *  - BOUNDED by construction: minimum query length, maximum query length,
 *    per-source result limit and a total cap are constants enforced here —
 *    the server layer cannot return more than the model allows.
 *  - NO cross-user people search: the source catalogue below contains ONLY
 *    the caller's own object types. Finding PEOPLE stays the deterministic
 *    scouting flow (/dashboard/company/scouting) — deliberately absent here.
 *  - Results carry EXACT existing destinations (real routes, optionally with
 *    the page's own filter params) — never an invented page.
 */

import { normalizeForSearch } from "@/lib/navigation/command-registry";

export const DASHBOARD_SEARCH_MIN_QUERY_CHARS = 2;
export const DASHBOARD_SEARCH_MAX_QUERY_CHARS = 80;
/** Max results per source group — keeps the list scannable on mobile. */
export const DASHBOARD_SEARCH_PER_SOURCE_LIMIT = 5;
/** Hard total cap across every group. */
export const DASHBOARD_SEARCH_MAX_TOTAL_RESULTS = 30;

/**
 * The caller's-own-object sources, in render order. NO people source: the
 * deterministic scouting flow is the only person-finding path (gap map §11).
 */
export const DASHBOARD_SEARCH_SOURCES = [
  "projects",
  "tasks",
  "finance",
  "conversations",
  "bookings",
  "documents",
] as const;

export type DashboardSearchSource = (typeof DASHBOARD_SEARCH_SOURCES)[number];

export type DashboardSearchResult = {
  /** Stable id (the record's own id — safe: it is the caller's own row). */
  readonly id: string;
  /** The record's own title/subject — the caller's own data. */
  readonly label: string;
  /** EXACT existing destination (real route + existing filter params only). */
  readonly href: string;
};

export type DashboardSearchGroup = {
  readonly source: DashboardSearchSource;
  readonly results: readonly DashboardSearchResult[];
};

/** A source row before matching: label/href plus the searchable haystacks. */
export type DashboardSearchCandidate = DashboardSearchResult & {
  readonly haystacks: readonly (string | null | undefined)[];
};

/**
 * Normalize + bound a raw query. Returns null when the query is too short to
 * search (the finder then shows registry matches only, never an error).
 */
export function normalizeSearchQuery(raw: string): string | null {
  const q = normalizeForSearch(raw.slice(0, DASHBOARD_SEARCH_MAX_QUERY_CHARS));
  return q.length >= DASHBOARD_SEARCH_MIN_QUERY_CHARS ? q : null;
}

/** Plain normalized substring match — same semantics as the command registry. */
export function candidateMatches(
  candidate: DashboardSearchCandidate,
  normalizedQuery: string,
): boolean {
  return candidate.haystacks.some(
    (h) =>
      typeof h === "string" &&
      h.length > 0 &&
      normalizeForSearch(h).includes(normalizedQuery),
  );
}

/** Filter + bound one source's candidates into a group (per-source limit). */
export function buildSearchGroup(
  source: DashboardSearchSource,
  candidates: readonly DashboardSearchCandidate[],
  normalizedQuery: string,
): DashboardSearchGroup {
  const results = candidates
    .filter((c) => candidateMatches(c, normalizedQuery))
    .slice(0, DASHBOARD_SEARCH_PER_SOURCE_LIMIT)
    .map(({ id, label, href }) => ({ id, label, href }));
  return { source, results };
}

/**
 * Final bound: drop empty groups, keep the catalogue order, and enforce the
 * total cap across all groups.
 */
export function boundSearchGroups(
  groups: readonly DashboardSearchGroup[],
): readonly DashboardSearchGroup[] {
  const bounded: DashboardSearchGroup[] = [];
  let total = 0;
  for (const source of DASHBOARD_SEARCH_SOURCES) {
    const group = groups.find((g) => g.source === source);
    if (!group || group.results.length === 0) continue;
    const room = DASHBOARD_SEARCH_MAX_TOTAL_RESULTS - total;
    if (room <= 0) break;
    const results = group.results.slice(
      0,
      Math.min(room, DASHBOARD_SEARCH_PER_SOURCE_LIMIT),
    );
    total += results.length;
    bounded.push({ source: group.source, results });
  }
  return bounded;
}
