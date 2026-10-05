import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The worker's project list keeps BOTH structural reachabilities the
 * integration accepted (own assignment + team-only, 20261003150700) AND the
 * Result semantics the home needs (ok | unavailable, SEP-7): a failed read is
 * UNKNOWN, never a shorter or empty list.
 */

type Rows = { data: unknown; error: unknown };

const state: {
  worker: Rows;
  assignments: Rows;
  projects: Rows;
  team: Rows;
} = {
  worker: { data: { id: "w1" }, error: null },
  assignments: { data: [], error: null },
  projects: { data: [], error: null },
  team: { data: [], error: null },
};

function chain(result: () => Rows) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "in"]) c[m] = () => c;
  c.maybeSingle = async () => result();
  c.then = (resolve: (v: Rows) => unknown) => resolve(result());
  return c;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: (table: string) =>
      chain(() =>
        table === "workers"
          ? state.worker
          : table === "project_worker_assignments"
            ? state.assignments
            : state.projects,
      ),
    rpc: async () => state.team,
  }),
}));

import { listWorkerProjects, listWorkerProjectsResult } from "./worker-project-access";

const ownAssignment = {
  project_id: "p-own",
  status: "active",
  assigned_at: "2026-10-01T08:00:00Z",
};
const teamRow = {
  assignment_id: "a1",
  team_org_id: "t1",
  team_name: "Crew A",
  project_id: "p-team",
  project_title: "Team-only site",
  project_org_id: "o1",
  work_object_id: null,
  task_id: null,
  assigned_at: "2026-10-02T08:00:00Z",
};

describe("listWorkerProjectsResult", () => {
  beforeEach(() => {
    state.worker = { data: { id: "w1" }, error: null };
    state.assignments = { data: [ownAssignment], error: null };
    state.projects = {
      data: [
        { id: "p-own", title: "Own site", status: "active", city: "Vilnius", country: "LT" },
        { id: "p-team", title: "Team-only site", status: "active", city: "Kaunas", country: "LT" },
      ],
      error: null,
    };
    state.team = { data: [teamRow], error: null };
  });

  it("returns own AND team-only projects, labelling the team-only one", async () => {
    const r = await listWorkerProjectsResult();
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.rows.map((x) => x.projectId)).toEqual(["p-own", "p-team"]);
    expect(r.rows[0].viaTeam).toBeUndefined();
    expect(r.rows[1].viaTeam).toBe("Crew A");
  });

  it("a project reached both ways is listed once, as the person's own", async () => {
    state.team = { data: [{ ...teamRow, project_id: "p-own" }], error: null };
    const r = await listWorkerProjectsResult();
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.rows.map((x) => x.projectId)).toEqual(["p-own"]);
  });

  it("a team-only project is reachable with NO own assignment", async () => {
    state.assignments = { data: [], error: null };
    const r = await listWorkerProjectsResult();
    expect(r.status).toBe("ok");
    if (r.status !== "ok") return;
    expect(r.rows.map((x) => x.projectId)).toEqual(["p-team"]);
  });

  it("a FAILED team read is unavailable, never a shorter list", async () => {
    state.team = { data: null, error: { message: "rpc failed" } };
    expect(await listWorkerProjectsResult()).toEqual({ status: "unavailable" });
  });

  it("a FAILED assignments read is unavailable", async () => {
    state.assignments = { data: null, error: { message: "boom" } };
    expect(await listWorkerProjectsResult()).toEqual({ status: "unavailable" });
  });

  it("a FAILED projects read is unavailable", async () => {
    state.projects = { data: null, error: { message: "boom" } };
    expect(await listWorkerProjectsResult()).toEqual({ status: "unavailable" });
  });

  it("no worker row and nothing assigned is an honest empty list", async () => {
    state.worker = { data: null, error: null };
    expect(await listWorkerProjectsResult()).toEqual({ status: "ok", rows: [] });
  });

  it("the legacy lossy reader still delegates (callers keep their shape)", async () => {
    expect((await listWorkerProjects()).map((x) => x.projectId)).toEqual(["p-own", "p-team"]);
    state.team = { data: null, error: { message: "rpc failed" } };
    expect(await listWorkerProjects()).toEqual([]);
  });
});
