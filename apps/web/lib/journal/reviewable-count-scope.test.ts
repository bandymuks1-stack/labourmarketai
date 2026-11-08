import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `countReviewablePendingEntries()` for one reviewer in two organizations. The RPC
 * returns both organizations' entries (it has no organization filter); the count each
 * organization's screens show must be that organization's alone, and nothing may be lost.
 */
const state = vi.hoisted(() => ({
  ids: [] as string[] | null,
  rpcError: null as { code?: string } | null,
  rows: [] as { id: string; engagement_contexts: { organization_id: string } | null }[],
  rowsError: null as { code?: string } | null,
  active: null as string | null,
  calls: { rpc: 0, rows: 0 },
  filters: [] as string[],
}));

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <F,>(fn: F) => fn }));
vi.mock("@/lib/company/active-organization", () => ({
  getActiveOrganizationContext: async () => ({ activeOrganizationId: state.active }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async () => {
      state.calls.rpc += 1;
      return { data: state.ids, error: state.rpcError };
    },
    from: () => ({
      select: () => ({
        in: (_column: string, ids: string[]) => {
          const filters: string[] = [];
          const builder = {
            is(column: string, value: null) {
              filters.push(`${column}:${value}`);
              return builder;
            },
            then(resolve: (v: unknown) => void) {
              state.calls.rows += 1;
              state.filters = filters;
              resolve({
                data: state.rowsError ? null : state.rows.filter((r) => ids.includes(r.id)),
                error: state.rowsError,
              });
            },
          };
          return builder;
        },
      }),
    }),
  }),
}));

const { countReviewablePendingEntries, countReviewableEntriesEverywhere } = await import("./reviewable-count");

const ALFA = "org-alfa";
const BETA = "org-beta";

beforeEach(() => {
  state.ids = ["a1", "b1", "a2", "x1", "b2", "a3"];
  state.rpcError = null;
  state.rows = [
    { id: "a1", engagement_contexts: { organization_id: ALFA } },
    { id: "b1", engagement_contexts: { organization_id: BETA } },
    { id: "a2", engagement_contexts: { organization_id: ALFA } },
    { id: "x1", engagement_contexts: null },
    { id: "b2", engagement_contexts: { organization_id: BETA } },
    { id: "a3", engagement_contexts: { organization_id: ALFA } },
  ];
  state.rowsError = null;
  state.active = null;
  state.calls = { rpc: 0, rows: 0 };
});

describe("a reviewer in two organizations", () => {
  it("counts only Alfa's entries under Alfa", async () => {
    state.active = ALFA;
    expect(await countReviewablePendingEntries()).toBe(3);
  });

  it("reads the organizations of live entries only", async () => {
    state.active = ALFA;
    await countReviewablePendingEntries();
    expect(state.filters).toEqual(["deleted_at:null", "superseded_by:null"]);
  });

  it("counts only Beta's entries under Beta", async () => {
    state.active = BETA;
    expect(await countReviewablePendingEntries()).toBe(2);
  });

  it("loses nothing: Alfa + Beta + the unreadable entry is the whole set", async () => {
    state.active = ALFA;
    const alfa = await countReviewablePendingEntries();
    state.active = BETA;
    const beta = await countReviewablePendingEntries();
    expect(await countReviewableEntriesEverywhere()).toBe(6);
    expect((alfa ?? 0) + (beta ?? 0) + 1).toBe(6);
  });

  it("an entry whose row the reader cannot see is claimed by no organization", async () => {
    state.active = ALFA;
    state.rows = state.rows.filter((r) => r.id !== "a3");
    expect(await countReviewablePendingEntries()).toBe(2);
  });
});

describe("no organization active", () => {
  it("counts every reviewable entry, without reading the rows", async () => {
    expect(await countReviewablePendingEntries()).toBe(6);
    expect(state.calls.rows).toBe(0);
  });
});

describe("unknown is not zero", () => {
  it("a failed set read is unknown", async () => {
    state.active = ALFA;
    state.ids = null;
    state.rpcError = { code: "57014" };
    expect(await countReviewablePendingEntries()).toBeNull();
    expect(await countReviewableEntriesEverywhere()).toBeNull();
  });

  it("a failed organization read is unknown, never the unscoped number", async () => {
    state.active = ALFA;
    state.rowsError = { code: "57014" };
    expect(await countReviewablePendingEntries()).toBeNull();
  });

  it("an absent RPC is no queue at all, zero", async () => {
    state.active = ALFA;
    state.ids = null;
    state.rpcError = { code: "42883" };
    expect(await countReviewablePendingEntries()).toBe(0);
  });

  it("an empty set is zero without reading the rows", async () => {
    state.active = ALFA;
    state.ids = [];
    expect(await countReviewablePendingEntries()).toBe(0);
    expect(state.calls.rows).toBe(0);
  });
});
