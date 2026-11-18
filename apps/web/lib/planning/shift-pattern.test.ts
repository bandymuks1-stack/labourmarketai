import { describe, expect, it } from "vitest";

import {
  countShiftDays,
  expandShiftRuns,
  isShiftDay,
  narrowVerdictToShiftRuns,
  parseShiftPattern,
  shiftPatternFromForm,
  shiftPatternToJson,
  type ShiftPattern,
} from "@/lib/planning/shift-pattern";
import { reserveCapacity } from "@/lib/workforce/commitment-reservation";

// 2026-10-26 is a Monday.
const MON = "2026-10-26";

describe("parseShiftPattern — mirrors the database CHECK", () => {
  it("accepts and canonicalizes weekly days", () => {
    expect(parseShiftPattern({ kind: "weekly", days: [5, 1, 3] })).toEqual({
      kind: "weekly",
      days: [1, 3, 5],
    });
  });

  it("accepts a cycle and defaults the offset to 0", () => {
    expect(parseShiftPattern({ kind: "cycle", on: 4, off: 2 })).toEqual({
      kind: "cycle",
      on: 4,
      off: 2,
      offset: 0,
    });
  });

  it.each([
    null,
    [],
    "weekly",
    { kind: "weekly", days: [] },
    { kind: "weekly", days: [0] },
    { kind: "weekly", days: [8] },
    { kind: "weekly", days: [1, 1] },
    { kind: "weekly", days: ["1"] },
    { kind: "weekly", days: [1.5] },
    { kind: "weekly", days: [1], extra: true },
    { kind: "cycle", on: 0, off: 2 },
    { kind: "cycle", on: 4, off: 0 },
    { kind: "cycle", on: 29, off: 2 },
    { kind: "cycle", on: 4, off: 29 },
    { kind: "cycle", on: 4, off: 2, offset: 6 },
    { kind: "cycle", on: 4, off: 2, offset: -1 },
    { kind: "cycle", on: "4", off: 2 },
    { kind: "cycle", on: 4, off: 2, colour: "red" },
    { kind: "daily" },
  ])("refuses %j", (raw) => {
    expect(parseShiftPattern(raw)).toBeNull();
  });

  it("round-trips through the stored JSON", () => {
    const p: ShiftPattern = { kind: "cycle", on: 4, off: 2, offset: 3 };
    expect(parseShiftPattern(shiftPatternToJson(p))).toEqual(p);
  });
});

describe("shiftPatternFromForm", () => {
  it("no repeat = a one-off window (today's behaviour)", () => {
    expect(shiftPatternFromForm({})).toEqual({ ok: true, pattern: null });
    expect(shiftPatternFromForm({ repeat: "none", weekdays: ["1"] })).toEqual({
      ok: true,
      pattern: null,
    });
  });

  it("weekly needs at least one valid weekday", () => {
    expect(shiftPatternFromForm({ repeat: "weekly", weekdays: ["1", "2", "3", "4", "5"] })).toEqual({
      ok: true,
      pattern: { kind: "weekly", days: [1, 2, 3, 4, 5] },
    });
    expect(shiftPatternFromForm({ repeat: "weekly", weekdays: [] })).toEqual({ ok: false });
    expect(shiftPatternFromForm({ repeat: "weekly", weekdays: ["9"] })).toEqual({ ok: false });
  });

  it("a half-filled cycle is invalid, never 'every day'", () => {
    expect(shiftPatternFromForm({ repeat: "cycle", cycleOn: "4", cycleOff: "" })).toEqual({ ok: false });
    expect(shiftPatternFromForm({ repeat: "cycle", cycleOn: "4", cycleOff: "2", cycleOffset: "" })).toEqual({
      ok: true,
      pattern: { kind: "cycle", on: 4, off: 2, offset: 0 },
    });
  });

  it("an unknown mode is invalid", () => {
    expect(shiftPatternFromForm({ repeat: "fortnightly" })).toEqual({ ok: false });
  });
});

describe("isShiftDay", () => {
  it("weekly uses ISO weekdays (Monday = 1, Sunday = 7)", () => {
    const p: ShiftPattern = { kind: "weekly", days: [1, 7] };
    expect(isShiftDay(p, MON, "2026-10-26")).toBe(true); // Mon
    expect(isShiftDay(p, MON, "2026-10-27")).toBe(false); // Tue
    expect(isShiftDay(p, MON, "2026-11-01")).toBe(true); // Sun
  });

  it("a 4/2 cycle repeats from the window's first day", () => {
    const p: ShiftPattern = { kind: "cycle", on: 4, off: 2, offset: 0 };
    const days = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.parse(`${MON}T00:00:00Z`) + i * 86_400_000);
      return isShiftDay(p, MON, d.toISOString().slice(0, 10)) ? "W" : ".";
    }).join("");
    expect(days).toBe("WWWW..WWWW..");
  });

  it("an offset staggers a second crew on the same rotation", () => {
    const p: ShiftPattern = { kind: "cycle", on: 4, off: 2, offset: 4 };
    expect(isShiftDay(p, MON, MON)).toBe(false);
    expect(isShiftDay(p, MON, "2026-10-28")).toBe(true);
  });

  it("days before the anchor and impossible days are never shift days", () => {
    const p: ShiftPattern = { kind: "weekly", days: [1, 2, 3, 4, 5, 6, 7] };
    expect(isShiftDay(p, MON, "2026-10-25")).toBe(false);
    expect(isShiftDay(p, MON, "2026-02-30")).toBe(false);
  });
});

