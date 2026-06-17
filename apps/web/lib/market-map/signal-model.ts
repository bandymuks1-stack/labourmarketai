/**
 * Market Map read layer — PURE signal model + visibility/aggregation engine.
 *
 * Side-effect-free: no DB, no server-only. This is the reviewable, fully
 * unit-tested core. The owner-scoped fetcher (./signals.ts) feeds it real rows;
 * a future owner-gated cross-user source can feed it too, unchanged.
 *
 * Rules encoded here:
 *   - private / self_only never leave the owner's own view;
 *   - login signals reach shared output ONLY when consent_status = 'consented'
 *     (revoked / not_requested are excluded);
 *   - shared output is AGGREGATED with a minimum-bucket threshold so small
 *     regions can't de-anonymise an individual;
 *   - region_visible / city_visible control how precise a shared bucket may be;
 *   - admin_only is for admin/internal diagnostics only;
 *   - exact location (can_show_exact) is never set on shared/aggregated output.
 */

export type SignalType =
  | "profile_location"
  | "company_location"
  | "login_location"
  | "preferred_location"
  | "company_need_location"
  | "project_location";

export type OwnerType = "profile" | "company" | "project" | "demand" | "login";

export type Granularity = "country" | "region" | "city";

export type VisibilityLevel =
  | "private"
  | "self_only"
  | "aggregated"
  | "region_visible"
  | "city_visible"
  | "plan_gated"
  | "company_only"
  | "admin_only";

export interface NormalizedSignal {
  signalId: string;
  signalType: SignalType;
  ownerType: OwnerType;
  /** profile_id / owning profile — used for viewer scoping. null on aggregates. */
  ownerId: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  granularity: Granularity;
  visibilityLevel: VisibilityLevel;
  /** 1 for an individual signal; the bucket size on an aggregate. */
  count: number;
  /** Set only on aggregated signals (else null). */
  aggregatedCount: number | null;
  /** Whether an exact point may be shown. Never true on shared/aggregated output. */
  canShowExact: boolean;
  /** e.g. consent_status, geocode_status, 'self_declared'. */
  sourceStatus: string;
  updatedAt: string | null;
}

export interface Viewer {
  /** The viewing user's profile id (null = anonymous / public). */
  profileId: string | null;
  isAdmin: boolean;
}

/** Minimum rows in a bucket before it may be shown in aggregated output. */
export const DEFAULT_MIN_BUCKET = 3;

/** Visibility levels that may EVER appear in shared (non-owner) output. */
const SHAREABLE: ReadonlySet<VisibilityLevel> = new Set<VisibilityLevel>([
  "aggregated",
  "region_visible",
  "city_visible",
]);

/**
 * The owner's own "my signals" view: every signal the viewer owns (regardless
 * of visibility), plus — for an admin — admin_only diagnostics. Nothing here
 * leaks another user's private/self_only data.
 */
export function selfSignalsForViewer(
  signals: readonly NormalizedSignal[],
  viewer: Viewer,
): NormalizedSignal[] {
  return signals.filter((s) => {
    if (viewer.profileId && s.ownerId === viewer.profileId) return true;
    if (viewer.isAdmin) return true; // admin diagnostic view
    return false;
  });
}

/** Whether a single signal is eligible for shared (market) output at all. */
export function isShareable(s: NormalizedSignal): boolean {
  if (!SHAREABLE.has(s.visibilityLevel)) return false;
  // Login location only shares once explicitly consented.
  if (s.signalType === "login_location" && s.sourceStatus !== "consented") {
    return false;
  }
  // A shareable signal must at least have a country to bucket on.
  return !!s.country;
}

/** The granularity a shareable signal may be bucketed at, capped by visibility. */
function shareableGranularity(s: NormalizedSignal): Granularity {
  if (s.visibilityLevel === "city_visible" && s.city) return "city";
  if (s.visibilityLevel === "region_visible" && s.region) return "region";
  return "country";
}

function bucketKey(s: NormalizedSignal, g: Granularity): string {
  const parts = [s.signalType, s.country ?? ""];
  if (g === "region" || g === "city") parts.push(s.region ?? "");
  if (g === "city") parts.push(s.city ?? "");
  return parts.join("|");
}

/**
 * Aggregate shareable signals into anonymised buckets. A bucket is emitted only
 * when it has at least `minBucket` rows (so a single person can't be singled
 * out). Aggregates carry no ownerId and never allow an exact point.
 */
export function aggregateSignals(
  signals: readonly NormalizedSignal[],
  minBucket: number = DEFAULT_MIN_BUCKET,
): NormalizedSignal[] {
  const buckets = new Map<
    string,
    { rows: NormalizedSignal[]; g: Granularity; sample: NormalizedSignal }
  >();
  for (const s of signals) {
    if (!isShareable(s)) continue;
    const g = shareableGranularity(s);
    const key = bucketKey(s, g);
    const b = buckets.get(key);
    if (b) b.rows.push(s);
    else buckets.set(key, { rows: [s], g, sample: s });
  }

  const out: NormalizedSignal[] = [];
  for (const [key, b] of buckets) {
    if (b.rows.length < minBucket) continue; // min-bucket threshold
    const s = b.sample;
    out.push({
      signalId: `agg:${key}`,
      signalType: s.signalType,
      ownerType: s.ownerType,
      ownerId: null,
      country: s.country,
      region: b.g === "region" || b.g === "city" ? s.region : null,
      city: b.g === "city" ? s.city : null,
      granularity: b.g,
      visibilityLevel: "aggregated",
      count: b.rows.length,
      aggregatedCount: b.rows.length,
      canShowExact: false,
      sourceStatus: "aggregated",
      updatedAt: null,
    });
  }
  return out;
}

/**
 * The public/market view: only ever anonymised aggregates that clear the
 * min-bucket threshold. Never an individual, never an exact point, never a
 * private/self_only row, never an unconsented login signal.
 */
export function marketSignals(
  signals: readonly NormalizedSignal[],
  minBucket: number = DEFAULT_MIN_BUCKET,
): NormalizedSignal[] {
  return aggregateSignals(signals, minBucket);
}
