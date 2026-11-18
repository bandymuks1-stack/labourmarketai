/**
 * Work-review on acceptance — which acceptances may carry it (pure half).
 *
 * OWNER DECISION (2026-10-12, decision 1): a manager's review of an employee's
 * recorded work may switch on by itself ONLY in a clear work relationship the
 * employee understands, with an auditable acceptance fact, organization
 * isolation, and a manager's manual switch-off always preserved.
 *
 * How that is made concrete (follow-up of #2317/#2320, which ran a heuristic on
 * the manager's dashboard — "untouched since creation" and a date cut-off —
 * and was held OFF because only one of the accept paths showed the notice):
 *
 *   1. EVERY surface that accepts a staff invitation shows ONE plain sentence
 *      before the person accepts: the invite page (signed in and signed out),
 *      the addressed signup form, the onboarding finish, the network list and
 *      the chat card. They all decide with `showsStaffReviewNotice` below, so
 *      the sentence and the rule can never disagree.
 *   2. A surface passes `REVIEW_NOTICE_VERSION` to the accept action ONLY when
 *      it rendered the sentence. No version = the acceptance is not proof the
 *      person saw it, and review stays on the manual door.
 *   3. The acceptance fact is written by the PERSON's own session, right after
 *      the accept, through ONE party-gated RPC (`record_staff_review_notice_v1`,
 *      RED migration 20261012190000): it stamps the person's own acceptance row
 *      (version, surface, time — readable by the person and the organization)
 *      and writes an `audit_logs` row. Organization isolation and the
 *      employee-only rule are re-checked in SQL; a manager's earlier manual
 *      choice on that relationship is never overridden; it runs once per
 *      acceptance and never later.
 *   4. Switching review ON is a separate flag (`STAFF_REVIEW_AUTO_ENABLE`):
 *      until every path is proven to record the fact, the RPC records it and
 *      enables nothing.
 */

/** The version of the sentence a surface showed. Bump when the copy's meaning changes. */
export const REVIEW_NOTICE_VERSION = "staff-review-notice-v1";

/**
 * Owner sequence: prove every acceptance path records the fact, THEN switch
 * review on. ON since 2026-10-12 (owner final approval of #2322): production
 * walk run 38298792434 recorded the fact from the invite page, the network
 * list and the chat card (one audit row each, actor = the person, same
 * organization). The addressed-signup and onboarding accepts share the same
 * server action and RPC but are not yet proven with a brand-new account
 * (human check). The SQL door still refuses everything but a fresh, own,
 * newly created employee relationship with no manager choice on record.
 */
export const STAFF_REVIEW_AUTO_ENABLE = true;

/** The surfaces that accept a staff invitation (closed set, mirrored in SQL). */
export const REVIEW_NOTICE_SURFACES = [
  "invite_page",
  "addressed_signup",
  "onboarding",
  "network",
  "conversation",
] as const;
export type ReviewNoticeSurface = (typeof REVIEW_NOTICE_SURFACES)[number];

/** Invitation types whose acceptance creates an `employee` engagement. */
export const STAFF_INVITATION_TYPES: readonly string[] = ["join_organization", "join_team", "join_as_employee"];

/**
 * Does accepting THIS invitation create an `employee` relationship?
 */
export function acceptanceCreatesEmployeeRelationship(input: {
  readonly invitationType: string | null | undefined;
  readonly relationshipSlug: string | null | undefined;
}): boolean {
  if (!input.invitationType || !STAFF_INVITATION_TYPES.includes(input.invitationType)) return false;
  // `join_organization` + a relationship slug (student, intern, volunteer, …)
  // is a different relationship; only the slug-less or explicit employee form is staff.
  return input.relationshipSlug == null || input.relationshipSlug === "employee";
}

/**
 * THE one predicate every accept surface uses to decide whether to show the
 * sentence. It needs the organization's name: the sentence names who may read
 * the work, and a sentence that cannot say who is not shown (the acceptance
 * then carries no version and review stays manual — fail-safe).
 */
export function showsStaffReviewNotice(input: {
  readonly invitationType: string | null | undefined;
  readonly relationshipSlug: string | null | undefined;
  readonly organizationName: string | null | undefined;
}): boolean {
  return Boolean(input.organizationName?.trim()) && acceptanceCreatesEmployeeRelationship(input);
}

/**
 * The version an accept action may forward: only the exact current version,
 * never whatever a client sent.
 */
export function acceptedReviewNotice(value: unknown): typeof REVIEW_NOTICE_VERSION | null {
  return value === REVIEW_NOTICE_VERSION ? REVIEW_NOTICE_VERSION : null;
}

/** What the RPC answered, as the app reads it. */
export type StaffReviewNoticeOutcome =
  | "recorded"
  | "review_enabled"
  | "already_on"
  | "manual_choice_kept"
  | "already_recorded"
  | "not_applicable"
  | "too_late"
  | "not_found"
  | "invalid"
  | "not_enabled"
  | "error";

const KNOWN_OUTCOMES: ReadonlySet<string> = new Set<StaffReviewNoticeOutcome>([
  "recorded",
  "review_enabled",
  "already_on",
  "manual_choice_kept",
  "already_recorded",
  "not_applicable",
  "too_late",
  "not_found",
  "invalid",
]);

export function readStaffReviewNoticeOutcome(data: unknown): StaffReviewNoticeOutcome {
  const outcome = (data as { outcome?: unknown } | null)?.outcome;
  return typeof outcome === "string" && KNOWN_OUTCOMES.has(outcome) ? (outcome as StaffReviewNoticeOutcome) : "error";
}
