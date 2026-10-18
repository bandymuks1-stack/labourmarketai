import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * G-7 — the optional client row fails AFTER the project committed. The action
 * must never end as a plain `ok:false` with the project still standing (a
 * retry would duplicate it): it either rolls the project back (verified) or
 * reports success WITH a named warning.
 */

const requireEmployerCompanyMock = vi.fn();
vi.mock("./employer-company-context", async () => {
  const actual = await vi.importActual<typeof import("./employer-company-context")>(
    "./employer-company-context",
  );
  return { ...actual, requireEmployerCompany: (...a: unknown[]) => requireEmployerCompanyMock(...a) };
});
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./stale-workspace", () => ({
  displayedWorkspaceOf: () => null,
  refuseStaleWorkspace: async () => undefined,
}));
vi.mock("@/lib/projects/create-project-core", async () => {
  const actual = await vi.importActual<typeof import("@/lib/projects/create-project-core")>(
    "@/lib/projects/create-project-core",
  );
  return {
    ...actual,
    insertProjectForCompany: async () => ({ ok: true, id: "project-1" }),
  };
});

let deleteResult: { data: { id: string }[] | null; error: { message: string } | null };
const deleted: string[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (t: string) => {
      if (t === "project_clients") {
        return { insert: async () => ({ error: { message: "client rls" } }) };
      }
      return {
        delete: () => ({
          eq: (_c: string, id: string) => ({
            select: async () => {
              deleted.push(id);
              return deleteResult;
            },
          }),
        }),
      };
    },
  }),
}));

const { createProjectContextAction } = await import("./project-context-actions");

function form() {
  const fd = new FormData();
  fd.set("name", "Statyba A");
  fd.set("client_name", "Klientas");
  return fd;
}

beforeEach(() => {
  deleted.length = 0;
  requireEmployerCompanyMock.mockResolvedValue({
    ok: true,
    companyId: "c1",
    role: "owner",
  });
});

describe("G-7 project + client create is honest when the client row fails", () => {
  it("rolls the just-created project back (verified) and reports the failure - retry is safe", async () => {
    deleteResult = { data: [{ id: "project-1" }], error: null };
    const r = await createProjectContextAction(null, form());
    expect(deleted).toEqual(["project-1"]);
    expect(r).toEqual({ ok: false, code: "error", message: "client rls" });
  });

  it("when the project cannot be removed, success is reported WITH a named warning, never a bare failure", async () => {
    deleteResult = { data: [], error: null }; // RLS filtered the delete
    const r = await createProjectContextAction(null, form());
    expect(r).toEqual({ ok: true, warning: "client_not_saved" });
  });

  it("a delete error is not a rollback either", async () => {
    deleteResult = { data: null, error: { message: "fk" } };
    const r = await createProjectContextAction(null, form());
    expect(r).toEqual({ ok: true, warning: "client_not_saved" });
  });
});
