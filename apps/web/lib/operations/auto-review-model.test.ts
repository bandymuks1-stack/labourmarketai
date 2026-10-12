import { describe, expect, it } from "vitest";

import {
  AUTO_REVIEW_BATCH,
  REVIEW_DISCLOSURE_FROM,
  acceptanceCreatesEmployeeRelationship,
  eligibleForAutoReview,
  type ReviewAcceptanceRow,
  type ReviewContextRow,
  type ReviewInvitationRow,
} from "./auto-review-model";

const ORG = "0a000000-0000-4000-8000-000000000001";
const OTHER_ORG = "0a000000-0000-4000-8000-000000000002";
const P1 = "p1000000-0000-4000-8000-000000000001";
const P2 = "p2000000-0000-4000-8000-000000000002";
const AFTER = "2026-10-14T09:00:00Z";
const BEFORE = "2026-10-01T09:00:00Z";

function ctx(over: Partial<ReviewContextRow> = {}): ReviewContextRow {
  return {
    id: "c1",
    profile_id: P1,
    organization_id: ORG,
    relationship_slug: "employee",
    status: "active",
    journal_review_enabled: false,
    created_at: AFTER,
    updated_at: AFTER,
    ...over,
  };
}
function acc(over: Partial<ReviewAcceptanceRow> = {}): ReviewAcceptanceRow {
  return { invitation_id: "i1", profile_id: P1, decision: "accepted", relationship_id: "c1", created_at: AFTER, decided_at: AFTER, ...over };
}
function inv(over: Partial<ReviewInvitationRow> = {}): ReviewInvitationRow {
  return { id: "i1", organization_id: ORG, invitation_type: "join_team", relationship_slug: null, ...over };
}
function run(c: ReviewContextRow[], a: ReviewAcceptanceRow[], i: ReviewInvitationRow[], organizationId = ORG) {
  return eligibleForAutoReview({ organizationId, contexts: c, acceptances: a, invitations: i, disclosureOnAllPaths: true });
}

describe("auto-review eligibility — only a relationship the employee accepted and understood", () => {
  it("qualifies an employee who accepted a staff invitation after the notice shipped", () => {
    expect(run([ctx()], [acc()], [inv()])).toEqual(["c1"]);
  });

  it("never qualifies a context nobody accepted (a manager-added member)", () => {
    expect(run([ctx()], [], [inv()])).toEqual([]);
  });

  it("never qualifies an acceptance from before the notice existed", () => {
    expect(run([ctx()], [acc({ decided_at: BEFORE, created_at: BEFORE })], [inv()])).toEqual([]);
    expect(new Date(REVIEW_DISCLOSURE_FROM).getTime()).toBeGreaterThan(new Date(BEFORE).getTime());
  });

  it("never qualifies a declined acceptance", () => {
    expect(run([ctx()], [acc({ decision: "rejected" })], [inv()])).toEqual([]);
  });

  it("never qualifies when someone else's acceptance points at the context", () => {
    expect(run([ctx()], [acc({ profile_id: P2 })], [inv()])).toEqual([]);
  });

  it("isolates organizations: another organization's context or invitation never qualifies", () => {
    expect(run([ctx({ organization_id: OTHER_ORG })], [acc()], [inv({ organization_id: OTHER_ORG })])).toEqual([]);
    expect(run([ctx()], [acc()], [inv({ organization_id: OTHER_ORG })])).toEqual([]);
    expect(run([ctx({ organization_id: null })], [acc()], [inv()])).toEqual([]);
  });

  it("only the employee relationship: students, collaborators and the rest stay manual", () => {
    for (const slug of ["student", "collaborator", "volunteer", "owner", "manager"]) {
      expect(run([ctx({ relationship_slug: slug })], [acc()], [inv()])).toEqual([]);
    }
    expect(run([ctx()], [acc()], [inv({ invitation_type: "join_organization", relationship_slug: "student" })])).toEqual([]);
    expect(run([ctx()], [acc()], [inv({ invitation_type: "collaborate_partner" })])).toEqual([]);
  });

  it("never re-enables what is already on, ended, or was touched since (a manual switch-off)", () => {
    expect(run([ctx({ journal_review_enabled: true })], [acc()], [inv()])).toEqual([]);
    expect(run([ctx({ status: "ended" })], [acc()], [inv()])).toEqual([]);
    expect(run([ctx({ updated_at: "2026-10-15T12:00:00Z" })], [acc()], [inv()])).toEqual([]);
  });

  it("fails closed on unreadable timestamps", () => {
    expect(run([ctx({ updated_at: "not a date" })], [acc()], [inv()])).toEqual([]);
    expect(run([ctx()], [acc({ decided_at: "nope", created_at: "nope" })], [inv()])).toEqual([]);
  });

  it("caps one pass", () => {
    const cs = Array.from({ length: AUTO_REVIEW_BATCH + 7 }, (_, n) => ctx({ id: `c${n}` }));
    const as = cs.map((c) => acc({ relationship_id: c.id }));
    expect(run(cs, as, [inv()])).toHaveLength(AUTO_REVIEW_BATCH);
  });
});

describe("the accept screen and the rule agree on what is an employee relationship", () => {
  it("staff invitation types without another relationship slug create an employee relationship", () => {
    for (const t of ["join_organization", "join_team", "join_as_employee"]) {
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: t, relationshipSlug: null })).toBe(true);
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: t, relationshipSlug: "employee" })).toBe(true);
    }
  });
  it("a learner, partner, project or platform invitation does not", () => {
    expect(acceptanceCreatesEmployeeRelationship({ invitationType: "join_organization", relationshipSlug: "student" })).toBe(false);
    for (const t of ["collaborate_partner", "join_project", "join_platform", "invite_company", null, undefined]) {
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: t as string | null, relationshipSlug: null })).toBe(false);
    }
  });
});

import { eligibleForAutoReview as eligibleDefault, REVIEW_DISCLOSURE_ON_ALL_ACCEPT_PATHS, UNTOUCHED_WINDOW_MS } from "./auto-review-model";

describe("fail-safe: the automation stays off until every acceptance path shows the notice", () => {
  it("is off by default, whatever the rows say", () => {
    expect(REVIEW_DISCLOSURE_ON_ALL_ACCEPT_PATHS).toBe(false);
    expect(eligibleDefault({ organizationId: "x", contexts: [], acceptances: [], invitations: [] })).toEqual([]);
  });
  it("the untouched window is seconds, not minutes (a manual opt-out must survive)", () => {
    expect(UNTOUCHED_WINDOW_MS).toBeLessThanOrEqual(10_000);
  });
});
