import { afterEach, describe, expect, it, vi } from "vitest";

// The reader sits on a large import graph; each `load` re-imports it, so a cold
// run exceeds the 5 s default and a timed-out test would keep re-mocking under
// the next one.
vi.setConfig({ testTimeout: 120_000 });

/**
 * UNKNOWN ≠ ZERO for pending interest (SEP-7). The historical reader turned a
 * missing user, a missing company context, a database error and an absent
 * table into the same empty map, so "nobody has raised a hand" and "we could
 * not look" were indistinguishable. `readPendingInterestCountsForCompany` keeps
 * them apart; `listPendingInterestCountsForCompany` keeps its lossy shape for
 * the pages that open on a demand, by delegating.
 */

type Query = { data?: unknown; error?: { code?: string } | null };

async function load(opts: { user?: { id: string } | null; employerOk?: boolean; query?: Query; throws?: boolean }) {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
  const user = opts.user === undefined ? { id: "u1" } : opts.user;
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => {
      if (opts.throws) throw new Error("boom");
      return { select: () => ({ eq: async () => ({ data: opts.query && "data" in opts.query ? opts.query.data : [], error: opts.query?.error ?? null }) }) };
    },
  };
  vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));
  vi.doMock("@/lib/company/employer-company-context", () => ({
    requireEmployerCompany: async () => (opts.employerOk === false ? { ok: false } : { ok: true }),
  }));
  return import("./interest");
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("readPendingInterestCountsForCompany", () => {
  it("separates SUCCESS EMPTY from every non-success outcome", async () => {
    const empty = await (await load({ query: { data: [] } })).readPendingInterestCountsForCompany();
    expect(empty.status).toBe("ok");
    expect(empty.status === "ok" && empty.counts.size).toBe(0);

    expect(await (await load({ user: null })).readPendingInterestCountsForCompany()).toEqual({ status: "unavailable" });
    expect(await (await load({ employerOk: false })).readPendingInterestCountsForCompany()).toEqual({ status: "no-company-context" });
    expect(await (await load({ query: { error: { code: "42P01" } } })).readPendingInterestCountsForCompany()).toEqual({ status: "needs-migration" });
    expect(await (await load({ query: { error: { code: "XX000" } } })).readPendingInterestCountsForCompany()).toEqual({ status: "unavailable" });
    expect(await (await load({ query: { data: null } })).readPendingInterestCountsForCompany()).toEqual({ status: "unavailable" });
    expect(await (await load({ throws: true })).readPendingInterestCountsForCompany()).toEqual({ status: "unavailable" });
  });

  it("counts `interested` rows per demand on success", async () => {
    const m = await load({ query: { data: [{ request_id: "a" }, { request_id: "a" }, { request_id: "b" }, { request_id: null }] } });
    const r = await m.readPendingInterestCountsForCompany();
    expect(r.status === "ok" && Object.fromEntries(r.counts)).toEqual({ a: 2, b: 1 });
  });
});

describe("listPendingInterestCountsForCompany keeps its lossy shape by delegating", () => {
  it("every non-success is the empty map; success is unchanged", async () => {
    for (const opts of [{ user: null }, { employerOk: false }, { query: { error: { code: "XX000" } } }, { throws: true }] as const) {
      expect((await (await load(opts)).listPendingInterestCountsForCompany()).size).toBe(0);
    }
    const ok = await (await load({ query: { data: [{ request_id: "a" }] } })).listPendingInterestCountsForCompany();
    expect(ok.get("a")).toBe(1);
  });
});
