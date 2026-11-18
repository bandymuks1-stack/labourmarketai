import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  offersRosterWorker,
  rosterAssignScope,
  rosterProjectIdsFor,
  rpcAuthorizes,
} from "./assignment-authority";

const base = { governs: false, isPlatformAdmin: false, canOperate: false, hasCompanyContext: true };

describe("rosterAssignScope", () => {
  it("owner/admin and platform admin keep the full roster", () => {
    expect(rosterAssignScope({ ...base, governs: true, canOperate: true })).toBe("all-roster");
    expect(rosterAssignScope({ ...base, isPlatformAdmin: true })).toBe("all-roster");
  });
  it("a manager is scoped to the own company roster", () => {
    expect(rosterAssignScope({ ...base, canOperate: true })).toBe("own-company-roster");
  });
  it("any other role gets no roster assignment", () => {
    expect(rosterAssignScope(base)).toBe("none");
  });
  it("no company context leaves the decision to the database (unchanged)", () => {
    expect(rosterAssignScope({ ...base, hasCompanyContext: false })).toBe("all-roster");
  });
});

describe("rosterProjectIdsFor", () => {
  const projects = [
    { id: "p1", organizationId: "orgA" },
    { id: "p2", organizationId: "orgB" },
    { id: "p3", organizationId: null },
  ];
  it("manager: only projects of the organization acted for; none without an org", () => {
    expect(rosterProjectIdsFor("own-company-roster", projects, "orgA")).toEqual(["p1"]);
    expect(rosterProjectIdsFor("own-company-roster", projects, null)).toEqual([]);
  });
  it("governor unrestricted, none-scope offers nothing", () => {
    expect(rosterProjectIdsFor("all-roster", projects, "orgA")).toBeNull();
    expect(rosterProjectIdsFor("none", projects, "orgA")).toEqual([]);
  });
  it("offersRosterWorker follows the list", () => {
    expect(offersRosterWorker(null, "x")).toBe(true);
    expect(offersRosterWorker(["p1"], "p1")).toBe(true);
    expect(offersRosterWorker(["p1"], "p2")).toBe(false);
  });
});

/**
 * The UI predicate must never be WIDER than the RPC: for every modelled world
 * the form offers a roster worker, the RPC's three branches accept.
 */
describe("UI offer agrees with the RPC's three branches", () => {
  const bools = [false, true];
  it("a manager is offered a roster worker only where the RPC accepts", () => {
    for (const projectOwnOrg of bools)
      for (const onRoster of bools) {
        const scope = rosterAssignScope({ ...base, canOperate: true });
        const projects = [{ id: "p", organizationId: projectOwnOrg ? "own" : "other" }];
        // The form lists only the own company's roster, and only own-org projects.
        const offered =
          offersRosterWorker(rosterProjectIdsFor(scope, projects, "own"), "p") && onRoster;
        // The database's view of a manager of the OWN organization.
        const rpc = rpcAuthorizes({
          canManageProject: projectOwnOrg,
          callerManagesWorkerByRoster: false,
          hasEngagementForProject: false,
          managesProjectOrganization: projectOwnOrg,
          projectHasOrganization: true,
          workerOnProjectCompanyRoster: onRoster && projectOwnOrg,
          isPlatformAdmin: false,
        });
        if (offered) expect(rpc).toBe(true);
        // ...and the converse for this role: nothing the RPC accepts is hidden.
        if (rpc) expect(offered).toBe(true);
      }
  });

  it("a role with no roster authority is offered nothing", () => {
    const scope = rosterAssignScope(base);
    expect(offersRosterWorker(rosterProjectIdsFor(scope, [{ id: "p", organizationId: "own" }], "own"), "p")).toBe(false);
  });

  it("the three RPC branches, concretely", () => {
    const none = {
      canManageProject: false,
      callerManagesWorkerByRoster: false,
      hasEngagementForProject: false,
      managesProjectOrganization: false,
      projectHasOrganization: true,
      workerOnProjectCompanyRoster: false,
      isPlatformAdmin: false,
    };
    // manager + own project + on that company's roster => allowed
    expect(rpcAuthorizes({ ...none, managesProjectOrganization: true, workerOnProjectCompanyRoster: true })).toBe(true);
    // manager + project of another org => denied
    expect(rpcAuthorizes({ ...none, workerOnProjectCompanyRoster: true })).toBe(false);
    // manager + off-roster worker => denied
    expect(rpcAuthorizes({ ...none, managesProjectOrganization: true, canManageProject: true })).toBe(false);
    // ordinary worker => denied
    expect(rpcAuthorizes(none)).toBe(false);
    // owner/admin roster and engagement path unchanged; platform admin
    expect(rpcAuthorizes({ ...none, canManageProject: true, callerManagesWorkerByRoster: true })).toBe(true);
    expect(rpcAuthorizes({ ...none, canManageProject: true, hasEngagementForProject: true })).toBe(true);
    expect(rpcAuthorizes({ ...none, isPlatformAdmin: true })).toBe(true);
  });

  it("the migration still contains the branch the model mirrors", () => {
    const sql = readFileSync(
      join(__dirname, "../../../../supabase/migrations/20261002142000_manager_assigns_roster_worker_on_managed_project_v1.sql"),
      "utf8",
    );
    expect(sql).toMatch(/manages_organization\(mp\.organization_id\)/);
    expect(sql).toMatch(/mcw\.status = 'active'/);
    expect(sql).toMatch(/caller_manages_worker_by_roster\(w_id\)/);
  });
});
