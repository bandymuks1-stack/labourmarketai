import { describe, expect, it } from "vitest";

import {
  DEFAULT_FORECAST_MODE,
  INTERNAL_MODE_NAME,
  LIVE_DEBOUNCE_MS,
  LIVE_MAX_WAIT_MS,
  recomputeDecision,
  recomputeInstants,
  type RecomputeState,
} from "./forecast-modes";

const state = (over: Partial<RecomputeState>): RecomputeState => ({
  mode: "weekly",
  enabled: true,
  lastComputedAt: null,
  firstSignalAt: null,
  lastSignalAt: null,
  ...over,
});

// 2026-10-18 is a Sunday; 2026-10-19 a Monday.
const SUNDAY = "2026-10-18T03:00:00.000Z";
const MONDAY = "2026-10-19T03:00:00.000Z";

describe("cadence per mode", () => {
  it("every organization starts on the weekly cadence", () => {
    expect(DEFAULT_FORECAST_MODE).toBe("weekly");
  });

  it("weekly: only on Sundays, once per Sunday", () => {
    expect(recomputeDecision(state({}), MONDAY)).toEqual({ due: false, reason: "not_yet" });
    expect(recomputeDecision(state({}), SUNDAY)).toEqual({ due: true, reason: "first" });
    expect(recomputeDecision(state({ lastComputedAt: "2026-10-18T00:05:00.000Z" }), SUNDAY).due).toBe(false);
    expect(recomputeDecision(state({ lastComputedAt: "2026-10-11T00:05:00.000Z" }), SUNDAY)).toEqual({ due: true, reason: "schedule" });
    // A significant change does not make a weekly forecast recompute on a Wednesday.
    expect(
      recomputeDecision(
        state({ lastComputedAt: "2026-10-18T00:05:00.000Z", firstSignalAt: "2026-10-21T08:00:00.000Z", lastSignalAt: "2026-10-21T08:00:00.000Z" }),
        "2026-10-21T12:00:00.000Z",
      ).due,
    ).toBe(false);
  });

  it("daily: once per UTC day", () => {
    const s = state({ mode: "daily", lastComputedAt: "2026-10-19T00:05:00.000Z" });
    expect(recomputeDecision(s, "2026-10-19T23:55:00.000Z").due).toBe(false);
    expect(recomputeDecision(s, "2026-10-20T00:00:00.000Z")).toEqual({ due: true, reason: "schedule" });
  });

  it("hourly: once per UTC hour", () => {
    const s = state({ mode: "hourly", lastComputedAt: "2026-10-19T10:00:00.000Z" });
    expect(recomputeDecision(s, "2026-10-19T10:55:00.000Z").due).toBe(false);
    expect(recomputeDecision(s, "2026-10-19T11:00:00.000Z")).toEqual({ due: true, reason: "schedule" });
  });

  it("live: after a significant change, debounced, never starved", () => {
    const base = state({ mode: "live", lastComputedAt: "2026-10-19T08:00:00.000Z" });
    const t0 = Date.parse("2026-10-19T10:00:00.000Z");
    const iso = (ms: number) => new Date(ms).toISOString();
    // No signal, same day: nothing to do.
    expect(recomputeDecision(base, iso(t0)).due).toBe(false);
    // A signal one minute ago: still debouncing.
    const one = { ...base, firstSignalAt: iso(t0 - 60_000), lastSignalAt: iso(t0 - 60_000) };
    expect(recomputeDecision(one, iso(t0))).toEqual({ due: false, reason: "debouncing" });
    // Quiet for the debounce window: due.
    expect(recomputeDecision(one, iso(t0 - 60_000 + LIVE_DEBOUNCE_MS))).toEqual({ due: true, reason: "signal" });
    // A burst that never goes quiet is still recomputed after the max wait.
    const burst = { ...base, firstSignalAt: iso(t0 - LIVE_MAX_WAIT_MS), lastSignalAt: iso(t0 - 10_000) };
    expect(recomputeDecision(burst, iso(t0))).toEqual({ due: true, reason: "signal_max_wait" });
    // The passing of time is reflected daily even without a change.
    expect(recomputeDecision(base, "2026-10-20T00:00:00.000Z")).toEqual({ due: true, reason: "daily_baseline" });
  });

  it("switched off: never due, whatever the mode", () => {
    for (const mode of ["weekly", "daily", "hourly", "live"] as const) {
      expect(recomputeDecision(state({ mode, enabled: false }), SUNDAY)).toEqual({ due: false, reason: "disabled" });
    }
  });

  it("internal names are internal: not one of them is a suggested public label", async () => {
    const { SUGGESTED_PUBLIC_MODE_LABEL } = await import("./forecast-modes");
    for (const mode of Object.keys(INTERNAL_MODE_NAME) as (keyof typeof INTERNAL_MODE_NAME)[]) {
      expect(SUGGESTED_PUBLIC_MODE_LABEL[mode]).not.toMatch(/VIP|SUPER|FREE/i);
    }
  });
});

describe("recompute instants over a week", () => {
  const from = "2026-10-12T00:00:00.000Z"; // Monday
  const to = "2026-10-18T23:55:00.000Z"; // Sunday
  const signals = ["2026-10-14T09:00:00.000Z"];

  it("weekly computes once (Sunday), daily seven times, hourly every hour", () => {
    expect(recomputeInstants("weekly", from, to, signals)).toEqual(["2026-10-18T00:00:00.000Z"]);
    expect(recomputeInstants("daily", from, to, signals)).toHaveLength(7);
    expect(recomputeInstants("hourly", from, to, signals)).toHaveLength(7 * 24);
  });

  it("live reacts to the change within the debounce + one tick", () => {
    const live = recomputeInstants("live", from, to, signals);
    expect(live[0]).toBe(from);
    const reaction = live.find((t) => t > signals[0])!;
    expect(Date.parse(reaction) - Date.parse(signals[0])).toBeLessThanOrEqual(LIVE_DEBOUNCE_MS + 5 * 60 * 1000);
    // Daily baseline + the one signal-driven recompute.
    expect(live).toHaveLength(8);
  });
});
