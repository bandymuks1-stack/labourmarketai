import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The spine's team-offer count (production 2026-10-15): ONE
 * count_received_team_offers_v1 call instead of one list call per open need;
 * the per-need reads only while the function is not applied.
 */
const calls: { fn: string; args: unknown }[] = [];
let answers: Record<string, { data: unknown; error: { code?: string } | null }[]> = {};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(answers[fn]?.shift() ?? { data: [], error: null });
    },
  }),
}));

import { countOpenTeamOffersByDemand } from "./team-offer";

beforeEach(() => {
  calls.length = 0;
  answers = {};
});

describe("countOpenTeamOffersByDemand", () => {
  it("asks ONCE with every id and keeps only positive counts", async () => {
    answers.count_received_team_offers_v1 = [
      { data: [{ request_id: "a", offered: 2 }, { request_id: "b", offered: 0 }], error: null },
    ];
    const out = await countOpenTeamOffersByDemand(["a", "b", "a", "c"]);
    expect(calls).toEqual([{ fn: "count_received_team_offers_v1", args: { p_request_ids: ["a", "b", "c"] } }]);
    expect([...out]).toEqual([["a", 2]]);
  });

  it("no ids → no read", async () => {
    expect((await countOpenTeamOffersByDemand([])).size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("falls back to the per-need list only while the function is missing", async () => {
    answers.count_received_team_offers_v1 = [{ data: null, error: { code: "PGRST202" } }];
    answers.list_team_offers_for_request_v2 = [{ data: [], error: null }, { data: [], error: null }];
    await countOpenTeamOffersByDemand(["a", "b"]);
    expect(calls.map((c) => c.fn)).toEqual([
      "count_received_team_offers_v1",
      "list_team_offers_for_request_v2",
      "list_team_offers_for_request_v2",
    ]);
  });

  it("any other error counts nothing and does not fan out", async () => {
    answers.count_received_team_offers_v1 = [{ data: null, error: { code: "57014" } }];
    expect((await countOpenTeamOffersByDemand(["a", "b"])).size).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
