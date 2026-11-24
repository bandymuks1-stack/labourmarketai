import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * G-6 — POST /api/workers/:id/skills must never erase evidence another party
 * produced (manager-verified / journal-derived rows), must ADD before it
 * REMOVES, and must restate the "self-declared + unverified" restriction in
 * the delete itself so a row verified after the read survives too.
 */

const WORKER = "11111111-1111-4111-8111-111111111111";
const S_SELF = "22222222-2222-4222-8222-222222222221";
const S_VERIFIED = "22222222-2222-4222-8222-222222222222";
const S_JOURNAL = "22222222-2222-4222-8222-222222222223";
const S_NEW = "22222222-2222-4222-8222-222222222224";

type Op = { kind: string; table: string; payload?: unknown; filters: [string, string, unknown][] };
const ops: Op[] = [];
let existing: { skill_id: string; verified: boolean; source: string }[] = [];
let failOn: "upsert" | "delete" | null = null;

function builder(table: string) {
  const op: Op = { kind: "select", table, filters: [] };
  const result = () => {
    ops.push(op);
    if (op.kind === "select") return { data: existing, error: null };
    if (op.kind === failOn) return { data: null, error: { message: "boom" } };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    upsert: (payload: unknown) => ((op.kind = "upsert"), (op.payload = payload), b),
    insert: (payload: unknown) => ((op.kind = "insert"), (op.payload = payload), b),
    delete: () => ((op.kind = "delete"), b),
    eq: (c: string, v: unknown) => (op.filters.push(["eq", c, v]), b),
    in: (c: string, v: unknown) => (op.filters.push(["in", c, v]), b),
    then: (res: (v: unknown) => unknown) => res(result()),
  };
  return b;
}

vi.mock("@/lib/api/api-identity", () => ({
  refusalStatus: () => 401,
  resolveApiIdentity: async () => ({
    ok: true,
    identity: { userId: "u1", supabase: { from: builder } },
  }),
}));
vi.mock("@/lib/skills", async () => {
  const actual = await vi.importActual<typeof import("@/lib/skills")>("@/lib/skills");
  return {
    ...actual,
    ownsWorker: async () => true,
    workerProfessionSkillIds: async () =>
      new Set([S_SELF, S_VERIFIED, S_JOURNAL, S_NEW]),
  };
});

const { POST } = await import("./route");

function call(skillIds: string[]) {
  return POST(
    new Request("http://x/api", { method: "POST", body: JSON.stringify({ skillIds }) }),
    { params: Promise.resolve({ workerId: WORKER }) },
  );
}

beforeEach(() => {
  ops.length = 0;
  failOn = null;
  existing = [
    { skill_id: S_SELF, verified: false, source: "self_declared" },
    { skill_id: S_VERIFIED, verified: true, source: "manager_confirmed" },
    { skill_id: S_JOURNAL, verified: false, source: "work_journal" },
  ];
});

describe("G-6 skills replace never deletes verified / derived rows", () => {
  it("a stale list that omits verified + journal skills deletes ONLY the self-declared unverified one", async () => {
    const res = await call([S_NEW]);
    const body = await res.json();
    expect(res.status).toBe(200);
    const del = ops.find((o) => o.kind === "delete")!;
    expect(del.filters).toContainEqual(["in", "skill_id", [S_SELF]]);
    expect(del.filters).toContainEqual(["eq", "verified", false]);
    expect(del.filters).toContainEqual(["eq", "source", "self_declared"]);
    expect(JSON.stringify(del.filters)).not.toContain(S_VERIFIED);
    expect(JSON.stringify(del.filters)).not.toContain(S_JOURNAL);
    expect([...body.retained].sort()).toEqual([S_VERIFIED, S_JOURNAL].sort());
  });

  it("adds BEFORE removing, so a failed add leaves the saved set untouched and says 500", async () => {
    failOn = "upsert";
    const res = await call([S_NEW]);
    expect(res.status).toBe(500);
    expect(ops.some((o) => o.kind === "delete")).toBe(false);
  });

  it("inserts via an idempotent upsert that cannot overwrite an existing row", async () => {
    await call([S_NEW]);
    const up = ops.find((o) => o.kind === "upsert")!;
    expect(up.payload).toEqual([{ worker_id: WORKER, skill_id: S_NEW }]);
    const order = ops.map((o) => o.kind);
    expect(order.indexOf("upsert")).toBeLessThan(order.indexOf("delete"));
  });

  it("a failed delete is reported as a failure, never as ok", async () => {
    failOn = "delete";
    const res = await call([S_NEW]);
    expect(res.status).toBe(500);
  });

  it("keeping everything issues no delete and no insert", async () => {
    const res = await call([S_SELF, S_VERIFIED, S_JOURNAL]);
    expect(res.status).toBe(200);
    expect(ops.some((o) => o.kind === "delete" || o.kind === "upsert")).toBe(false);
  });
});
