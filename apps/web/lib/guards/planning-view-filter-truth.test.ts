import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildAgenda,
  buildMonthGrid,
  planningMeta,
  projectAbsenceItem,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Guard for W12 — filter-independent truth inside the CALENDAR VIEW BUILDERS.
 *
 * THE DEFECT. W12 slice 3 fixed the row badges: the page stopped deriving
 * conflicts from the filtered list and derived them from the full model. Its
 * guard then certified the fix by reading the page source —
 *
 *   expect(page).toContain("detectConflicts(result.items)")
 *   expect(page.match(/detectConflicts\(/g)).toHaveLength(1)   // "one engine"
 *
 * — and both assertions passed while the defect was still live in three of the
 * five views. `buildMonthGrid` and `buildAgenda` call `detectConflicts`
 * THEMSELVES, on whatever list they are handed, and the page handed them
 * `visibleItems`. The literal string never appears twice in the page, so a
 * source-text guard could not see it. There were three conflict derivations at
 * runtime, two of them from the filtered list.
 *
 * What a person actually saw with `?source=booking&view=month`, holding an
 * accepted booking that overlaps their own approved leave:
 *
 *   - the month cell rendered a BLUE count badge (no conflict) while the day
 *     view rendered the same booking with a RED conflict badge — one page,
 *     two contradictory answers about the same record;
 *   - every past day of that booking was marked UNFILLED (warning border, dot,
 *     and an "unfilled" note for a screen reader) because the journal rows that
 *     prove the days WERE filled had been removed from the builder's input.
 *
 * The second one is worse than a missing flag: it is the product asserting a
 * false claim about the person's own work. "You never recorded this day" is not
 * a display preference, and a source filter must not be able to produce it.
 *
 * THE RULE (unchanged from slice 3, now applied to the view builders):
 * a filter decides what is SHOWN — COUNT is a render question and still
 * follows the filter. Whether a day carries a conflict, whether it holds a
 * journal entry, and whether it is missing one are questions about what is
 * TRUE, and they are answered from the full model.
 */

const APP = resolve(__dirname, "..", "..");

const TODAY = "2026-08-10";

function item(over: Partial<PlanningItem> & Pick<PlanningItem, "id">): PlanningItem {
  return {
    sourceType: "booking",
    sourceId: over.id.split(":")[1] ?? over.id,
    label: null,
    detail: null,
    startDate: null,
    endDate: null,
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...planningMeta(),
    ...over,
  };
}

/** An accepted incoming booking — a real personal commitment. */
const booking = (over: Partial<PlanningItem> = {}): PlanningItem =>
  item({
    id: "booking:b1",
    startDate: "2026-08-12",
    endDate: "2026-08-14",
    ...over,
  });

/** The caller's own approved leave across the same days. */
const leave = (): PlanningItem =>
  projectAbsenceItem({
    id: "a1",
    startDate: "2026-08-13",
    endDate: "2026-08-15",
    status: "approved",
  })!;

/** A journal entry recorded on a past worked day. */
const journal = (day: string): PlanningItem =>
  item({
    id: `journal:j-${day}`,
    sourceType: "journal",
    startDate: day,
    status: "recorded",
    statusKey: "planning.journalStatus.recorded",
    href: `/dashboard/journal?editing=j-${day}`,
    roleContext: "mine",
  });

/** What the page does to build the render list. */
const filtered = (
  all: readonly PlanningItem[],
  source: PlanningItem["sourceType"],
): readonly PlanningItem[] => all.filter((i) => i.sourceType === source);

describe("W12 — the month grid's conflict mark survives a source filter", () => {
  it("keeps the conflict on the day when the filter hides the partner", () => {
    const all = [booking(), leave()];
    const visible = filtered(all, "booking");

    // Regression witness: the builder fed ONLY the filtered list cannot see the
    // absence, so its internal detectConflicts call finds nothing.
    const blind = buildMonthGrid("2026-08-01", visible, TODAY);
    const blindCell = blind.weeks.flat().find((c) => c.day === "2026-08-13")!;
    expect(blindCell.count).toBe(1);
    expect(blindCell.hasConflict).toBe(false);

    // Fixed: truth comes from the full model, the count still follows the filter.
    const grid = buildMonthGrid("2026-08-01", visible, TODAY, all);
    const cell = grid.weeks.flat().find((c) => c.day === "2026-08-13")!;
    expect(cell.count).toBe(1);
    expect(cell.hasConflict).toBe(true);
  });

  /**
   * The badge colours the count of RENDERED items, exactly like the row badge:
   * it is red when a row the person can see is in conflict. So a day holding
   * ONLY the hidden partner (08-15 here, the tail of the leave) renders no
   * badge at all — there is nothing on it to mark. The invariant is therefore
   * agreement on every day the filtered grid actually renders, which is the
   * property that broke: those days lost their mark entirely.
   */
  it("agrees with the unfiltered grid on every day it renders", () => {
    const all = [booking(), leave()];
    const unfiltered = buildMonthGrid("2026-08-01", all, TODAY);
    const withFilter = buildMonthGrid(
      "2026-08-01",
      filtered(all, "booking"),
      TODAY,
      all,
    );
    const byDay = new Map(unfiltered.weeks.flat().map((c) => [c.day, c]));
    const rendered = withFilter.weeks.flat().filter((c) => c.count > 0);
    expect(rendered.map((c) => c.day)).toEqual([
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
    ]);
    for (const cell of rendered) {
      expect(cell.hasConflict, cell.day).toBe(byDay.get(cell.day)!.hasConflict);
      expect(cell.hasConflict, cell.day).toBe(true);
    }
    // …and the day that holds only the hidden partner renders nothing to mark.
    expect(byDay.get("2026-08-15")!.hasConflict).toBe(true);
    expect(
      withFilter.weeks.flat().find((c) => c.day === "2026-08-15")!.count,
    ).toBe(0);
  });
});

describe("W12 — a filter cannot make a filled day look unfilled", () => {
  const worked = "2026-08-05"; // past, inside the anchored month

  it("does not claim a day is unfilled when a hidden journal entry filled it", () => {
    const all = [
      booking({ startDate: worked, endDate: worked }),
      journal(worked),
    ];
    const visible = filtered(all, "booking");

    // Regression witness: without the journal rows the builder concludes the
    // day was never recorded — a false statement about the person's own work.
    const blind = buildMonthGrid("2026-08-01", visible, TODAY);
    const blindCell = blind.weeks.flat().find((c) => c.day === worked)!;
    expect(blindCell.hasJournal).toBe(false);
    expect(blindCell.isUnfilled).toBe(true);

    // Fixed: the day is known to be filled whatever the filter renders.
    const grid = buildMonthGrid("2026-08-01", visible, TODAY, all);
    const cell = grid.weeks.flat().find((c) => c.day === worked)!;
    expect(cell.hasJournal).toBe(true);
    expect(cell.isUnfilled).toBe(false);
  });

  it("still reports a genuinely unfilled day (the mark is not just disabled)", () => {
    const all = [booking({ startDate: worked, endDate: worked })];
    const grid = buildMonthGrid("2026-08-01", filtered(all, "booking"), TODAY, all);
    const cell = grid.weeks.flat().find((c) => c.day === worked)!;
    expect(cell.hasJournal).toBe(false);
    expect(cell.isUnfilled).toBe(true);
  });

  it("answers 'which days did I miss' while filtered to the journal", () => {
    const all = [booking({ startDate: worked, endDate: worked })];
    // Filtering to journal removes the commitment that PROVES the day was a
    // working day, so the question silently stopped being answerable at all.
    const blind = buildMonthGrid("2026-08-01", filtered(all, "journal"), TODAY);
    expect(blind.weeks.flat().some((c) => c.isUnfilled)).toBe(false);

    const grid = buildMonthGrid("2026-08-01", filtered(all, "journal"), TODAY, all);
    expect(grid.weeks.flat().find((c) => c.day === worked)!.isUnfilled).toBe(true);
  });

  it("never marks today or a future day unfilled", () => {
    const all = [
      booking({ startDate: TODAY, endDate: "2026-08-20" }),
      journal("2026-08-01"),
    ];
    const grid = buildMonthGrid("2026-08-01", filtered(all, "booking"), TODAY, all);
    for (const cell of grid.weeks.flat()) {
      if (cell.day >= TODAY) expect(cell.isUnfilled).toBe(false);
    }
  });
});

describe("W12 — the agenda week strip carries the same truth", () => {
  const reference = new Date(`${TODAY}T00:00:00Z`);

  it("keeps the conflict mark when the filter hides the partner", () => {
    const all = [booking(), leave()];
    const visible = filtered(all, "booking");

    const blind = buildAgenda(visible, reference);
    expect(blind.weekStrip.find((d) => d.day === "2026-08-13")!.hasConflict).toBe(
      false,
    );

    const agenda = buildAgenda(visible, reference, undefined, all);
    const cell = agenda.weekStrip.find((d) => d.day === "2026-08-13")!;
    expect(cell.count).toBe(1); // render still filtered
    expect(cell.hasConflict).toBe(true); // truth is not
  });

  it("keeps the journal mark when the filter hides the entry", () => {
    const all = [booking({ startDate: TODAY, endDate: TODAY }), journal(TODAY)];
    const visible = filtered(all, "booking");

    expect(buildAgenda(visible, reference).weekStrip[0].hasJournal).toBe(false);

    const strip = buildAgenda(visible, reference, undefined, all).weekStrip[0];
    expect(strip.hasJournal).toBe(true);
    expect(strip.count).toBe(1);
  });

  it("reports the same conflicts as the unfiltered agenda", () => {
    const all = [booking(), leave()];
    const unfiltered = buildAgenda(all, reference);
    const withFilter = buildAgenda(filtered(all, "booking"), reference, undefined, all);
    expect(withFilter.conflicts).toEqual(unfiltered.conflicts);
  });
});

describe("W12 — defaults keep every unfiltered caller unchanged", () => {
  it("omitting the truth list behaves exactly as before", () => {
    const all = [booking(), leave(), journal("2026-08-05")];
    expect(buildMonthGrid("2026-08-01", all, TODAY)).toEqual(
      buildMonthGrid("2026-08-01", all, TODAY, all),
    );
    const reference = new Date(`${TODAY}T00:00:00Z`);
    expect(buildAgenda(all, reference)).toEqual(
      buildAgenda(all, reference, undefined, all),
    );
  });
});

describe("W12 — the page hands the view builders the full model", () => {
  const page = readFileSync(
    resolve(APP, "app", "[locale]", "dashboard", "planning", "page.tsx"),
    "utf8",
  );

  it("passes result.items as the truth list to both deriving builders", () => {
    expect(page).toMatch(/buildAgenda\(\s*visibleItems[\s\S]{0,80}result\.items/);
    expect(page).toMatch(/buildMonthGrid\(\s*anchor,\s*visibleItems[\s\S]{0,60}result\.items/);
  });

  it("still renders the FILTERED list in every view", () => {
    // The builders receive visibleItems FIRST — the render list is unchanged.
    for (const call of ["buildAgenda(", "buildMonthGrid(", "buildWeekView(", "buildYearOverview("]) {
      const at = page.indexOf(call);
      expect(at, `${call} missing from the page`).toBeGreaterThan(-1);
      expect(page.slice(at, at + 140)).toContain("visibleItems");
    }
    expect(page).toContain("itemsForDay(visibleItems, anchor)");
  });
});
