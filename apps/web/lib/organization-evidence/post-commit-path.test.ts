import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildJournalCalendar } from "@/lib/journal/journal-calendar";

/**
 * THE POST-COMMIT PATH of a historical import (owner completion mode
 * 2026-09-17 §10–§11), pinned where the local proof found it broken:
 *
 *   commit → the staged rows stay COMMITTED on every later preview
 *   → the roster person can be OFFERED to a worker (org side) and accepted
 *     (subject side) → the worker's canonical calendar carries the
 *     organization's ACTUAL layer beside the diary, never summed with it.
 */
const dir = path.resolve(__dirname, "../..");
const read = (p: string) => readFileSync(path.join(dir, p), "utf8").replace(/\r\n/g, "\n");

describe("a committed row is a record, never a candidate again", () => {
  it("the preview carries committed rows through untouched — no duplicate re-reading, no status rewrite", () => {
    const core = read("lib/organization-evidence/import-core.ts");
    const branch = core.slice(core.indexOf('if (s.status === "committed")'), core.indexOf("continue;", core.indexOf('if (s.status === "committed")')));
    expect(branch.length).toBeGreaterThan(200);
    expect(branch).toMatch(/committed: true/);
    expect(branch).toMatch(/ready: false/);
    expect(branch).toMatch(/duplicateState: "new"/);
    // the patch that rewrites staging comes AFTER the branch's `continue`, so a committed row is never patched
    expect(core.indexOf('if (s.status === "committed")')).toBeLessThan(core.indexOf("updates.push({"));
  });
});

describe("the organization's actual layer on the worker's own calendar", () => {
  const days = [
    { iso: "2025-11-07", entryCount: 0, totalMinutes: 0, confirmedCount: 0, reportedMinutes: 540 },
    { iso: "2025-11-10", entryCount: 1, totalMinutes: 120, confirmedCount: 0, reportedMinutes: 480 },
  ];
  const grid = buildJournalCalendar({ scale: "month", anchor: "2025-11-01", today: "2026-09-17", selected: null, days });
  const cell = (iso: string) => grid.weeks.flat().find((c) => c.iso === iso)!;

  it("a day the organization recorded and the diary does not hold is on the calendar, as reported minutes", () => {
    expect(cell("2025-11-07").reportedMinutes).toBe(540);
    expect(cell("2025-11-07").entryCount).toBe(0);
  });
  it("reported minutes sit BESIDE the diary's minutes — the journal totals never include them", () => {
    expect(cell("2025-11-10").totalMinutes).toBe(120);
    expect(cell("2025-11-10").reportedMinutes).toBe(480);
    expect(grid.recordedMinutes).toBe(120);
    expect(grid.recordedDays).toBe(1);
    expect(grid.reportedDays).toBe(2);
    expect(grid.reportedMinutes).toBe(1020);
  });
  it("the cell and the page say it in words and shape, never colour alone", () => {
    const cmp = read("components/app/journal/journal-calendar.tsx");
    expect(cmp).toMatch(/data-reported-minutes=\{cell\.reportedMinutes\}/);
    expect(cmp).toMatch(/data-testid="journal-calendar-day-reported"/);
    expect(cmp).toMatch(/t\("reported", \{ time:/);
    expect(cmp).toMatch(/periodReportedOnly/);
    const page = read("app/[locale]/dashboard/journal/page.tsx");
    expect(page).toMatch(/reportedMinutes: reportedByDay\.get\(g\.isoKey\) \?\? 0/);
    expect(page).toMatch(/r\.status === "rejected"/);
    for (const loc of ["en", "lt", "nl", "de", "ru"]) {
      const cal = JSON.parse(read(`messages/${loc}/journal.json`)).calendar as Record<string, string>;
      expect(cal.reported, loc).toMatch(/\{time\}/);
      expect(cal.periodReportedOnly, loc).toMatch(/\{days/);
    }
  });
});
