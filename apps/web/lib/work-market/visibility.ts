/**
 * Work Market Atlas — map visibility scaling policy.
 *
 * Map visibility changes with platform scale so an early, small network can
 * show everyone, while a large network protects signal quality and privacy.
 * This is a POLICY MODEL only — no billing integration, no fake paid claim.
 * Paid/verified/business unlocks are expressed as policy intent that takes
 * effect only when a real plan exists; until then they are inert.
 *
 * Pure, deterministic, no DB, no external references.
 */

/** Map visibility scopes, widest → narrowest. */
export type VisibilityScope =
  | "full_network_preview"
  | "own_country"
  | "own_region"
  | "own_city"
  | "own_signals_only"
  | "matched_only"
  | "admin_full";

/** Below this active-user count, the network is small enough to preview fully. */
export const FULL_PREVIEW_USER_THRESHOLD = 1000;

export type VisibilityInput = {
  totalActiveUsers: number;
  identity: "person" | "company" | "admin";
  /** Real plan tier — only honoured when billing is actually live. */
  planTier?: "free" | "verified" | "business" | null;
  /** Whether the worker/company has verified readiness. */
  verified?: boolean;
  /** True ONLY when a real billing/plan path is active. Default false. */
  billingLive?: boolean;
};

/**
 * Resolve the visibility scope for a user.
 *
 *  - Admin always sees the full network.
 *  - Below the 1000-user threshold, everyone gets the full network preview
 *    (the honest early-network state).
 *  - Above the threshold, free users are limited (starting at own_country),
 *    and verified/business/paid unlock wider scopes ONLY when billing is live.
 */
export function resolveVisibilityScope(input: VisibilityInput): VisibilityScope {
  if (input.identity === "admin") return "admin_full";

  if (input.totalActiveUsers < FULL_PREVIEW_USER_THRESHOLD) {
    return "full_network_preview";
  }

  // Large network. Paid/verified widen scope ONLY when billing is truly live.
  if (input.billingLive) {
    if (input.planTier === "business") return "own_region";
    if (input.planTier === "verified" || input.verified) return "own_country";
  }

  // Default limited free scope above the threshold.
  return "own_country";
}

/** Is the resolved scope the unrestricted early-network preview? */
export function isFullPreview(scope: VisibilityScope): boolean {
  return scope === "full_network_preview" || scope === "admin_full";
}

/** Honest guard: a paid unlock may NEVER apply unless billing is live. Returns
 *  true when a claim of paid widening would be fake. */
export function wouldBeFakePaidUnlock(input: VisibilityInput): boolean {
  return !input.billingLive && (input.planTier === "verified" || input.planTier === "business");
}
