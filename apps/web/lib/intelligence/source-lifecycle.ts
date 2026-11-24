/**
 * Source LIFECYCLE states (Trust Layer v1) — the deterministic mapping from
 * a source's governance facts to the ONE badge state a user sees.
 *
 * States: proposed · approved · active · paused · deprecated · blocked ·
 * not_available. The mapping is a fixed precedence chain over the existing
 * governance profile (./source-governance.ts, unchanged) plus optional
 * runtime facts — nothing here can flip a source on (activation stays an
 * owner decision recorded in the registry; guard-pinned OFF today).
 *
 * Precedence (first match wins — the most restrictive fact dominates):
 *   1. available === false        → not_available
 *   2. deprecated === true        → deprecated
 *   3. legalStatus "refused"      → blocked
 *   4. paused === true            → paused
 *   5. activation "on" AND
 *      (internal OR confirmed)    → active
 *   6. legalStatus "confirmed"    → approved
 *   7. otherwise                  → proposed
 *
 * i18n codes only. Pure module: no IO, no Date.now.
 */
import type { IntelligenceSourceProfile } from "./source-governance";

export const SOURCE_LIFECYCLE_STATES = [
  "proposed",
  "approved",
  "active",
  "paused",
  "deprecated",
  "blocked",
  "not_available",
] as const;
export type SourceLifecycleState = (typeof SOURCE_LIFECYCLE_STATES)[number];

/** Optional runtime facts a future source monitor may supply. All default
 *  to the benign value — absence never manufactures a restriction. */
export interface SourceRuntimeFacts {
  /** False when the source is temporarily unreachable / withdrawn. */
  readonly available?: boolean;
  readonly deprecated?: boolean;
  readonly paused?: boolean;
}

export function deriveSourceLifecycleState(
  profile: Pick<
    IntelligenceSourceProfile,
    "sourceKind" | "legalStatus" | "activation"
  >,
  facts: SourceRuntimeFacts = {},
): SourceLifecycleState {
  if (facts.available === false) return "not_available";
  if (facts.deprecated === true) return "deprecated";
  if (profile.legalStatus === "refused") return "blocked";
  if (facts.paused === true) return "paused";
  if (
    profile.activation === "on" &&
    (profile.sourceKind === "internal_aggregated" ||
      profile.legalStatus === "confirmed")
  ) {
    return "active";
  }
  if (profile.legalStatus === "confirmed") return "approved";
  return "proposed";
}

/** Stable i18n code for a lifecycle state (`intelligence.lifecycle.*`). */
const LIFECYCLE_LEAF: Record<SourceLifecycleState, string> = {
  proposed: "proposed",
  approved: "approved",
  active: "active",
  paused: "paused",
  deprecated: "deprecated",
  blocked: "blocked",
  not_available: "notAvailable",
};

export function sourceLifecycleLabelCode(state: SourceLifecycleState): string {
  return `intelligence.lifecycle.${LIFECYCLE_LEAF[state]}`;
}
