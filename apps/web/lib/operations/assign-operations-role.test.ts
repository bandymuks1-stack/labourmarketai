import { describe, expect, it } from "vitest";

import {
  ASSIGNABLE_OPERATIONS_ROLES,
  isAssignableOperationsRole,
  validateOperationsRoleAssignment,
} from "./assign-operations-role";
import { getOperationsRole } from "./role-capabilities";

/**
 * Pure-logic guards for the operations-role assignment validator
 * (slice ops-role-assign-rpc-v1). These mirror the SECURITY DEFINER RPC
 * rules (migration 0031) and prove the honesty invariants without any DB:
 *   - valid role assignment
 *   - clearing role/title
 *   - review-enable always blocked
 *   - foreman/PM are storable labels but NOT active from the label alone
 *   - invalid role rejected
 *   - no fake approval/verification claims surface
 */

describe("validateOperationsRoleAssignment", () => {
  it("accepts every role in the conservative allowed set", () => {
    for (const role of ASSIGNABLE_OPERATIONS_ROLES) {
      const r = validateOperationsRoleAssignment({ operationsRole: role });
      expect(r.ok, role).toBe(true);
      if (r.ok && r.action === "assign") {
        expect(r.role).toBe(role);
        // An assignment never turns review on.
        expect(r.journalReviewEnabled).toBe(false);
      } else {
        throw new Error(`expected assign for ${role}`);
      }
    }
  });

  it("trims a title and keeps it; blank title becomes null", () => {
    const withTitle = validateOperationsRoleAssignment({
      operationsRole: "worker",
      operationsTitle: "  Site lead  ",
    });
    expect(withTitle.ok && withTitle.action === "assign" && withTitle.title).toBe(
      "Site lead",
    );

    const blankTitle = validateOperationsRoleAssignment({
      operationsRole: "worker",
      operationsTitle: "   ",
    });
    expect(blankTitle.ok && blankTitle.action === "assign" && blankTitle.title).toBe(
      null,
    );
  });

  it("clears the assignment when the role is null / blank", () => {
    for (const value of [null, undefined, "", "   "] as const) {
      const r = validateOperationsRoleAssignment({
        operationsRole: value,
        operationsTitle: "ignored",
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.action).toBe("clear");
        expect(r.role).toBe(null);
        expect(r.title).toBe(null);
        expect(r.journalReviewEnabled).toBe(false);
      }
    }
  });

  it("rejects an unknown / invalid role", () => {
    // Note: leading/trailing whitespace is trimmed, so "foreman " is valid;
    // these are genuinely-unknown tokens (incl. wrong case / non-set roles).
    for (const bad of ["manager", "owner", "Worker", "site_manager", "admin", "x"]) {
      const r = validateOperationsRoleAssignment({ operationsRole: bad });
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.reason).toBe("invalid_role");
    }
  });

  it("never enables journal review — even with a reviewer-capable role", () => {
    for (const role of ["company_admin", "agency_admin", "worker"]) {
      const r = validateOperationsRoleAssignment({
        operationsRole: role,
        journalReviewEnabled: true,
      });
      expect(r.ok, role).toBe(false);
      if (!r.ok) expect(r.reason).toBe("review_not_allowed");
    }
  });

  it("rejects review-enable even while clearing (label cannot grant review)", () => {
    const r = validateOperationsRoleAssignment({
      operationsRole: null,
      journalReviewEnabled: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("review_not_allowed");
  });

  it("treats journalReviewEnabled=false / undefined as the safe default", () => {
    for (const value of [false, null, undefined] as const) {
      const r = validateOperationsRoleAssignment({
        operationsRole: "company_admin",
        journalReviewEnabled: value,
      });
      expect(r.ok).toBe(true);
      if (r.ok && r.action === "assign") {
        expect(r.journalReviewEnabled).toBe(false);
      }
    }
  });
});

describe("foreman / project_manager are labels only, never active", () => {
  it("are accepted as STORABLE labels by the validator", () => {
    for (const label of ["foreman", "project_manager"]) {
      const r = validateOperationsRoleAssignment({ operationsRole: label });
      expect(r.ok, label).toBe(true);
    }
  });

  it("but the capability map keeps them not_enabled with zero capabilities", () => {
    for (const id of ["foreman", "project_manager"] as const) {
      const role = getOperationsRole(id);
      expect(role.status).toBe("not_enabled");
      // Storing the label grants nothing — no review, no coordination.
      expect(role.capabilities.reviewWorkEntries).toBe(false);
      expect(role.capabilities.coordinateTeam).toBe(false);
      expect(role.capabilities.assignWorkerRoles).toBe(false);
    }
  });
});

describe("isAssignableOperationsRole", () => {
  it("is true only for the five conservative values", () => {
    expect(ASSIGNABLE_OPERATIONS_ROLES.every(isAssignableOperationsRole)).toBe(
      true,
    );
    for (const bad of ["", "Worker", "site_manager", "buyer", "admin"]) {
      expect(isAssignableOperationsRole(bad), bad).toBe(false);
    }
  });
});
