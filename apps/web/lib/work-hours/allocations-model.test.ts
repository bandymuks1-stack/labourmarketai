import { describe, expect, it } from "vitest";

import {
  ALLOCATION_HOURS_MAX,
  isAllocationMigrationMissingCode,
  isValidAllocationStatus,
  isValidWorkDate,
  looksLikeAccidentalDuplicate,
  monthlyGrid,
  objectTint,
  parseHours,
  sumHours,
  workerDayTotals,
} from "./allocations-model";

/**
 * The invariant this whole feature exists to protect:
 *
 *     Vitalii · 2026-08-29 · Object 01 → 8 h
 *     Vitalii · 2026-08-29 · Object 05 → 2 h
 *
 * Two facts. Every aggregation below must SUM them into a 10 h day without
 * ever implying they should have been one row.
 */
const VITALII = "worker-vitalii";
const OBJ_01 = "object-01";
const OBJ_05 = "object-05";
const OBJ_12 = "object-12";

const split = [
  { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_01, hours: 8 },
  { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_05, hours: 2 },
];

describe("a worker's day may span several objects", () => {
  it("two objects on one day sum to one daily total", () => {
    const totals = workerDayTotals(split);
    expect(totals).toHaveLength(1);
    expect(totals[0]).toEqual({
      workerId: VITALII,
      workDate: "2026-08-29",
      hours: 10,
    });
  });

  it("the same object twice in a day is also two real facts", () => {
    // A morning and an afternoon shift. Nothing may collapse or reject these.
    const twoShifts = [
      { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_01, hours: 4 },
      { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_01, hours: 4 },
    ];
    const totals = workerDayTotals(twoShifts);
    expect(totals[0].hours).toBe(8);
  });

  it("different days stay different totals", () => {
    const totals = workerDayTotals([
      ...split,
      { workerId: VITALII, workDate: "2026-08-30", workObjectId: OBJ_01, hours: 6 },
    ]);
    expect(totals).toHaveLength(2);
    expect(totals.find((t) => t.workDate === "2026-08-30")?.hours).toBe(6);
  });
});

describe("the manager's month, with both margins", () => {
  const rows = [
    ...split,
    { workerId: VITALII, workDate: "2026-08-30", workObjectId: OBJ_01, hours: 7.5 },
    { workerId: "worker-petras", workDate: "2026-08-29", workObjectId: OBJ_05, hours: 8 },
  ];

  it("splits a worker's hours across object columns and totals the row", () => {
    const grid = monthlyGrid(rows, [OBJ_01, OBJ_05, OBJ_12]);
    const vitalii = grid.rows.find((r) => r.workerId === VITALII)!;
    expect(vitalii.byObject[OBJ_01]).toBe(15.5);
    expect(vitalii.byObject[OBJ_05]).toBe(2);
    expect(vitalii.total).toBe(17.5);
  });

  it("an object nobody worked keeps its column — an empty column is information", () => {
    const grid = monthlyGrid(rows, [OBJ_01, OBJ_05, OBJ_12]);
    expect(grid.objectIds).toContain(OBJ_12);
    // Absent rather than a zero: nobody claimed zero hours, they claimed none.
    expect(grid.rows[0].byObject[OBJ_12]).toBeUndefined();
    expect(grid.objectTotals[OBJ_12]).toBeUndefined();
  });

  it("totals by object and a grand total", () => {
    const grid = monthlyGrid(rows, [OBJ_01, OBJ_05, OBJ_12]);
    expect(grid.objectTotals[OBJ_01]).toBe(15.5);
    expect(grid.objectTotals[OBJ_05]).toBe(10);
    expect(grid.grandTotal).toBe(25.5);
  });

  it("hours on an object outside the requested columns are still counted", () => {
    // Dropping them would under-report a real worker's real total — the worst
    // possible failure for a document somebody is paid from.
    const grid = monthlyGrid(rows, [OBJ_01]);
    expect(grid.objectIds).toContain(OBJ_05);
    expect(grid.grandTotal).toBe(25.5);
  });

  it("row totals reconcile with the grand total", () => {
    const grid = monthlyGrid(rows, [OBJ_01, OBJ_05, OBJ_12]);
    expect(sumHours(grid.rows.map((r) => r.total))).toBe(grid.grandTotal);
    expect(sumHours(Object.values(grid.objectTotals))).toBe(grid.grandTotal);
  });
});

