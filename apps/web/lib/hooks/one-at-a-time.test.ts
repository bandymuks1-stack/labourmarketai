import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { oneAtATime, refreshWhenSettled } from "./one-at-a-time";

describe("oneAtATime", () => {
  it("two calls in one tick run the save once", async () => {
    const guard = oneAtATime();
    const save = vi.fn(async () => "saved");
    const answers = await Promise.all([guard("row", save), guard("row", save)]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(answers).toEqual(["saved", undefined]);
  });

  it("another row is not held back", async () => {
    const guard = oneAtATime();
    const save = vi.fn(async () => "saved");
    await Promise.all([guard("a", save), guard("b", save)]);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("after a failure the row can be tried again", async () => {
    const guard = oneAtATime();
    await expect(guard("row", async () => Promise.reject(new Error("no")))).rejects.toThrow("no");
    expect(await guard("row", async () => "saved")).toBe("saved");
  });
});

describe("refreshWhenSettled", () => {
  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("ten rows are one refresh, after the last", () => {
    const refresh = vi.fn();
    const settled = refreshWhenSettled(refresh);
    for (let i = 0; i < 10; i++) settled.began();
    for (let i = 0; i < 10; i++) settled.ended(true);
    vi.advanceTimersByTime(5_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a row confirmed during the wait moves the refresh behind it", () => {
    const refresh = vi.fn();
    const settled = refreshWhenSettled(refresh, 1_000);
    settled.began();
    settled.ended(true);
    vi.advanceTimersByTime(900);
    settled.began();
    vi.advanceTimersByTime(5_000);
    expect(refresh).not.toHaveBeenCalled();
    settled.ended(true);
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("nothing saved, nothing refreshed", () => {
    const refresh = vi.fn();
    const settled = refreshWhenSettled(refresh);
    settled.began();
    settled.ended(false);
    vi.advanceTimersByTime(5_000);
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("the CV review panel", () => {
  const source = readFileSync(resolve(__dirname, "../../components/app/cv-import-section-review.tsx"), "utf8");

  it("refreshes only through the settled refresh, never per row", () => {
    expect(source.match(/router\.refresh\(\)/g)).toEqual(["router.refresh()"]);
    expect(source).toContain("refreshWhenSettled(() => router.refresh())");
  });

  it("every confirm it sends asks for no page tree", () => {
    const calls = source.match(/confirmCv\w+Action\((?:\{[^}]*\}|input)\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(11);
    expect(calls.filter((c) => !c.includes("refreshLater"))).toEqual([]);
  });
});
