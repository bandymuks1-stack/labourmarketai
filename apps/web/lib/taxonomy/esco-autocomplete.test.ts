import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ESCO typeahead performance contract (production 2026-10-15): the prefix
 * match goes through `search_esco_labels_v1` (an indexed lower(label) range
 * with the table's own visibility), and falls back to the old ILIKE only
 * while the function is not applied. Same answer either way.
 */
type Call = { method: string; args: unknown[] };
const calls: Call[][] = [];
let results: { data: unknown; error: { code?: string } | null }[] = [];

function builder() {
  const mine: Call[] = [];
  calls.push(mine);
  const b: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "ilike", "order"]) {
    b[m] = (...args: unknown[]) => {
      mine.push({ method: m, args });
      return b;
    };
  }
  b.limit = (...args: unknown[]) => {
    mine.push({ method: "limit", args });
    return Promise.resolve(results.shift());
  };
  return b;
}

vi.mock("@/lib/config/esco", () => ({ ESCO_AUTOCOMPLETE_ENABLED: true }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (t: string) => (builder() as { from: (t: string) => unknown }).from(t),
    rpc: (fn: string, args: unknown) => {
      calls.push([{ method: "rpc", args: [fn, args] }]);
      return Promise.resolve(results.shift());
    },
  }),
}));

import { SEARCH_RPC, searchEscoLabels } from "./esco-autocomplete";

beforeEach(() => {
  calls.length = 0;
});

describe("ESCO typeahead uses the indexed search function", () => {
  it("calls search_esco_labels_v1 with the raw prefix, locale, type and limit", async () => {
    results = [{ data: [{ concept_id: "c1", concept_type: "skill", label: "Plytelių klojimas" }], error: null }];
    const out = await searchEscoLabels(" Plyt_ ", "lt", "skill");
    expect(out).toEqual([{ conceptId: "c1", conceptType: "skill", label: "Plytelių klojimas" }]);
    expect(calls).toEqual([
      [{ method: "rpc", args: [SEARCH_RPC, { p_locale: "lt", p_concept_type: "skill", p_prefix: "Plyt_", p_limit: 10 }] }],
    ]);
  });

  it("falls back to ILIKE only when the function is not applied", async () => {
    results = [
      { data: null, error: { code: "PGRST202" } },
      { data: [{ concept_id: "c2", concept_type: "skill", label: "Plytelių pjovimas" }], error: null },
    ];
    const out = await searchEscoLabels("plyt", "lt", "skill");
    expect(out[0].conceptId).toBe("c2");
    expect(calls).toHaveLength(2);
    expect(calls[1]).toContainEqual({ method: "ilike", args: ["label", "plyt%"] });
  });

  it("another error is not retried and answers an empty list (honest degrade)", async () => {
    results = [{ data: null, error: { code: "57014" } }];
    expect(await searchEscoLabels("plyt", "lt", "skill")).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});
