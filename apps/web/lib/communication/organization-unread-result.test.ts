import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN ≠ ZERO for an organization's unread (SEP-7). Two collapses existed:
 * the person-scoped unread read (fixed in unread.ts) and the scoping reads
 * themselves, whose errors were ignored. A thread RLS hides is the designed
 * default-closed answer ("not the organization's"); a read that ERRORED is a
 * different fact and must surface as unavailable.
 */

type R = { data?: unknown; error?: { code?: string } | null };

async function load(opts: {
  unread: { status: "ok"; ids: string[] } | { status: "unavailable" };
  user?: { id: string } | null;
  tables?: Partial<Record<"company_memberships" | "engagement_contexts" | "customer_requests" | "conversation_participants" | "conversations", R>>;
}) {
  vi.resetModules();
  vi.doMock("server-only", () => ({}));
  vi.doMock("./unread", () => ({
    getUnreadConversationIds: vi.fn(),
    getUnreadConversationIdsResult: async () => (opts.unread.status === "ok" ? { status: "ok", ids: new Set(opts.unread.ids) } : { status: "unavailable" }),
  }));
  const user = opts.user === undefined ? { id: "me" } : opts.user;
  const result = (t: string): R => opts.tables?.[t as keyof typeof opts.tables] ?? { data: [] };
  const chain = (t: string): unknown => {
    const r = result(t);
    const out: Record<string, unknown> = {};
    const settle = Promise.resolve({ data: r.data ?? [], error: r.error ?? null });
    for (const k of ["eq", "in", "is", "limit"]) out[k] = () => out;
    out.then = settle.then.bind(settle);
    return out;
  };
  const client = { auth: { getUser: async () => ({ data: { user } }) }, from: (t: string) => ({ select: () => chain(t) }) };
  vi.doMock("@/lib/supabase/server", () => ({ createClient: async () => client }));
  return import("./organization-scope");
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("getUnreadConversationIdsForOrganizationResult", () => {
  it("an unavailable person-scoped read is UNAVAILABLE, not an empty organization inbox", async () => {
    const m = await load({ unread: { status: "unavailable" } });
    expect(await m.getUnreadConversationIdsForOrganizationResult("org")).toEqual({ status: "unavailable" });
  });

  it("nothing unread for the person is a successful EMPTY read", async () => {
    const m = await load({ unread: { status: "ok", ids: [] } });
    const r = await m.getUnreadConversationIdsForOrganizationResult("org");
    expect(r.status === "ok" && r.ids.size).toBe(0);
  });

  it("a missing user is UNAVAILABLE", async () => {
    const m = await load({ unread: { status: "ok", ids: ["c1"] }, user: null });
    expect(await m.getUnreadConversationIdsForOrganizationResult("org")).toEqual({ status: "unavailable" });
  });

  it("a scoping read that ERRORED is UNAVAILABLE — but a thread RLS hides is simply not the organization's", async () => {
    const errored = await load({
      unread: { status: "ok", ids: ["c1"] },
      tables: { company_memberships: { error: { code: "XX000" } } },
    });
    expect(await errored.getUnreadConversationIdsForOrganizationResult("org")).toEqual({ status: "unavailable" });

    const hidden = await load({ unread: { status: "ok", ids: ["c1"] } }); // every read succeeded, none scopes c1
    const r = await hidden.getUnreadConversationIdsForOrganizationResult("org");
    expect(r.status).toBe("ok");
    expect(r.status === "ok" && r.ids.size).toBe(0);
  });

  it("scopes a thread whose other participant is on the organization's team", async () => {
    const m = await load({
      unread: { status: "ok", ids: ["c1", "c2"] },
      tables: {
        company_memberships: { data: [{ profile_id: "worker" }] },
        conversation_participants: { data: [{ conversation_id: "c1", profile_id: "me" }, { conversation_id: "c1", profile_id: "worker" }, { conversation_id: "c2", profile_id: "me" }, { conversation_id: "c2", profile_id: "stranger" }] },
        conversations: { data: [{ id: "c1" }, { id: "c2" }] },
      },
    });
    const r = await m.getUnreadConversationIdsForOrganizationResult("org");
    expect(r.status === "ok" && [...r.ids]).toEqual(["c1"]);
  });
});

describe("the historical reader keeps its lossy shape by delegating", () => {
  it("failure reads as the empty set; success is unchanged", async () => {
    expect((await (await load({ unread: { status: "unavailable" } })).getUnreadConversationIdsForOrganization("org")).size).toBe(0);
    const ok = await load({
      unread: { status: "ok", ids: ["c1"] },
      tables: {
        company_memberships: { data: [{ profile_id: "worker" }] },
        conversation_participants: { data: [{ conversation_id: "c1", profile_id: "worker" }] },
        conversations: { data: [{ id: "c1" }] },
      },
    });
    expect([...(await ok.getUnreadConversationIdsForOrganization("org"))]).toEqual(["c1"]);
  });
});
