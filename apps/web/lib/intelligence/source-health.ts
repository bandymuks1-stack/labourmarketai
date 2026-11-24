/**
 * Intelligence SOURCE HEALTH model (Source Readiness v1).
 *
 * The one deterministic mapping from RECORDED facts (governance lifecycle
 * + the last import-session outcomes) to the health state a user sees.
 * Nothing here probes anything — reachability and failures are facts a
 * future import runtime records; absence of signals is honestly "unknown",
 * never optimistically "healthy".
 *
 * Precedence (first match wins — restrictive facts dominate):
 *   1. lifecycle blocked                      → blocked
 *   2. maintenance flag                       → maintenance
 *   3. lifecycle paused                       → paused
 *   4. lifecycle proposed/approved            → waiting_approval
 *   5. lifecycle deprecated / not_available   → offline
 *   6. (active) reachable === false           → offline
 *   7. (active) failures ≥ 3 or last failed   → error
 *   8. (active) last session success/partial  → healthy
 *   9. (active) no recorded signals           → unknown
 *
 * i18n codes only. Pure module: no IO, no Date.now.
 */
import type { SourceLifecycleState } from "./source-lifecycle";

export const SOURCE_HEALTH_STATES = [
  "offline",
  "waiting_approval",
  "paused",
  "healthy",
  "error",
  "blocked",
  "maintenance",
  "unknown",
] as const;
export type SourceHealthState = (typeof SOURCE_HEALTH_STATES)[number];

/** Consecutive failed sessions after which a source is in "error". */
export const SOURCE_HEALTH_ERROR_THRESHOLD = 3;

export interface SourceHealthSignalsV1 {
  readonly lifecycle: SourceLifecycleState;
  /** Outcome of the most recent import session, or null (none recorded). */
  readonly lastSessionOutcome: "success" | "partial" | "failed" | null;
  /** Recorded consecutive failed sessions, or null (never measured). */
  readonly consecutiveFailures: number | null;
  /** Operator-set maintenance window flag. */
  readonly maintenance?: boolean;
  /** Recorded reachability fact from the last attempt — never probed here. */
  readonly reachable?: boolean | null;
}

export function deriveSourceHealth(
  signals: SourceHealthSignalsV1,
): SourceHealthState {
  if (signals.lifecycle === "blocked") return "blocked";
  if (signals.maintenance === true) return "maintenance";
  if (signals.lifecycle === "paused") return "paused";
  if (signals.lifecycle === "proposed" || signals.lifecycle === "approved") {
    return "waiting_approval";
  }
  if (
    signals.lifecycle === "deprecated" ||
    signals.lifecycle === "not_available"
  ) {
    return "offline";
  }
  // lifecycle === "active" from here on.
  if (signals.reachable === false) return "offline";
  if (
    (signals.consecutiveFailures ?? 0) >= SOURCE_HEALTH_ERROR_THRESHOLD ||
    signals.lastSessionOutcome === "failed"
  ) {
    return "error";
  }
  if (
    signals.lastSessionOutcome === "success" ||
    signals.lastSessionOutcome === "partial"
  ) {
    return "healthy";
  }
  // Active but nothing recorded yet — honest unknown, never assumed healthy.
  return "unknown";
}

/** Stable i18n code for a health state (`intelligence.health.*`). */
const HEALTH_LEAF: Record<SourceHealthState, string> = {
  offline: "offline",
  waiting_approval: "waitingApproval",
  paused: "paused",
  healthy: "healthy",
  error: "error",
  blocked: "blocked",
  maintenance: "maintenance",
  unknown: "unknown",
};

export function sourceHealthLabelCode(state: SourceHealthState): string {
  return `intelligence.health.${HEALTH_LEAF[state]}`;
}
