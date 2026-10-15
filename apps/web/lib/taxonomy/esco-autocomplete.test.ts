import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ESCO typeahead performance contract (production 2026-10-15): the prefix
 * match must go through the computed field `esco_label_lower` (an indexed
 * lower(label)), and fall back to the old ILIKE only while the field is not
 * applied. Same answer either way.
 */
type Call = { method: string; args: unknown[] };
const calls: Call[][] = [];
let results: { data: unknown; error: { code?: string } | null }[] = [];

function builder() {
  const mine: Call[] = [];
  calls.push(mine);
  const b: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "like", "ilike", "order"]) {
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
  createClient: async () => ({ from: (t: string) => (builder() as { from: (t: string) => unknown }).from(t) }),
}));

import { LOWER_FIELD, searchEscoLabels } from "./esco-autocomplete";

beforeEach(() => {
  calls.length = 0;
});

describe("ESCO typeahead uses the indexed lower(label) field", () => {
  it("queries esco_label_lower with a lower-cased prefix and orders by it", async () => {
    results = [{ data: [{ concept_id: "c1", concept_type: "skill", label: "Plytelių klojimas" }], error: null }];
    const out = await searchEscoLabels("Plyt", "lt", "skill");
    expect(out).toEqual([{ conceptId: "c1", conceptType: "skill", label: "Plytelių klojimas" }]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContainEqual({ method: "like", args: [LOWER_FIELD, "plyt%"] });
    expect(calls[0]).toContainEqual({ method: "order", args: [LOWER_FIELD, { ascending: true }] });
    expect(calls[0].some((c) => c.method === "ilike")).toBe(false);
  });

  it("falls back to ILIKE only when the computed field is not applied", async () => {
    results = [
      { data: null, error: { code: "42703" } },
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
