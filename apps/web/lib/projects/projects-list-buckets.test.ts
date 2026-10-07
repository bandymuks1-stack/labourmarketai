import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = { id: string; title: string; status: string | null; created_at: string };
let rows: Row[] = [];

/** Minimal PostgREST-like builder over `rows` for the filters the list uses. */
function builder() {
  let completed: boolean | null = null;
  let limit = Infinity;
  let head = false;
  let none = false;
  const q: Record<string, unknown> = {};
  const result = () => {
    let r = none ? [] : rows.filter((x) =>
      completed === null ? true : completed ? x.status === "completed" : x.status !== "completed",
    );
    r = [...r].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    if (head) return { count: r.length, data: null, error: null };
    return {
      data: r.slice(0, limit).map((x) => ({
        id: x.id,
        title: x.title,
        city: null,
        country: null,
        status: x.status,
        responsible_profile_id: null,
        organization_id: "o1",
        organizations: null,
      })),
      error: null,
    };
  };
  q.select = (_c: string, opts?: { head?: boolean }) => {
    head = !!opts?.head;
    return q;
  };
  q.eq = (col: string, v: string) => {
    if (col === "status" && v === "completed") completed = true;
    if (col === "record_state") none = true; // duplicate marker lookup: nothing marked
    return q;
  };
  q.in = () => q;
  q.or = (expr: string) => {
    if (expr.startsWith("status.is.null")) completed = false;
    return q;
  };
  q.order = () => q;
  q.limit = (n: number) => {
    limit = n;
    return q;
  };
  q.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => builder(),
  }),
}));
vi.mock("@/lib/company/employer-company-context", () => ({
  isEmployerContextFailure: () => false,
  resolveEmployerCompanyContext: async () => ({ kind: "ok" }),
}));

import {
  MANAGED_PROJECTS_BUCKET_LIMIT,
  countManagedProjects,
  listManagedProjects,
} from "./projects";

function seed(completedN: number, activeN: number) {
  rows = [];
  // completed rows are NEWER than the active ones: the old single
  // ORDER BY created_at DESC LIMIT 100 would evict every active project.
  for (let i = 0; i < activeN; i++)
    rows.push({ id: `a${i}`, title: `A${i}`, status: i % 2 ? "live" : "draft", created_at: `2026-01-${String(i + 1).padStart(2, "0")}` });
  for (let i = 0; i < completedN; i++)
    rows.push({ id: `c${i}`, title: `C${i}`, status: "completed", created_at: `2026-09-${String((i % 28) + 1).padStart(2, "0")}-${i}` });
}

describe("listManagedProjects active/finished buckets", () => {
  beforeEach(() => seed(0, 0));

  it("150 completed + 10 active: all 10 active are present and listed first", async () => {
    seed(150, 10);
    const list = await listManagedProjects();
    const active = list.filter((p) => p.status !== "completed");
    expect(active).toHaveLength(10);
    expect(list.slice(0, 10).every((p) => p.status !== "completed")).toBe(true);
    expect(list.filter((p) => p.status === "completed")).toHaveLength(MANAGED_PROJECTS_BUCKET_LIMIT);
  });

  it("a project with a null status counts as working, not finished", async () => {
    seed(0, 0);
    rows.push({ id: "n1", title: "N", status: null, created_at: "2026-01-01" });
    const list = await listManagedProjects();
    expect(list.map((p) => p.id)).toEqual(["n1"]);
  });

  it("reports real, uncapped counts per bucket", async () => {
    seed(180, 10);
    expect(await countManagedProjects()).toEqual({ active: 10, archived: 180 });
  });
});
