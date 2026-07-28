/**
 * THE canonical next-action resolver (canonical-user-journey v1).
 *
 * Every "what should this user do next?" decision lives here (or in the one
 * named exception below):
 *   - Dashboard role actions: `workerNextAction` / `managerNextAction` /
 *     `customerNextAction` (slice role-next-action-simplicity-v1).
 *   - Profile hub's ONE primary action: `deriveProfileNextAction` (folded in
 *     from the former lib/profile/profile-next-action.ts).
 *   - The dashboard TOP-SLOT priority ladder stays in
 *     `lib/dashboard/top-slot.ts` (it ranks cross-surface events, not role
 *     state) — that is the only other next-action module.
 *
 * The duplicate engines were removed as orphans (canonical-user-journey v1):
 * lib/worker/next-action-engine.ts + today-screen, lib/dashboard/my-work-view,
 * and lib/process-brain/profile-process-brain. Do not reintroduce competing
 * "next step" resolvers — extend this module instead.
 *
 * Pure mapping from a user's REAL state to the single clearest next action:
 * where they are → what to do now → where to click. No DB, no IO, no fake
 * feature — every branch points at a route that actually exists (never a
 * dead/placeholder target), and the honest neutral action is used when there
 * is nothing pending.
 *
 * The component renders i18n copy keyed by `key`; this module only decides
 * which action and which (real) href.
 */

export type NextActionKey =
  | "worker_complete_profile"
  | "worker_first_entry"
  | "worker_waiting"
  | "worker_all_confirmed"
  | "manager_review_pending"
  | "manager_invite"
  | "customer_requests";

export interface NextAction {
  readonly key: NextActionKey;
  /** A route that really exists in the app — never a dead/placeholder target. */
  readonly href: string;
}

/** Worker state derived from real counts (profession+skills, entries, and how
 *  many of those entries a human has actually confirmed). */
export interface WorkerState {
  readonly hasProfile: boolean;
  readonly entriesTotal: number;
  readonly confirmedCount: number;
}

export function workerNextAction(s: WorkerState): NextAction {
  // a) profile not built yet → complete the profile
  if (!s.hasProfile) {
    return { key: "worker_complete_profile", href: "/dashboard/profile" };
  }
  // b) no journal entries yet → create the first one
  if (s.entriesTotal <= 0) {
    return { key: "worker_first_entry", href: "/dashboard/journal" };
  }
  // c) entries exist but not all are confirmed → some are waiting on a human
  if (s.confirmedCount < s.entriesTotal) {
    return { key: "worker_waiting", href: "/dashboard/journal" };
  }
  // d) everything confirmed → keep the record growing
  return { key: "worker_all_confirmed", href: "/dashboard/journal" };
}

export function managerNextAction(
  role: "company" | "agency",
  pendingReview: number,
): NextAction {
  // a) real entries waiting for this reviewer → review them
  if (pendingReview > 0) {
    return { key: "manager_review_pending", href: "/dashboard/inbox" };
  }
  // b) nothing waiting → honest neutral action that really exists: go to the
  // workspace where the owner invites a worker / sees their team.
  return {
    key: "manager_invite",
    href: "/dashboard/company",
  };
}

export function customerNextAction(): NextAction {
  return { key: "customer_requests", href: "/dashboard/buyer" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile hub's one action — folded into the canonical next-action module
// (canonical-user-journey v1).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Profile "one next action" — deterministic, real-signal helper (v1).
 *
 * The single source of truth for the profile hub's ONE primary action. Pure:
 * same signals → same action. No AI, no network, no randomness — just a fixed
 * priority over real saved-profile signals. This unifies the "what should I do
 * next?" logic into one tested function so the hub never grows competing CTAs.
 *
 * Priority:
 *   1. Missing the basics (no CV/about, or no declared skills) → finish the
 *      profile (anchors to the in-page editor).
 *   2. A worker who HAS declared skills but none are yet backed by work-journal
 *      evidence → go add work-journal evidence (the canonical journal route).
 *   3. Otherwise → keep refining the profile.
 */

export type ProfileNextAction = {
  /** i18n key under `profileHub` for the action label. */
  labelKey: "primaryAction" | "primaryActionJournal";
  /** Existing canonical destination — in-page editor anchor or journal route. */
  href: "#profile-edit" | "/dashboard/journal";
};

export type ProfileNextActionSignals = {
  cvProvided: boolean;
  selfDeclaredCount: number;
  hasWorker: boolean;
  /** Declared skills with no work-journal evidence backing yet. */
  unsupportedSkillCount: number;
};

const COMPLETE: ProfileNextAction = {
  labelKey: "primaryAction",
  href: "#profile-edit",
};
const ADD_JOURNAL: ProfileNextAction = {
  labelKey: "primaryActionJournal",
  href: "/dashboard/journal",
};

export function deriveProfileNextAction(
  s: ProfileNextActionSignals,
): ProfileNextAction {
  // 1. Basics first.
  if (!s.cvProvided || s.selfDeclaredCount === 0) return COMPLETE;
  // 2. Skills exist but lack work-journal evidence → point to the journal.
  if (s.hasWorker && s.unsupportedSkillCount > 0) return ADD_JOURNAL;
  // 3. Otherwise keep refining the profile.
  return COMPLETE;
}
