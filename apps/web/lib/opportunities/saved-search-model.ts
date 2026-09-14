import {
  EMPTY_DISCOVERY_FILTERS,
  applyDiscoveryFilters,
  type DiscoveryFilterState,
} from "@/lib/opportunities/discovery-filters";
import type { OpportunityNeed } from "@/lib/opportunities/opportunity-fit";

/**
 * A SAVED QUESTION, AND WHAT IS NEW IN ITS ANSWER — the pure half of DEM-8.
 *
 * The register's words for the gap: "Bookmarks exist; a recurring query that
 * notifies does not." `worker_saved_opportunities` remembers one opportunity
 * a worker already found; nothing remembered the QUESTION.
 *
 * ── THE MATCHING IS THE BOARD'S, NOT A SECOND ONE ──────────────────────────
 *
 * `applyDiscoveryFilters` is imported, never reimplemented. A saved search is
 * the same filter state the board already applies, kept — so what a worker
 * sees when they open a saved search is by construction what the alert
 * counted, and the two cannot drift into disagreeing about the same demand.
 *
 * It also means the matching runs over the cards the WORKER'S OWN read
 * returned, under their own authorization. Nothing here reads demand, and a
 * saved search stores no demand facts, so it can never show a stale title or
 * a closed vacancy.
 *
 * ── "NEW" IS UNKNOWN UNTIL A DATE SAYS OTHERWISE (SEP-7) ───────────────────
 *
 * `newSinceSeen` is null — not zero — when the board rows carry no creation
 * date to compare against. A zero would tell a worker "nothing new since you
 * looked", which is a claim, and the product would be making it on no
 * evidence. Null renders as nothing at all.
 *
 * PURE. No IO, no clock.
 */

/** The seven discovery dimensions, exactly as the DB CHECK constrains them. */
export const SAVED_SEARCH_CRITERIA_KEYS = [
  "profession",
  "country",
  "start",
  "accommodation",
  "transport",
  "tool",
  "opportunityType",
] as const;
export type SavedSearchCriteriaKey = (typeof SAVED_SEARCH_CRITERIA_KEYS)[number];

/** Bound mirrored from the write RPC, so the UI can stop before the DB does. */
export const SAVED_SEARCH_LIMIT = 20;
export const SAVED_SEARCH_LABEL_MAX = 80;

export interface SavedSearch {
  readonly id: string;
  readonly label: string;
  readonly criteria: DiscoveryFilterState;
  readonly notify: boolean;
  readonly lastSeenAt: string | null;
}

export interface SavedSearchReading extends SavedSearch {
  /** Matches among the cards the worker's own board read returned. */
  readonly matchCount: number;
  /**
   * Matches created since the worker last looked. Null when it cannot be
   * known — no dates on the cards. Never a zero standing in for that.
   * When the worker has never looked, everything that matches is new.
   */
  readonly newSinceSeen: number | null;
}

/**
 * Narrow an arbitrary stored object to the seven known dimensions.
 *
 * The database rejects an eighth key, so this is not the security boundary —
 * it is the type boundary, and it exists so a row written before a future
 * schema change cannot arrive as an unexpected shape.
 */
export function toDiscoveryFilterState(raw: unknown): DiscoveryFilterState {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, string | null> = { ...EMPTY_DISCOVERY_FILTERS };
  for (const key of SAVED_SEARCH_CRITERIA_KEYS) {
    const value = source[key];
    out[key] = typeof value === "string" && value.trim() !== "" ? value : null;
  }
  return out as unknown as DiscoveryFilterState;
}

/** The stored shape: only the dimensions that are actually set. */
export function toStoredCriteria(
  filters: DiscoveryFilterState,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of SAVED_SEARCH_CRITERIA_KEYS) {
    const value = (filters as unknown as Record<string, string | null>)[key];
    if (typeof value === "string" && value.trim() !== "") out[key] = value;
  }
  return out;
}

/** True when there is a question here at all — an empty filter state is not
 *  one, and saving it would create a search that matches the whole board. */
export function hasAnyCriteria(filters: DiscoveryFilterState): boolean {
  return Object.keys(toStoredCriteria(filters)).length > 0;
}

/**
 * Read each saved search against the cards the worker's own board read
 * returned.
 */
export function readSavedSearches<T extends { readonly need: OpportunityNeed }>(
  searches: readonly SavedSearch[],
  cards: readonly T[],
): readonly SavedSearchReading[] {
  return searches.map((search) => {
    const matches = applyDiscoveryFilters(cards, search.criteria);
    // One undated match is enough to make the whole count unknowable: we
    // cannot say "3 new" while a fourth might also be new.
    const anyUndated = matches.some((c) => !c.need.createdAt);
    const newSinceSeen = anyUndated
      ? null
      : search.lastSeenAt === null
        ? matches.length
        : matches.filter((c) => (c.need.createdAt as string) > (search.lastSeenAt as string))
            .length;
    return { ...search, matchCount: matches.length, newSinceSeen };
  });
}

/** The searches an alert should be emitted for: the worker asked to hear, and
 *  there is something they have not seen. Null (unknown) never qualifies. */
export function alertableSearches(
  readings: readonly SavedSearchReading[],
): readonly SavedSearchReading[] {
  return readings.filter((r) => r.notify && (r.newSinceSeen ?? 0) > 0);
}

/**
 * The board link that re-asks a saved question.
 *
 * Built from the stored criteria every time, never stored: a href kept
 * alongside the criteria would be the same question written down twice, and
 * the day the board's param names change one of the two copies would start
 * pointing somewhere else.
 */
export function savedSearchHref(basePath: string, criteria: DiscoveryFilterState): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(toStoredCriteria(criteria))) {
    params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