describe("expandShiftRuns — the projection, never a store", () => {
  it("a null pattern is the whole window", () => {
    expect(expandShiftRuns(null, MON, "2026-10-30")).toEqual([
      { startDate: MON, endDate: "2026-10-30" },
    ]);
  });

  it("Mon–Fri over two weeks is two runs", () => {
    const p: ShiftPattern = { kind: "weekly", days: [1, 2, 3, 4, 5] };
    expect(expandShiftRuns(p, MON, "2026-11-08")).toEqual([
      { startDate: "2026-10-26", endDate: "2026-10-30" },
      { startDate: "2026-11-02", endDate: "2026-11-06" },
    ]);
  });

  it("clipping to a calendar range cuts a run at the edge", () => {
    const p: ShiftPattern = { kind: "cycle", on: 4, off: 2, offset: 0 };
    expect(
      expandShiftRuns(p, MON, "2026-11-30", { startDate: "2026-10-28", endDate: "2026-11-02" }),
    ).toEqual([
      { startDate: "2026-10-28", endDate: "2026-10-29" },
      { startDate: "2026-11-01", endDate: "2026-11-02" },
    ]);
  });

  it("a window with no working day yields no runs", () => {
    const p: ShiftPattern = { kind: "weekly", days: [6, 7] };
    expect(expandShiftRuns(p, MON, "2026-10-30")).toEqual([]);
    expect(countShiftDays(p, MON, "2026-10-30")).toBe(0);
  });

  it("counts days as a set", () => {
    expect(countShiftDays({ kind: "cycle", on: 4, off: 2, offset: 0 }, MON, "2026-11-06")).toBe(8);
  });

  it("refuses a reversed or malformed window", () => {
    expect(expandShiftRuns(null, "2026-10-30", MON)).toEqual([]);
    expect(expandShiftRuns(null, "not-a-day", MON)).toEqual([]);
  });
});

describe("narrowVerdictToShiftRuns — a warning about real shift days only (SEP-2, SEP-7)", () => {
  const pattern: ShiftPattern = { kind: "cycle", on: 4, off: 2, offset: 0 };
  const runs = expandShiftRuns(pattern, MON, "2026-11-06");

  it("leave on rest days only is not a collision", () => {
    const verdict = reserveCapacity({
      window: { startDate: MON, endDate: "2026-11-06" },
      held: [{ source: "absence", sourceId: "a1", label: null, startDate: "2026-10-30", endDate: "2026-10-31" }],
    });
    expect(verdict.state).toBe("collides");
    expect(narrowVerdictToShiftRuns(verdict, runs)).toEqual({ state: "clear", collisions: [], gaps: [] });
  });

  it("leave across two runs is two collisions with their own shared days", () => {
    const verdict = reserveCapacity({
      window: { startDate: MON, endDate: "2026-11-06" },
      held: [{ source: "absence", sourceId: "a1", label: null, startDate: "2026-10-29", endDate: "2026-11-01" }],
    });
    const narrowed = narrowVerdictToShiftRuns(verdict, runs);
    expect(narrowed.state).toBe("collides");
    expect(narrowed.collisions.map((c) => [c.overlapStart, c.overlapEnd])).toEqual([
      ["2026-10-29", "2026-10-29"],
      ["2026-11-01", "2026-11-01"],
    ]);
    // The absence still carries no reason.
    expect(narrowed.collisions.every((c) => c.label === null)).toBe(true);
  });

  it("an incomplete answer stays unknown, never clear", () => {
    const verdict = reserveCapacity({
      window: { startDate: MON, endDate: "2026-11-06" },
      held: [{ source: "booking", sourceId: "b1", label: null, startDate: "2026-10-30", endDate: "2026-10-31" }],
      unreadableSources: ["absence"],
    });
    expect(narrowVerdictToShiftRuns(verdict, runs).state).toBe("unknown");
  });

  it("clear and unknown verdicts pass through untouched", () => {
    const clear = { state: "clear", collisions: [], gaps: [] } as const;
    expect(narrowVerdictToShiftRuns(clear, runs)).toBe(clear);
  });
});
