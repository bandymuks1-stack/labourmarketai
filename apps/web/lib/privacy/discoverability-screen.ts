import type { DiscoverabilityStatus } from "@/lib/privacy/discoverability-actions";

/**
 * WHICH SCREEN the employer-visibility consent shows — the one decision
 * `components/app/discoverability-consent.tsx` renders from, kept pure so the
 * round trip "withdraw → turn it back on" is pinned by a unit test.
 *
 * The defect this exists for: after a withdrawal the component kept choosing
 * the WITHDRAWN screen for as long as the stored status said "withdrawn", so
 * its "manage" button only hid itself — the grant button never appeared and
 * the person could not turn visibility back on from the very screen that let
 * them turn it off. `reopened` is that button: the person asked to decide
 * again, so the choice screen (with both equal buttons) is shown even though
 * the stored status is still "withdrawn".
 */
export type DiscoverabilityPhase =
  | "idle"
  | "expanded"
  | "declined"
  | "done"
  | "withdrawn"
  | "needs-migration"
  | "error";

export type DiscoverabilityScreen = "granted" | "withdrawn" | "choice";

export function discoverabilityScreen(input: {
  status: DiscoverabilityStatus;
  phase: DiscoverabilityPhase;
  reopened: boolean;
}): DiscoverabilityScreen {
  const { status, phase, reopened } = input;
  // A grant made in this session wins over a stored status that is not
  // refreshed yet.
  if (phase === "done") return "granted";
  // The person reopened the decision: show the choice again.
  if (reopened) return "choice";
  if (phase === "withdrawn") return "withdrawn";
  if (status === "granted") return "granted";
  if (status === "withdrawn") return "withdrawn";
  return "choice";
}
