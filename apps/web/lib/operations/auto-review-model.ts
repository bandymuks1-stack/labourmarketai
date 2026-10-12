/**
 * Work-review auto-enable — which employee relationships qualify (pure half).
 *
 * OWNER DECISION (2026-10-12, decision 1): a manager's review of an employee's
 * recorded work may switch on by itself ONLY in a clear work relationship the
 * employee understands, keeping the audit trail and organization isolation.
 *
 * "Clear and understood" is made concrete here, not left to taste. A context
 * qualifies only when ALL hold:
 *   1. it belongs to the organization being opened (isolation — never another
 *      organization's context);
 *   2. it is an ACTIVE `employee` relationship whose review is still OFF;
 *   3. the employee created it themselves by ACCEPTING an invitation (an
 *      `invitation_acceptances` row, decision `accepted`, by that same person,
 *      for an invitation of THIS organization of a staff type) — a context a
 *      manager added without the person doing anything never qualifies;
 *   4. that acceptance happened AFTER the accept screen began saying, in plain
 *      words, that a manager can read and sign off the recorded work
 *      (`REVIEW_DISCLOSURE_FROM`). Earlier acceptances never saw that sentence,
 *      so they stay manual — grandfathering a silent consent would not be a
 *      relationship the employee understood;
 *   5. nobody has touched the context since it was created. A manager's manual
 *      switch-off updates the row (`updated_at`), so a manual choice is never
 *      overridden by the automation.
 *
 * Students, collaborators and every other relationship keep the manual door.
 * The enabling itself is the existing audited RPC `set_engagement_journal_review`
 * (actor, organization, relationship in `audit_logs`) — never a direct UPDATE.
 */

/** Instant from which the accept screen carries the plain-language review notice. */
export const REVIEW_DISCLOSURE_FROM = "2026-10-13T00:00:00Z";

/** Invitation types whose acceptance creates an `employee` engagement. */
export const STAFF_INVITATION_TYPES: readonly string[] = ["join_organization", "join_team", "join_as_employee"];

/** An unchanged context: `updated_at` within this window of `created_at`. */
export const UNTOUCHED_WINDOW_MS = 5 * 60_000;

/** Most contexts enabled in one pass. */
export const AUTO_REVIEW_BATCH = 50;

export interface ReviewContextRow {
  readonly id: string;
  readonly profile_id: string;
  readonly organization_id: string | null;
  readonly relationship_slug: string;
  readonly status: string;
  readonly journal_review_enabled: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

export interface ReviewAcceptanceRow {
  readonly invitation_id: string;
  readonly profile_id: string;
  readonly decision: string;
  readonly relationship_id: string | null;
  readonly created_at: string;
  readonly decided_at: string | null;
}

export interface ReviewInvitationRow {
  readonly id: string;
  readonly organization_id: string | null;
  readonly invitation_type: string;
  readonly relationship_slug: string | null;
}

/**
 * Does accepting THIS invitation create an `employee` relationship? Used by the
 * accept screen to decide whether to say the review sentence, and by the
 * eligibility rule so the two can never disagree.
 */
export function acceptanceCreatesEmployeeRelationship(input: {
  readonly invitationType: string | null | undefined;
  readonly relationshipSlug: string | null | undefined;
}): boolean {
  if (!input.invitationType || !STAFF_INVITATION_TYPES.includes(input.invitationType)) return false;
  // `join_organization` + a relationship slug (student, volunteer, …) is a
  // different relationship; only the slug-less or explicit employee form is staff.
  return input.relationshipSlug == null || input.relationshipSlug === "employee";
}

function ms(iso: string): number {
  return Date.parse(iso);
}

export function eligibleForAutoReview(input: {
  readonly organizationId: string;
  readonly contexts: readonly ReviewContextRow[];
  readonly acceptances: readonly ReviewAcceptanceRow[];
  readonly invitations: readonly ReviewInvitationRow[];
  readonly limit?: number;
}): readonly string[] {
  const invitationById = new Map(input.invitations.map((i) => [i.id, i]));
  const acceptanceByContext = new Map<string, ReviewAcceptanceRow[]>();
  for (const a of input.acceptances) {
    if (a.decision !== "accepted" || !a.relationship_id) continue;
    const list = acceptanceByContext.get(a.relationship_id) ?? [];
    list.push(a);
    acceptanceByContext.set(a.relationship_id, list);
  }
  const from = ms(REVIEW_DISCLOSURE_FROM);
  const out: string[] = [];
  for (const c of input.contexts) {
    if (out.length >= (input.limit ?? AUTO_REVIEW_BATCH)) break;
    if (c.organization_id !== input.organizationId) continue;
    if (c.relationship_slug !== "employee" || c.status !== "active" || c.journal_review_enabled) continue;
    // Fail closed: an unreadable timestamp is never "untouched".
    const sinceCreated = ms(c.updated_at) - ms(c.created_at);
    if (!Number.isFinite(sinceCreated) || sinceCreated > UNTOUCHED_WINDOW_MS) continue;
    const accepted = (acceptanceByContext.get(c.id) ?? []).some((a) => {
      if (a.profile_id !== c.profile_id) return false;
      const inv = invitationById.get(a.invitation_id);
      if (!inv || inv.organization_id !== input.organizationId) return false;
      if (!acceptanceCreatesEmployeeRelationship({ invitationType: inv.invitation_type, relationshipSlug: inv.relationship_slug })) {
        return false;
      }
      const when = ms(a.decided_at ?? a.created_at);
      return !Number.isNaN(when) && when >= from;
    });
    if (accepted) out.push(c.id);
  }
  return out;
}
