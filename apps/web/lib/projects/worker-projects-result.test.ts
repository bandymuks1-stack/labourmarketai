import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN ≠ ZERO for the worker's own projects (SEP-7). The home's RUNNING
 * region names "your projects could not be read" — which needs a reader that
 * can tell a FAILED read from a successful EMPTY one. `listWorkerProjects`
 * keeps its historical lossy shape (the projects page, the chat) by
 * delegating to `listWorkerProjectsResult`.
 */

type Res = { data?: unknown; error?: unknown };

function fakeClient(opts: {
  user?: { id: string } | null;
  worker?: { id: string } | null;
  assignments?: Res;
  projects?: Res;
  teams?: Res;
}) {
  const user = opts.user === undefined ? { id: "me" } : opts.user;
  const res = (r?: Res, fallback: unknown = []) => ({ data: r?.data ?? fallback, error: r?.error ?? null });
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    rpc: async () => res(opts.teams),
    from: (table: string) => {
      if (table === "workers") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: opts.worker === undefined ? { id: "w1" } : opts.worker, error: null }),
            }),
          }),
        };
      }
      if (table === "project_worker_assignments") {
        return { select: () => ({ eq: () => ({ order: async () => res(opts.assignments) }) }) };
      }
      if (table === "projects") {
        return { select: () => ({ in: async () => res(opts.projects) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

async function load(client: unknown) {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
  vi.doMock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));
  return import("./worker-project-access");
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

const ASSIGNMENT = { project_id: "p1", status: "active", assigned_at: "2026-10-01T00:00:00Z" };

describe("listWorkerProjectsResult", () => {
  it("an assignments-query error is UNAVAILABLE, not empty", async () => {
    const m = await load(fakeClient({ assignments: { error: { code: "42501" } } }));
    expect(await m.listWorkerProjectsResult()).toEqual({ status: "unavailable" });
  });

  it("a projects-query error is UNAVAILABLE, not empty", async () => {
    const m = await load(fakeClient({ assignments: { data: [ASSIGNMENT] }, projects: { error: { code: "XX000" } } }));
    expect(await m.listWorkerProjectsResult()).toEqual({ status: "unavailable" });
  });

  it("no worker row and no assignment are successful EMPTY reads", async () => {
    expect(await (await load(fakeClient({ worker: null }))).listWorkerProjectsResult()).toEqual({ status: "ok", rows: [] });
    expect(await (await load(fakeClient({ assignments: { data: [] } }))).listWorkerProjectsResult()).toEqual({
      status: "ok",
      rows: [],
    });
  });

  it("a successful read returns the person's assignment with the readable project facts", async () => {
    const m = await load(
      fakeClient({
        assignments: { data: [ASSIGNMENT] },
        projects: { data: [{ id: "p1", title: "Site", status: "live", city: "Kaunas", country: "LT" }] },
      }),
    );
    const r = await m.listWorkerProjectsResult();
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.rows).toEqual([
      {
        projectId: "p1",
        title: "Site",
        status: "live",
        city: "Kaunas",
        country: "LT",
        assignmentStatus: "active",
        assignedAt: "2026-10-01T00:00:00Z",
      },
    ]);
  });
});

describe("the historical reader keeps its lossy shape by delegating", () => {
  it("failure reads as the empty list; success is unchanged", async () => {
    const failed = await load(fakeClient({ assignments: { error: { code: "42501" } } }));
    expect(await failed.listWorkerProjects()).toEqual([]);
    const ok = await load(
      fakeClient({ assignments: { data: [ASSIGNMENT] }, projects: { data: [{ id: "p1", title: "Site" }] } }),
    );
    expect((await ok.listWorkerProjects()).map((r) => r.projectId)).toEqual(["p1"]);
  });
});
