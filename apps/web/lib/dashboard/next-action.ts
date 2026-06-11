/**
 * Role-based "Next Action" decision (slice role-next-action-simplicity-v1).
 *
 * Pure mapping from a user's REAL dashboard state to the single clearest next
 * action: where they are → what to do now → where to click. No DB, no IO, no
 * fake feature — every branch points at a route that actually exists (never a
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
    href: role === "company" ? "/dashboard/company" : "/dashboard/agency",
  };
}

export function customerNextAction(): NextAction {
  return { key: "customer_requests", href: "/dashboard/buyer" };
}
