import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * F8 (counter-canonical v1): UNKNOWN IS NOT ZERO. The reviewable-queue count
 * used to return 0 on ANY error, so a failed read told a reviewer "nothing is
 * waiting" - on the company home, the arena pulse and the reports hub.
 */
let rpcResult: { data: unknown; error: { code?: string } | null } = { data: [], error: null };
let throws = false;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: async () => {
      if (throws) throw new Error("boom");
      return rpcResult;
    },
  })),
}));

import { countReviewablePendingEntries } from "@/lib/journal/reviewable-count";

beforeEach(() => {
  rpcResult = { data: [], error: null };
  throws = false;
});

describe("countReviewablePendingEntries", () => {
  it("counts the queue the RPC returned", async () => {
    rpcResult = { data: ["a", "b", "c"], error: null };
    expect(await countReviewablePendingEntries()).toBe(3);
  });

  it("an empty queue is a real 0", async () => {
    expect(await countReviewablePendingEntries()).toBe(0);
  });

  it("a failed read is null (unknown), not 0", async () => {
    rpcResult = { data: null, error: { code: "57014" } };
    expect(await countReviewablePendingEntries()).toBeNull(); // pre-fix: 0
    throws = true;
    expect(await countReviewablePendingEntries()).toBeNull();
  });

  it("an RPC that is not installed means no queue exists: 0", async () => {
    rpcResult = { data: null, error: { code: "42883" } };
    expect(await countReviewablePendingEntries()).toBe(0);
  });
});
