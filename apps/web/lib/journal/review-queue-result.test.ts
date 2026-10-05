import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UNKNOWN is not ZERO for the manager's review queue (SEP-7).
 * The gating RPC failing must not read as "nothing to review".
 */

const h = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: h.rpc, from: h.from }),
}));

import { fetchQuickReviewQueue, readQuickReviewQueueResult } from "./review-queue";

beforeEach(() => {
  h.rpc.mockReset();
  h.from.mockReset();
});

describe("readQuickReviewQueueResult", () => {
  it("an empty gated set is ok with no entries - the only 'nothing to review'", async () => {
    h.rpc.mockResolvedValue({ data: [], error: null });
    expect(await readQuickReviewQueueResult()).toEqual({ status: "ok", entries: [] });
  });

  it("a gating RPC that is not applied is needs-migration, not a failure", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "42883" } });
    expect(await readQuickReviewQueueResult()).toEqual({ status: "needs-migration" });
    h.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    expect(await readQuickReviewQueueResult()).toEqual({ status: "needs-migration" });
  });

  it("any other gating RPC failure is unavailable - never an empty queue", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await readQuickReviewQueueResult()).toEqual({ status: "unavailable" });
    h.rpc.mockRejectedValue(new Error("network"));
    expect(await readQuickReviewQueueResult()).toEqual({ status: "unavailable" });
    h.rpc.mockResolvedValue({ data: null, error: null });
    expect(await readQuickReviewQueueResult()).toEqual({ status: "unavailable" });
  });

  it("a failed entry read after a non-empty gate is unavailable", async () => {
    h.rpc.mockResolvedValue({ data: ["e1"], error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "in", "order"]) chain[m] = () => chain;
    chain.then = (res: (v: unknown) => unknown) => res({ data: null, error: { code: "57014" } });
    h.from.mockReturnValue(chain);
    expect(await readQuickReviewQueueResult()).toEqual({ status: "unavailable" });
  });
});

describe("fetchQuickReviewQueue - legacy shape preserved", () => {
  it("an unreadable or unapplied gate still answers the historical empty queue", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
    expect(await fetchQuickReviewQueue()).toEqual([]);
    h.rpc.mockResolvedValue({ data: null, error: { code: "42883" } });
    expect(await fetchQuickReviewQueue()).toEqual([]);
  });

  it("a failed entry read still THROWS, as before", async () => {
    h.rpc.mockResolvedValue({ data: ["e1"], error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "in", "order"]) chain[m] = () => chain;
    chain.then = (res: (v: unknown) => unknown) => res({ data: null, error: { code: "57014" } });
    h.from.mockReturnValue(chain);
    await expect(fetchQuickReviewQueue()).rejects.toThrow(/review_queue_unavailable/);
  });
});
