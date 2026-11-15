import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { supabaseEvidenceStore } from "./evidence-store";

/**
 * The server answers at most 1000 rows per request (PostgREST max_rows). A
 * fake that enforces exactly that proves the store reads EVERY row of a large
 * import and of a large organization, and fails a read it cannot finish.
 */
function fakeClient(total: number, failAtFrom: number | null = null) {
  const calls: Array<[number, number]> = [];
  const builder = () => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "in", "order"]) q[m] = () => q;
    q.range = (from: number, to: number) => {
      calls.push([from, to]);
      if (failAtFrom !== null && from >= failAtFrom) return Promise.resolve({ data: null, error: { code: "57014", message: "timeout" } });
      const end = Math.min(to, from + 999, total - 1);
      const data = from > end ? [] : Array.from({ length: end - from + 1 }, (_, i) => ({ id: `r${from + i}` }));
      return Promise.resolve({ data, error: null });
    };
    q.limit = (n: number) => Promise.resolve({ data: Array.from({ length: Math.min(n, 1000, total) }, (_, i) => ({ id: `r${i}` })), error: null });
    return q;
  };
  return { client: { from: () => builder() }, calls };
}

const store = (client: unknown) => supabaseEvidenceStore({ supabase: client, userId: "u" } as never);

describe("the evidence store reads past the server's 1000-row answer", () => {
  it("an import of 2,500 staged rows is read whole (it committed only 1000 before)", async () => {
    const { client, calls } = fakeClient(2500);
    const res = await store(client).listStagedRows("s", ["id"]);
    expect(res.error).toBeNull();
    expect(res.data).toHaveLength(2500);
    expect(calls.length).toBe(3);
  });

  it("the duplicate check sees every existing record of the organization", async () => {
    const { client } = fakeClient(2900);
    const res = await store(client).readRecordKeys("org");
    expect(res.data).toHaveLength(2900);
  });

  it("a failed page fails the read instead of answering a partial list", async () => {
    const { client } = fakeClient(2500, 1000);
    const res = await store(client).readRecordKeys("org");
    expect(res.data).toBeNull();
    expect(res.error?.code).toBe("57014");
  });

  it("exactly a full last page still ends cleanly", async () => {
    const { client } = fakeClient(2000);
    const res = await store(client).readRoster("org");
    expect(res.data).toHaveLength(2000);
  });
});
