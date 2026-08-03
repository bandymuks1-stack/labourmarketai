import "server-only";

import { getSessionProfile } from "@/lib/auth/session-profile";
import { baseIdentityForRole } from "@/lib/config/roles";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import { PERSONAL_WORKSPACE_ID } from "@/lib/company/organization-switch";
import { getWorkerActivity } from "@/lib/conversation/worker-activity";
import { getWorkerPlayerCard } from "@/lib/player-card/player-card";
import { deriveWorkerReadiness } from "@/lib/player-card/readiness";

import {
  derivePersonalWorkspaceIntro,
  type PersonalWorkspaceIntro,
} from "./personal-workspace-intro";

/**
 * The ONE server read behind "Mano erdvė" (S2).
 *
 * Every fact comes from a reader that already exists and is already
 * request-cached (`cache()`), so mounting the intro on the conversation-first
 * home adds no new query path and no new round-trip on a screen that already
 * renders for this user:
 *
 *   who      → getSessionProfile()            (shared with the layout + card)
 *   where    → getWorkspaceContext()          (the workspace chip's resolver)
 *   is-worker→ getWorkerActivity()            (the chat's own honest check)
 *   readiness→ deriveWorkerReadiness(card)    (the ONE readiness model)
 *
 * Nothing is derived here — the pure model decides. Any failure degrades to a
 * hidden or `unavailable` block; a raw error never reaches the screen.
 */
export async function loadPersonalWorkspaceIntro(): Promise<PersonalWorkspaceIntro> {
  try {
    const session = await getSessionProfile();
    if (!session.user) {
      return { kind: "hidden", reason: "signed-out" };
    }

    const identity = baseIdentityForRole(session.profile?.active_role ?? "worker");
    const workspace = await getWorkspaceContext(identity);
    const workspaceKind =
      workspace.activeWorkspaceId === PERSONAL_WORKSPACE_ID
        ? "personal"
        : "organization";

    // Cheap exit BEFORE the readiness reads: an organization context and a
    // non-person identity never render personal readiness, so they must not
    // pay for it either.
    if (workspaceKind === "organization" || identity !== "person") {
      return derivePersonalWorkspaceIntro({
        identity,
        workspaceKind,
        signedIn: true,
        hasWorkerProfile: false,
        readiness: null,
        displayName: null,
      });
    }

    const [activity, card] = await Promise.all([
      getWorkerActivity(session.user.id),
      getWorkerPlayerCard(),
    ]);

    return derivePersonalWorkspaceIntro({
      identity,
      workspaceKind,
      signedIn: true,
      hasWorkerProfile: activity.hasWorkerProfile,
      readiness: card ? deriveWorkerReadiness(card) : null,
      displayName: session.profile?.full_name?.trim() || null,
    });
  } catch {
    // Honest degradation: the first screen keeps its conversation, the
    // personal block simply does not appear. No raw read failure is ever
    // rendered as product copy.
    return { kind: "hidden", reason: "no-worker-profile" };
  }
}
