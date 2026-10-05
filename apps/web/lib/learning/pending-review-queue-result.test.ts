import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { countPendingReviewQueue, readPendingReviewQueue } from "./signal-queue-producer";

/** UNKNOWN is not ZERO for the manager's pending learning suggestions (SEP-7). */

function client(result: () => Promise<unknown>): SupabaseClient {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq"]) c[m] = () => c;
  c.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
  return c as unknown as SupabaseClient;
}

describe("readPendingReviewQueue", () => {
  it("a successful empty count is ok 0 - the only 'none pending'", async () => {
    expect(await readPendingReviewQueue(client(async () => ({ count: 0, error: null })))).toEqual({
      status: "ok",
      count: 0,
    });
  });

  it("a successful count is ok N", async () => {
    expect(await readPendingReviewQueue(client(async () => ({ count: 3, error: null })))).toEqual({
      status: "ok",
      count: 3,
    });
  });

  it("an absent table holds no suggestion: ok 0, not a failure", async () => {
    expect(
      await readPendingReviewQueue(client(async () => ({ count: null, error: { code: "42P01" } }))),
    ).toEqual({ status: "ok", count: 0 });
  });

  it("any other error, a thrown read or a missing count is unavailable", async () => {
    expect(
      await readPendingReviewQueue(client(async () => ({ count: null, error: { code: "57014" } }))),
    ).toEqual({ status: "unavailable" });
    expect(
      await readPendingReviewQueue(
        client(async () => {
          throw new Error("network");
        }),
      ),
    ).toEqual({ status: "unavailable" });
    expect(await readPendingReviewQueue(client(async () => ({ count: null, error: null })))).toEqual({
      status: "unavailable",
    });
  });
});

describe("countPendingReviewQueue - legacy number preserved", () => {
  it("answers 0 on any failure and the count otherwise", async () => {
    expect(await countPendingReviewQueue(client(async () => ({ count: null, error: { code: "57014" } })))).toBe(0);
    expect(await countPendingReviewQueue(client(async () => ({ count: 5, error: null })))).toBe(5);
  });
});