describe("hours a person actually types", () => {
  it("accepts whole and quarter hours", () => {
    expect(parseHours("8")).toEqual({ ok: true, hours: 8 });
    expect(parseHours("7.5")).toEqual({ ok: true, hours: 7.5 });
    expect(parseHours("0.25")).toEqual({ ok: true, hours: 0.25 });
  });

  it("accepts a comma decimal — a Lithuanian phone keypad produces 7,5", () => {
    // Rejecting this as "not a number" would be a defect wearing validation's
    // clothes, on the pilot's own keyboard.
    expect(parseHours("7,5")).toEqual({ ok: true, hours: 7.5 });
  });

  it("refuses nonsense, and says which kind", () => {
    expect(parseHours("")).toEqual({ ok: false, problem: "not-a-number" });
    expect(parseHours("abc")).toEqual({ ok: false, problem: "not-a-number" });
    expect(parseHours("-3")).toEqual({ ok: false, problem: "not-a-number" });
    expect(parseHours("0")).toEqual({ ok: false, problem: "too-small" });
    expect(parseHours("25")).toEqual({ ok: false, problem: "too-large" });
    expect(parseHours("7.35")).toEqual({ ok: false, problem: "not-a-quarter" });
  });

  it("a full day is allowed, one minute more is not", () => {
    expect(parseHours(String(ALLOCATION_HOURS_MAX)).ok).toBe(true);
    expect(parseHours("24.25").ok).toBe(false);
  });

  it("sums a month without float drift", () => {
    // 0.1 + 0.2 arithmetic must never reach a payroll document.
    expect(sumHours(Array.from({ length: 30 }, () => 7.25))).toBe(217.5);
    expect(sumHours([0.1, 0.2])).toBe(0.3);
  });
});

describe("dates", () => {
  it("accepts a real calendar day", () => {
    expect(isValidWorkDate("2026-08-29")).toBe(true);
    expect(isValidWorkDate("2024-02-29")).toBe(true); // leap year
  });

  it("refuses a shape that is not a day", () => {
    expect(isValidWorkDate("2026-02-31")).toBe(false);
    expect(isValidWorkDate("2026-13-01")).toBe(false);
    expect(isValidWorkDate("29-08-2026")).toBe(false);
    expect(isValidWorkDate("")).toBe(false);
  });
});

describe("convenience must not silently duplicate", () => {
  const existing = [
    {
      workerId: VITALII,
      workDate: "2026-08-29",
      workObjectId: OBJ_01,
      hours: 8,
      createdAt: "2026-08-29T09:00:00.000Z",
    },
  ];

  it("flags an identical entry made seconds later", () => {
    expect(
      looksLikeAccidentalDuplicate(
        { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_01, hours: 8 },
        existing,
        "2026-08-29T09:00:30.000Z",
      ),
    ).toBe(true);
  });

  it("does NOT flag the same shape entered much later — a real second shift", () => {
    // The afternoon shift is a fact, not a mistake. This is why the function
    // reports a suspicion instead of blocking the write.
    expect(
      looksLikeAccidentalDuplicate(
        { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_01, hours: 8 },
        existing,
        "2026-08-29T15:00:00.000Z",
      ),
    ).toBe(false);
  });

  it("does not flag a different object, worker, or amount", () => {
    const at = "2026-08-29T09:00:30.000Z";
    const base = { workerId: VITALII, workDate: "2026-08-29", workObjectId: OBJ_01, hours: 8 };
    expect(looksLikeAccidentalDuplicate({ ...base, workObjectId: OBJ_05 }, existing, at)).toBe(false);
    expect(looksLikeAccidentalDuplicate({ ...base, workerId: "other" }, existing, at)).toBe(false);
    expect(looksLikeAccidentalDuplicate({ ...base, hours: 4 }, existing, at)).toBe(false);
  });
});

describe("object colour is UX only, and always resolves", () => {
  it("uses the configured tint when valid", () => {
    expect(objectTint(OBJ_01, "#2F6B3F")).toBe("#2F6B3F");
  });

  it("falls back deterministically when unset or malformed", () => {
    // Same object, same tint, every render — otherwise the grid shimmers.
    expect(objectTint(OBJ_01, null)).toBe(objectTint(OBJ_01, null));
    expect(objectTint(OBJ_01, "red")).toBe(objectTint(OBJ_01, undefined));
    expect(objectTint(OBJ_01, null)).toMatch(/^#[0-9A-F]{6}$/i);
  });

  it("gives different objects different fallbacks", () => {
    const tints = new Set([OBJ_01, OBJ_05, OBJ_12].map((id) => objectTint(id, null)));
    expect(tints.size).toBeGreaterThan(1);
  });
});

describe("degradation is honest", () => {
  it("recognises an unapplied migration rather than rendering an empty grid", () => {
    // "Nobody worked" and "the table does not exist" must never look alike.
    expect(isAllocationMigrationMissingCode("42P01")).toBe(true);
    expect(isAllocationMigrationMissingCode("PGRST205")).toBe(true);
    expect(isAllocationMigrationMissingCode("42501")).toBe(false);
    expect(isAllocationMigrationMissingCode(undefined)).toBe(false);
  });

  it("knows its own statuses", () => {
    expect(isValidAllocationStatus("recorded")).toBe(true);
    expect(isValidAllocationStatus("approved")).toBe(true);
    expect(isValidAllocationStatus("deleted")).toBe(false);
  });
});
