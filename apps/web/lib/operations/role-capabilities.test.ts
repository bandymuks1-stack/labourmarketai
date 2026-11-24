import { describe, expect, it } from "vitest";

import {
  OPERATIONS_ROLES,
  getNotEnabledCoordinationRoles,
  getOperationsRole,
  isOperationsRoleEnabled,
  type OperationsRoleId,
} from "./role-capabilities";

/**
 * Operations role capability map guard (PR B). Pins the honest statuses
 * so a future edit cannot silently promote foreman / project_manager /
 * site_manager / team_lead to "working".
 */

describe("operations role capability map", () => {
  it("covers every operations role id exactly once", () => {
    const ids = OPERATIONS_ROLES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(
      new Set<OperationsRoleId>([
        "worker",
        "company_admin",
        "agency_admin",
        "buyer",
        "admin",
        "foreman",
        "project_manager",
        "site_manager",
        "team_lead",
      ]),
    );
  });

  it("marks foreman / project_manager / site_manager as not_enabled", () => {
    for (const id of [
      "foreman",
      "project_manager",
      "site_manager",
    ] as const) {
      expect(getOperationsRole(id).status).toBe("not_enabled");
      expect(isOperationsRoleEnabled(id)).toBe(false);
    }
  });

  it("marks team_lead as planned, not active", () => {
    expect(getOperationsRole("team_lead").status).toBe("planned");
    expect(isOperationsRoleEnabled("team_lead")).toBe(false);
  });

  it("only worker/company_admin/agency_admin/buyer/admin are active", () => {
    const active = OPERATIONS_ROLES.filter(
      (r) => r.status === "active",
    ).map((r) => r.id);
    expect(new Set(active)).toEqual(
      new Set<OperationsRoleId>([
        "worker",
        "company_admin",
        "agency_admin",
        "buyer",
        "admin",
      ]),
    );
  });

  it("no role can assign per-worker roles or coordinate a team today", () => {
    for (const r of OPERATIONS_ROLES) {
      expect(r.capabilities.assignWorkerRoles, `${r.id}`).toBe(false);
      expect(r.capabilities.coordinateTeam, `${r.id}`).toBe(false);
    }
  });

  it("not_enabled / planned roles have zero capabilities", () => {
    for (const r of getNotEnabledCoordinationRoles()) {
      for (const v of Object.values(r.capabilities)) {
        expect(v, `${r.id} capability`).toBe(false);
      }
    }
  });

  it("worker can create a work journal; company/agency can see+invite", () => {
    expect(getOperationsRole("worker").capabilities.createWorkJournal).toBe(
      true,
    );
    for (const id of ["company_admin", "agency_admin"] as const) {
      expect(getOperationsRole(id).capabilities.seeWorkers).toBe(true);
      expect(getOperationsRole(id).capabilities.inviteWorkers).toBe(true);
      // Employment link is NOT connected to journal review.
      expect(getOperationsRole(id).capabilities.reviewWorkEntries).toBe(false);
    }
  });

  it("every role carries repo evidence", () => {
    for (const r of OPERATIONS_ROLES) {
      expect(r.evidence.length, `${r.id}`).toBeGreaterThan(10);
    }
  });
});
