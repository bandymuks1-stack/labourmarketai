import type { DiscoverabilityStatus } from "@/lib/privacy/discoverability-actions";

/**
 * WHICH SCREEN the employer-visibility consent shows — the one decision
 * `components/app/discoverability-consent.tsx` renders from, kept pure so the
 * round trip "switch off → switch on again" is pinned by a unit test.
 *
 * TWO SCREENS, ONE TAP EACH (owner goal 2026-10-24, "matchability"):
 *  - `granted` — the status says ON and the switch-off button is right there;
 *  - `choice`  — the status says OFF, the full versioned consent text is
 *                already on screen and the grant / "not now" buttons sit under
 *                it, so turning visibility on is ONE tap after reading.
 *
 * There used to be a third, `withdrawn`, screen whose "manage" button had to
 * be pressed before the choice reappeared (and, before #2656, never did): a
 * person who had switched visibility off needed two or three taps to turn it
 * back on. A withdrawal now lands on the choice screen directly — the way back
 * is as short as the way out. Whether the person just switched it off is the
 * phase's business (the component says so in a status note), not a screen.
 */
export type DiscoverabilityPhase =
  | "idle"
  | "declined"
  | "done"
  | "withdrawn"
  | "needs-migration"
  | "error";

export type DiscoverabilityScreen = "granted" | "choice";

export function discoverabilityScreen(input: {
  status: DiscoverabilityStatus;
  phase: DiscoverabilityPhase;
}): DiscoverabilityScreen {
  const { status, phase } = input;
  // A grant made in this session wins over a stored status that is not
  // refreshed yet.
  if (phase === "done") return "granted";
  // A withdrawal made in this session wins over a stored "granted" that is not
  // refreshed yet.
  if (phase === "withdrawn") return "choice";
  // Only a CURRENT-version grant is ON — the same rule as the RLS predicate
  // `worker_profile_discoverable`. Never decided, withdrawn and a grant under a
  // superseded text are all OFF: the choice screen.
  return status === "granted" ? "granted" : "choice";
}
