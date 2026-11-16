/**
 * What the organization's first screen says about work waiting for its approval. Pure.
 *
 * "Nothing waits" has three different reasons, and a director looking for hours to
 * approve needs to tell them apart: nobody recorded work, the people who could record
 * it have approval switched off, or the only recorded work is the director's own. The
 * last two read exactly like a missing feature when the screen just says nothing waits.
 *
 * UNKNOWN IS NOT ZERO (SEP-7): a failed read says so, or leaves its line out. It never
 * becomes "nothing waits".
 */
export type OrganizationEmployeeReview = {
  /** Active employees of the organization, not counting the reader. */
  readonly total: number;
  /** Those whose work cannot reach the queue: approval is off for them. */
  readonly reviewOff: number;
};

export type OrganizationApprovalsFacts = {
  /** The gated reviewable set's size. Null: the read failed. */
  readonly pending: number | null;
  /** Null: the read failed. */
  readonly employees: OrganizationEmployeeReview | null;
  /** The reader's own entries no one else confirmed. Null: the read failed. */
  readonly ownUnconfirmed: number | null;
  /** Does someone else here hold a reviewer relationship? Null: the reader can't tell. */
  readonly otherReviewer: boolean | null;
};

export type OrganizationApprovalsView = {
  readonly state: "unreadable" | "waiting" | "empty";
  /** Say it only when the employee read answered and found nobody. */
  readonly noEmployees: boolean;
  /** Employees with approval off, with the door to switch it on. Null: no such line. */
  readonly reviewOff: OrganizationEmployeeReview | null;
  /** The reader's own unconfirmed entries, which this queue never lists. */
  readonly ownUnconfirmed: number;
  /** Never assumed: a small owner may be the only one who could confirm anything. */
  readonly otherReviewer: boolean | null;
};

export function organizationApprovalsView(facts: OrganizationApprovalsFacts): OrganizationApprovalsView {
  const { pending, employees, ownUnconfirmed, otherReviewer } = facts;
  return {
    state: pending === null ? "unreadable" : pending > 0 ? "waiting" : "empty",
    noEmployees: employees?.total === 0,
    reviewOff: employees && employees.reviewOff > 0 ? employees : null,
    ownUnconfirmed: ownUnconfirmed ?? 0,
    otherReviewer,
  };
}
