/**
 * Compare model for the worker opportunities board (P2-PR5).
 *
 * Pure module: the CLOSED whitelist of facts a side-by-side comparison may
 * show, and the normalizer that guarantees a compare column contains EXACTLY
 * those keys — every value either a stated, already-localized fact string or
 * the honest localized "not stated" fallback. No score, no ranking, no
 * popularity, no fabricated values: comparing never invents a fact the
 * company did not state (fit-not-rating doctrine).
 *
 * Compare is PURE CLIENT STATE over already-loaded, already-authorized board
 * rows — nothing is persisted, nothing is fetched (guard-pinned).
 */

export const COMPARE_FACT_KEYS = [
  "pay",
  "hours",
  "start",
  "engagement",
  "accommodation",
  "transport",
  "tools",
  "languages",
  "location",
  "company",
] as const;

export type CompareFactKey = (typeof COMPARE_FACT_KEYS)[number];

/** How many cards can be compared at once (2..3 — a table, not a spreadsheet). */
export const COMPARE_MIN = 2;
export const COMPARE_MAX = 3;

export interface CompareEntry {
  /** The demand's request id (selection identity). */
  readonly id: string;
  /** Column header — the localized role label. */
  readonly title: string;
  /** Exactly the whitelisted fact keys, each a non-empty display string. */
  readonly facts: Readonly<Record<CompareFactKey, string>>;
}

/**
 * Normalize a partial fact bag into the full whitelisted record. Unknown keys
 * are DROPPED (they can never render); missing/empty/"—" values become the
 * localized `notStated` string — an honesty gap stays visible, never blank.
 */
export function completeCompareFacts(
  partial: Readonly<Partial<Record<CompareFactKey, string | null | undefined>>>,
  notStated: string,
): Record<CompareFactKey, string> {
  const out = {} as Record<CompareFactKey, string>;
  for (const key of COMPARE_FACT_KEYS) {
    const value = partial[key];
    out[key] =
      typeof value === "string" && value.trim() !== "" && value.trim() !== "—"
        ? value
        : notStated;
  }
  return out;
}
