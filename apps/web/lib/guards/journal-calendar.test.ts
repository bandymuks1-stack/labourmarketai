import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  addDays,
  buildJournalCalendar,
  isIsoDay,
  resolveAnchor,
  resolveScale,
  shiftMonth,
  startOfMonth,
  startOfWeek,
  WEEKDAY_ANCHOR_ISO,
} from "@/lib/journal/journal-calendar";

/**
 * THE WORK JOURNAL CALENDAR (owner direction 2026-09-13).
 *
 * The journal's records must be navigable on a real calendar — month or
 * week, tap a day, see that day's records and that day's actions — instead
 * of an endless list of date headings. This guard pins the two things that
 * make such a calendar trustworthy rather than decorative:
 *
 *   1. the arithmetic is UTC and Monday-first, so a cell means the same day
 *      on the server and in the browser (the journal's labels are UTC-only);
 *   2. the grid reports the SAME figures it was given — it reads nothing,
 *      invents nothing, and its in-scope totals are the sum of the days the
 *      journal already derived through the canonical work-time rule.
 */

describe("journal calendar — day arithmetic is UTC and Monday-first", () => {
  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("startOfWeek returns the Monday, including for a Sunday", () => {
    // 2026-09-13 is a Sunday: Monday-first means it belongs to the 7th.
    expect(startOfWeek("2026-09-13")).toBe("2026-09-07");
    expect(startOfWeek("2026-09-07")).toBe("2026-09-07");
    expect(startOfWeek("2026-09-14")).toBe("2026-09-14");
  });

  it("startOfMonth and shiftMonth stay on real days", () => {
    expect(startOfMonth("2026-09-13")).toBe("2026-09-01");
    expect(shiftMonth("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftMonth("2026-01-15", -1)).toBe("2025-12-01");
  });

  it("isIsoDay rejects impossible and malformed days", () => {
    expect(isIsoDay("2026-02-30")).toBe(false);
    expect(isIsoDay("2026-9-1")).toBe(false);
    expect(isIsoDay("yesterday")).toBe(false);
    expect(isIsoDay("2026-02-28")).toBe(true);
  });

  it("the weekday header anchor week really starts on a Monday", () => {
    expect(WEEKDAY_ANCHOR_ISO).toHaveLength(7);
    expect(new Date(`${WEEKDAY_ANCHOR_ISO[0]}T00:00:00Z`).getUTCDay()).toBe(1);
  });
});

describe("journal calendar — the grid reports what it was given", () => {
  const days = [
    { iso: "2026-09-01", entryCount: 2, totalMinutes: 300 },
    { iso: "2026-09-13", entryCount: 1, totalMinutes: 120 },
    // A day OUTSIDE September — it must not leak into September's totals.
    { iso: "2026-08-31", entryCount: 5, totalMinutes: 999 },
  ];

  const grid = buildJournalCalendar({
    scale: "month",
    anchor: "2026-09-13",
    today: "2026-09-13",
    selected: "2026-09-13",
    days,
  });

  it("spans the whole month in whole Monday-first weeks", () => {
    expect(grid.rangeStart).toBe("2026-09-01");
    expect(grid.rangeEnd).toBe("2026-09-30");
    for (const week of grid.weeks) expect(week).toHaveLength(7);
    expect(grid.weeks[0][0].iso).toBe(startOfWeek("2026-09-01"));
  });

  it("marks today, the selection, the future and out-of-month borrow days", () => {
    const cells = grid.weeks.flat();
    const today = cells.find((c) => c.iso === "2026-09-13");
    expect(today?.isToday).toBe(true);
    expect(today?.isSelected).toBe(true);
    expect(today?.isFuture).toBe(false);
    expect(cells.find((c) => c.iso === "2026-09-14")?.isFuture).toBe(true);
    expect(cells.find((c) => c.iso === "2026-08-31")?.inScope).toBe(false);
  });

  it("carries each day's own count and minutes, unchanged", () => {
    const cells = grid.weeks.flat();
    expect(cells.find((c) => c.iso === "2026-09-01")?.entryCount).toBe(2);
    expect(cells.find((c) => c.iso === "2026-09-01")?.totalMinutes).toBe(300);
    expect(cells.find((c) => c.iso === "2026-09-13")?.totalMinutes).toBe(120);
  });

  it("totals only the days IN SCOPE — a borrowed neighbour day never counts", () => {
    expect(grid.recordedDays).toBe(2);
    expect(grid.recordedEntries).toBe(3);
    expect(grid.recordedMinutes).toBe(420);
  });

  it("a day with no records is a real zero, never an invented figure", () => {
    const empty = grid.weeks.flat().find((c) => c.iso === "2026-09-02");
    expect(empty?.entryCount).toBe(0);
    expect(empty?.totalMinutes).toBe(0);
  });

  it("prev/next anchors are plain days, not deltas", () => {
    expect(grid.prevAnchor).toBe("2026-08-01");
    expect(grid.nextAnchor).toBe("2026-10-01");
  });
});

describe("journal calendar — the week scale", () => {
  const grid = buildJournalCalendar({
    scale: "week",
    anchor: "2026-09-13",
    today: "2026-09-13",
    selected: null,
    days: [{ iso: "2026-09-11", entryCount: 1, totalMinutes: 60 }],
  });

  it("is exactly one Monday-first week", () => {
    expect(grid.weeks).toHaveLength(1);
    expect(grid.rangeStart).toBe("2026-09-07");
    expect(grid.rangeEnd).toBe("2026-09-13");
    expect(grid.prevAnchor).toBe("2026-08-31");
    expect(grid.nextAnchor).toBe("2026-09-14");
  });

  it("totals the week it shows", () => {
    expect(grid.recordedDays).toBe(1);
    expect(grid.recordedMinutes).toBe(60);
  });
});

describe("journal calendar — the anchor a grid opens on", () => {
  it("an explicit request wins, then the selected day, then today", () => {
    expect(
      resolveAnchor({ requested: "2026-05-20", selected: "2026-09-13", today: "2026-09-13", scale: "month" }),
    ).toBe("2026-05-01");
    expect(
      resolveAnchor({ requested: undefined, selected: "2026-07-04", today: "2026-09-13", scale: "month" }),
    ).toBe("2026-07-01");
    expect(
      resolveAnchor({ requested: "nonsense", selected: null, today: "2026-09-13", scale: "week" }),
    ).toBe("2026-09-07");
  });

  it("only `week` asks for the week scale", () => {
    expect(resolveScale("week")).toBe("week");
    expect(resolveScale("month")).toBe("month");
    expect(resolveScale(undefined)).toBe("month");
    expect(resolveScale("quarter")).toBe("month");
  });
});

describe("journal calendar — it is the journal's day navigator, not a second store", () => {
  const APP = process.cwd();
  const model = readFileSync(join(APP, "lib/journal/journal-calendar.ts"), "utf-8");

  it("reads nothing: no client, no fetch, no table", () => {
    expect(model).not.toMatch(/createClient|supabase|fetch\(|from\(["']/);
  });

  it("the page feeds it the days it already derived, and keeps quick record", () => {
    const page = readFileSync(join(APP, "app/[locale]/dashboard/journal/page.tsx"), "utf-8");
    expect(page).toMatch(/JournalCalendar/);
    expect(page).toMatch(/JournalQuickRecord/);
    // the calendar's days come from entryDayGroups — the page's own grouping
    expect(page).toMatch(/entryDayGroups\.map\(\(g\) => \(\{/);
  });
});
