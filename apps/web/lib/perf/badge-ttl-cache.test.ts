import { beforeEach, describe, expect, it } from "vitest";

import { clearBadgeCache, rememberBadge } from "./badge-ttl-cache";

describe("rememberBadge (2026-10-19 frame perf)", () => {
  beforeEach(() => clearBadgeCache());

  it("loads once inside the ttl, again after it", async () => {
    let calls = 0;
    let t = 1_000;
    const load = async () => ++calls;
    expect(await rememberBadge("b", "u1|w1", 100, load, () => t)).toBe(1);
    t += 50;
    expect(await rememberBadge("b", "u1|w1", 100, load, () => t)).toBe(1);
    t += 100;
    expect(await rememberBadge("b", "u1|w1", 100, load, () => t)).toBe(2);
  });

  it("keeps viewers and workspaces apart", async () => {
    let calls = 0;
    const load = async () => ++calls;
    await rememberBadge("b", "u1|w1", 60_000, load);
    expect(await rememberBadge("b", "u1|w2", 60_000, load)).toBe(2);
    expect(await rememberBadge("b", "u2|w1", 60_000, load)).toBe(3);
    expect(await rememberBadge("other", "u1|w1", 60_000, load)).toBe(4);
  });

  it("never caches without a viewer, and never caches a failed load", async () => {
    let calls = 0;
    const load = async () => ++calls;
    await rememberBadge("b", null, 60_000, load);
    expect(await rememberBadge("b", null, 60_000, load)).toBe(2);
    await expect(rememberBadge("f", "u1|w1", 60_000, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await rememberBadge("f", "u1|w1", 60_000, async () => 7)).toBe(7);
  });

  it("does not remember a value the caller marks as a failed read", async () => {
    let calls = 0;
    const load = async () => (++calls === 1 ? { kind: "unavailable" as const } : { kind: "ok" as const, n: calls });
    const keep = (v: { kind: string }) => v.kind === "ok";
    expect((await rememberBadge("p", "u1|w1|s", 60_000, load, Date.now, keep)).kind).toBe("unavailable");
    expect(await rememberBadge("p", "u1|w1|s", 60_000, load, Date.now, keep)).toEqual({ kind: "ok", n: 2 });
    // the ok value is now remembered
    expect(await rememberBadge("p", "u1|w1|s", 60_000, load, Date.now, keep)).toEqual({ kind: "ok", n: 2 });
  });
});
