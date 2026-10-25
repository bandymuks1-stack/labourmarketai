import type { DiscoverabilityStatus } from "@/lib/privacy/discoverability-actions";

/**
 * WHICH SCREEN the employer-visibility consent shows — the one decision
 * `components/app/discoverability-consent.tsx` renders from, kept pure so the
 * round trips are pinned by a unit test.
 *
 * TWO SCREENS, ONE TAP EACH (owner goal 2026-10-24, "matchability"):
 *  - `granted` — the status says ON and the switch-off button is right there;
 *  - `choice`  — the status says OFF, the full versioned consent text is
 *                already on screen and the grant / "not now" buttons sit under
 *                it, so turning visibility on is ONE tap after reading.
 *
 * THE LAST CONFIRMED STATE IS KEPT APART FROM THE REQUEST STATE (#2730 review).
 * `status` is the server read the component was rendered with — and some doors
 * never refresh it (the conversation keeps an embed's first props).
 * `confirmed` is the outcome of the last SUCCESSFUL grant / withdrawal in this
 * session; a failed request never touches it. So "granted → withdraw OK →
 * grant FAILS" stays on the OFF screen (the truth: the profile is hidden) with
 * its grant button for a retry, instead of falling back to the stale
 * "granted" read and claiming the person is visible.
 *
 * There used to be a third, `withdrawn`, screen whose "manage" button had to
 * be pressed before the choice reappeared: a withdrawal now lands on the
 * choice screen directly — the way back is as short as the way out.
 */
export type DiscoverabilityPhase = "idle" | "declined" | "needs-migration" | "error";

/** The outcome of the last successful write in this session, if any. */
export type ConfirmedVisibility = "on" | "off" | null;

export type DiscoverabilityScreen = "granted" | "choice" | "pending";

export function discoverabilityScreen(input: {
  status: DiscoverabilityStatus;
  confirmed: ConfirmedVisibility;
}): DiscoverabilityScreen {
  const { status, confirmed } = input;
  // A successful write in this session wins over a read that may be stale.
  if (confirmed === "on") return "granted";
  if (confirmed === "off") return "choice";
  // Only a CURRENT-version grant is ON — the same rule as the RLS predicate
  // `worker_profile_discoverable`. Never decided, withdrawn and a grant under a
  // superseded text are all OFF: the choice screen.
  // The free-worker DEFAULT in force (20261025100000) is ON too: the screen
  // shows the switch-off, never a consent to something already on.
  if (status === "granted" || status === "default_on") return "granted";
  // The default is coming (an existing account's notice period): not visible
  // yet, and the person can object before it starts.
  if (status === "default_pending") return "pending";
  return "choice";
}
