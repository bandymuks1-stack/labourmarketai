import { describe, expect, it } from "vitest";

import {
  REVIEW_NOTICE_SURFACES,
  REVIEW_NOTICE_VERSION,
  STAFF_REVIEW_AUTO_ENABLE,
  acceptanceCreatesEmployeeRelationship,
  acceptedReviewNotice,
  readStaffReviewNoticeOutcome,
  showsStaffReviewNotice,
} from "./auto-review-model";

describe("which acceptances create an employee relationship", () => {
  it("staff invitation types without another relationship slug do", () => {
    for (const t of ["join_organization", "join_team", "join_as_employee"]) {
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: t, relationshipSlug: null })).toBe(true);
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: t, relationshipSlug: "employee" })).toBe(true);
    }
  });
  it("a learner, intern, partner, project or platform invitation does not", () => {
    for (const slug of ["student", "intern", "volunteer", "collaborator"]) {
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: "join_organization", relationshipSlug: slug })).toBe(false);
    }
    for (const t of ["collaborate_partner", "join_project", "join_platform", "invite_company", "invite_to_demand", null, undefined]) {
      expect(acceptanceCreatesEmployeeRelationship({ invitationType: t as string | null, relationshipSlug: null })).toBe(false);
    }
  });
});

describe("the review sentence is shown only where it can say who reads the work", () => {
  it("staff invitation of a named organization → shown", () => {
    expect(showsStaffReviewNotice({ invitationType: "join_team", relationshipSlug: null, organizationName: "Alfa UAB" })).toBe(true);
  });
  it("no organization name → not shown (the accept then carries no notice)", () => {
    for (const organizationName of [null, undefined, "", "   "]) {
      expect(showsStaffReviewNotice({ invitationType: "join_team", relationshipSlug: null, organizationName })).toBe(false);
    }
  });
  it("not a staff relationship → not shown", () => {
    expect(showsStaffReviewNotice({ invitationType: "join_organization", relationshipSlug: "student", organizationName: "Alfa" })).toBe(false);
  });
});

describe("an accept action forwards only the exact current notice version", () => {
  it("accepts the version and nothing else", () => {
    expect(acceptedReviewNotice(REVIEW_NOTICE_VERSION)).toBe(REVIEW_NOTICE_VERSION);
    for (const v of [null, undefined, "", "staff-review-notice-v0", "yes", true, 1, {}]) {
      expect(acceptedReviewNotice(v)).toBeNull();
    }
  });
});

describe("the RPC answer is read as a closed set", () => {
  it("known outcomes pass through; anything else is an error", () => {
    for (const o of ["recorded", "review_enabled", "already_on", "manual_choice_kept", "already_recorded", "not_applicable", "too_late", "not_found", "invalid"]) {
      expect(readStaffReviewNoticeOutcome({ outcome: o })).toBe(o);
    }
    expect(readStaffReviewNoticeOutcome({ outcome: "enabled_everything" })).toBe("error");
    expect(readStaffReviewNoticeOutcome(null)).toBe("error");
    expect(readStaffReviewNoticeOutcome("recorded")).toBe("error");
  });
});

describe("owner sequence: prove the paths, then switch review on", () => {
  it("automatic enabling is ON only after the paths recorded the fact in production (2026-10-12)", () => {
    expect(STAFF_REVIEW_AUTO_ENABLE).toBe(true);
  });
  it("every accept surface is named (and mirrored by the SQL allowlist)", () => {
    expect([...REVIEW_NOTICE_SURFACES].sort()).toEqual(["addressed_signup", "conversation", "invite_page", "network", "onboarding"]);
  });
});
