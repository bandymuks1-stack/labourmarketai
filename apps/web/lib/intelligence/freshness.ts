/**
 * Intelligence FRESHNESS layer (Trust Layer v1).
 *
 * Every intelligence object can carry the four honest timestamps
 * (last_updated / observed_at / source_date / computed_at) plus a derived
 * age, and every rendered insight can say plainly how old it is —
 * "updated today", "updated 5 days ago", "outdated" — or admit "unknown"
 * when no timestamp exists. Age is never invented: an unparsable or absent
 * timestamp yields a null age, and the label helper then answers "unknown"
 * rather than optimistically "fresh".
 *
 * Deterministic — the caller supplies `nowMs`, never Date.now() here.
 * i18n: label helpers emit stable codes + params only. Pure module: no IO.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Age (whole days) after which an insight renders as outdated. */
export const FRESHNESS_OUTDATED_AFTER_DAYS = 30;

export interface IntelligenceFreshnessV1 {
  /** When the stored intelligence object itself last changed. */
  readonly lastUpdatedIso: string | null;
  /** When the underlying observation was captured. */
  readonly observedAtIso: string | null;
  /** The date the SOURCE says its figure refers to (e.g. window end). */
  readonly sourceDateIso: string | null;
  /** When the derived insight was computed. */
  readonly computedAtIso: string | null;
  /**
   * Whole days since the freshness anchor (lastUpdated → observedAt →
   * sourceDate → computedAt, first present wins), or null when no anchor
   * parses — the honest "unknown age".
   */
  readonly ageDays: number | null;
}

function parseIsoMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** Whole days between an ISO timestamp and nowMs; null if unparsable.
 *  Small negative ages (clock skew / same-day future) clamp to 0. */
export function computeAgeDays(
  iso: string | null | undefined,
  nowMs: number,
): number | null {
  const ms = parseIsoMs(iso);
  if (ms === null) return null;
  const age = Math.floor((nowMs - ms) / DAY_MS);
  return age < 0 ? 0 : age;
}

export function buildFreshness(
  input: {
    lastUpdatedIso?: string | null;
    observedAtIso?: string | null;
    sourceDateIso?: string | null;
    computedAtIso?: string | null;
  },
  nowMs: number,
): IntelligenceFreshnessV1 {
  const lastUpdatedIso = input.lastUpdatedIso ?? null;
  const observedAtIso = input.observedAtIso ?? null;
  const sourceDateIso = input.sourceDateIso ?? null;
  const computedAtIso = input.computedAtIso ?? null;
  // Anchor preference: the most user-meaningful timestamp that exists.
  const anchor =
    [lastUpdatedIso, observedAtIso, sourceDateIso, computedAtIso].find(
      (iso) => parseIsoMs(iso) !== null,
    ) ?? null;
  return {
    lastUpdatedIso,
    observedAtIso,
    sourceDateIso,
    computedAtIso,
    ageDays: computeAgeDays(anchor, nowMs),
  };
}

// ── Rendering helper ─────────────────────────────────────────────────────────

export interface FreshnessLabel {
  /** Stable i18n code under `intelligence.freshness.*`. */
  readonly code: string;
  readonly params: Readonly<Record<string, number>>;
}

/**
 * Deterministic age → label mapping:
 *   0 → updatedToday · 1 → updatedYesterday · 2..30 → updatedDaysAgo{days}
 *   >30 → outdated{days} · null → unknown (never guessed fresh).
 */
export function freshnessLabel(ageDays: number | null): FreshnessLabel {
  if (ageDays === null || !Number.isFinite(ageDays) || ageDays < 0) {
    return { code: "intelligence.freshness.unknown", params: {} };
  }
  if (ageDays === 0) {
    return { code: "intelligence.freshness.updatedToday", params: {} };
  }
  if (ageDays === 1) {
    return { code: "intelligence.freshness.updatedYesterday", params: {} };
  }
  if (ageDays <= FRESHNESS_OUTDATED_AFTER_DAYS) {
    return {
      code: "intelligence.freshness.updatedDaysAgo",
      params: { days: ageDays },
    };
  }
  return { code: "intelligence.freshness.outdated", params: { days: ageDays } };
}
