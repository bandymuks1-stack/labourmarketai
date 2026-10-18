import { afterEach, describe, expect, it, vi } from "vitest";

import {
  emitNotificationEvent,
  isNotificationStoreWriteBlocked,
  resetNotificationStoreWriteBlock,
} from "./events";

/**
 * 42501 — the store exists, the writer is unprivileged (production since
 * 2026-07-05; the GRANT is the owner's RED draft #1566).
 *
 * Lane H 2026-09-06 measured 40 identical failure lines in 12 h of runtime
 * logs, one per dashboard render. The claims pinned here:
 *   1. the first 42501 is a NAMED outcome (`write_blocked`), never
 *      `unexpected_error` — so the fire-and-forget wrapper's "something real"
 *      line does not fire once per visit;
 *   2. while blocked, the next emit does not touch the client at all;
 *   3. the block is bounded (TTL) and any other error stays what it was —
 *      the degrade names exactly one condition, not "all failures".
 */

const INPUT = {
  recipientProfileId: "5a0b1a2c-3d4e-4f60-8a71-8b9c0d1e2f30",
  eventType: "weekly_digest" as const,
  entityType: "weekly_digest" as const,
  entityId: "6b1c2d3e-4f50-4617-9283-9c0d1e2f3a41",
};

function clientAnswering(code: string | null) {
  let inserts = 0;
  const client = {
    from: () => ({
      insert: () => {
        inserts += 1;
        return Promise.resolve({ error: code ? { code } : null });
      },
    }),
  } as never;
  return { client, inserts: () => inserts };
}

describe("notification store write block (42501)", () => {
  afterEach(() => {
    resetNotificationStoreWriteBlock();
    vi.restoreAllMocks();
  });

  it("the first 42501 is the named write_blocked outcome, reported once", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientAnswering("42501");
    expect(await emitNotificationEvent(client, INPUT)).toEqual({
      kind: "write_blocked",
      code: "42501",
    });
    expect(isNotificationStoreWriteBlocked()).toBe(true);
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toMatch(/42501/);
  });

  it("while blocked the next emit skips the client entirely and logs nothing new", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const first = clientAnswering("42501");
    await emitNotificationEvent(first.client, INPUT);
    const second = clientAnswering(null);
    expect(await emitNotificationEvent(second.client, INPUT)).toEqual({
      kind: "write_blocked",
      code: "42501",
    });
    expect(second.inserts()).toBe(0);
    expect(err).toHaveBeenCalledTimes(1);
  });

  it("the block is bounded — after the TTL the write is attempted again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = clientAnswering("42501");
    await emitNotificationEvent(client, INPUT);
    expect(isNotificationStoreWriteBlocked(Date.now() + 14 * 60 * 1000)).toBe(true);
    expect(isNotificationStoreWriteBlocked(Date.now() + 16 * 60 * 1000)).toBe(false);
  });

  it("NEGATIVE CONTROL — any other error is still unexpected_error and does not block", async () => {
    const { client } = clientAnswering("XX000");
    expect(await emitNotificationEvent(client, INPUT)).toEqual({
      kind: "unexpected_error",
      code: "XX000",
    });
    expect(isNotificationStoreWriteBlocked()).toBe(false);
    const absent = clientAnswering("42P01");
    expect(await emitNotificationEvent(absent.client, INPUT)).toEqual({
      kind: "feature_unavailable",
    });
    expect(isNotificationStoreWriteBlocked()).toBe(false);
  });
});
