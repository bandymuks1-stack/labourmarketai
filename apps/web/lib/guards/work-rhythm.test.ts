import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { PlanningItem } from "@/lib/planning/planning-model";
import {
  buildWorkRhythm,
  compactHours,
  durationDayUnits,
  durationMinutes,
} from "@/lib/planning/work-rhythm";

/**
 * THE WORK RHYTHM (premium calendar, owner command 2026-09-29).
 *
 * Pins the recovered floor: the calendar shows the HOURS a person recorded on
 * each day (the journal grid the owner remembers, #1727/#1729) and paints
 * confirmation only when someone OTHER than the worker approved — never from
 * a guess, never from a clock time the journal does not hold.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

function item(p: Partial<PlanningItem> & Pick<PlanningItem, "id" | "sourceType">): PlanningItem {
  return {
    sourceId: p.id,
    label: null,
    detail: null,
    startDate: "2026-09-28",
    endDate: null,
    status: "recorded",
    statusKey: "x",
    href: "/dashboard/journal",
    roleContext: "mine",
    startTime: null,
    duration: null,
    workspace: null,
    project: null,
    place: null,
    counterpart: null,
    organization: null,
    ...p,
  };
}

describe("durations are parsed back, never invented", () => {
  it("hours and minutes become minutes; days never become hours", () => {
    expect(durationMinutes("8|hours")).toBe(480);
    expect(durationMinutes("7.5|hours")).toBe(450);
    expect(durationMinutes("45|minutes")).toBe(45);
    expect(durationMinutes("2|days")).toBeNull();
    expect(durationDayUnits("2|days")).toBe(2);
    expect(durationMinutes("12|square_meters")).toBeNull();
    expect(durationMinutes(null)).toBeNull();
    expect(durationMinutes("garbage")).toBeNull();
  });

  it("a date cell never rounds a few minutes up to a figure the journal does not hold", () => {
    expect(compactHours(2, "en")).toBe("<0.1");
    expect(compactHours(480, "en")).toBe("8");
    expect(compactHours(450, "en")).toBe("7.5");
  });
});

describe("buildWorkRhythm", () => {
  const days = [
    {
      day: "2026-09-28",
      items: [
        item({ id: "journal:a", sourceType: "journal", duration: "5|hours", organization: "Alfa", place: "Stockholm" }),
        item({ id: "journal:b", sourceType: "journal", duration: "3|hours" }),
        item({ id: "booking:x", sourceType: "booking", startDate: "2026-09-27", endDate: "2026-10-02" }),
      ],
    },
    { day: "2026-09-29", items: [item({ id: "journal:c", sourceType: "journal", duration: "1|days" })] },
    { day: "2026-09-30", items: [] },
  ];

  it("sums a day's recorded minutes and keeps plans as bands, not work", () => {
    const r = buildWorkRhythm({ days, todayIso: "2026-09-29", confirmedIds: new Set(), conflictIds: new Set() });
    expect(r.days[0].recordedMinutes).toBe(480);
    expect(r.days[0].blocks).toHaveLength(2);
    expect(r.days[0].plans.map((p) => p.id)).toEqual(["booking:x"]);
    expect(r.days[0].blocks[0]).toMatchObject({ organization: "Alfa", place: "Stockholm", minutes: 300 });
    // A day-unit entry is work, but it is not hours.
    expect(r.days[1].recordedMinutes).toBe(0);
    expect(r.days[1].blocks[0].dayUnits).toBe(1);
    expect(r.recordedMinutes).toBe(480);
    expect(r.recordedDays).toBe(2);
    expect(r.maxDayMinutes).toBe(480);
    expect(r.days[1].isToday).toBe(true);
    expect(r.days[2].isFuture).toBe(true);
  });

  it("confirmation is only what the confirmed set says — partial, all, or none", () => {
    const partial = buildWorkRhythm({ days, todayIso: "2026-09-29", confirmedIds: new Set(["journal:a"]), conflictIds: new Set() });
    expect(partial.days[0].confirmation).toBe("partial");
    expect(partial.days[0].blocks[0].confirmed).toBe(true);
    expect(partial.days[0].blocks[1].confirmed).toBe(false);
    expect(partial.confirmedBlocks).toBe(1);
    const all = buildWorkRhythm({ days, todayIso: "2026-09-29", confirmedIds: new Set(["journal:a", "journal:b"]), conflictIds: new Set() });
    expect(all.days[0].confirmation).toBe("all");
    expect(all.days[2].confirmation).toBe("none");
  });

  it("an unreadable review layer is UNKNOWN, never 'not confirmed' (SEP-7)", () => {
    const r = buildWorkRhythm({ days, todayIso: "2026-09-29", confirmedIds: null, conflictIds: new Set() });
    expect(r.days[0].confirmation).toBe("unknown");
    expect(r.days[0].blocks.every((b) => b.confirmed === null)).toBe(true);
  });

  it("a conflict on a plan band marks the day", () => {
    const r = buildWorkRhythm({ days, todayIso: "2026-09-29", confirmedIds: new Set(), conflictIds: new Set(["booking:x"]) });
    expect(r.days[0].hasConflict).toBe(true);
    expect(r.days[0].plans[0].conflict).toBe(true);
  });
});

describe("the calendar wiring keeps the floor", () => {
  const MODEL = read("lib/planning/work-rhythm.ts");
  const PAGE = read("app/[locale]/dashboard/planning/page.tsx");
  const WEEK = read("components/app/planning/work-week.tsx");
  const COMPOSE = read("lib/planning/planning.ts");

  it("the model reads nothing", () => {
    expect(MODEL).not.toMatch(/createClient|supabase|fetch\(|\.from\(/);
  });

  it("the month cell carries the hours on the date and a confirmation mark", () => {
    expect(PAGE).toContain("planning-month-hours-");
    expect(PAGE).toContain("planning-month-confirmed-");
    expect(PAGE).toMatch(/itemsForDay\(result\.items, c\.day\)/);
  });

  it("the week is the rhythm view, and a day links both to its calendar day and to the journal", () => {
    expect(PAGE).toMatch(/<WorkWeek/);
    expect(WEEK).toContain("/dashboard/journal?date=");
    expect(WEEK).toContain("planning-week-open-day-");
    // A block links its real source, never a planning-local page.
    expect(WEEK).toMatch(/href=\{b\.href as "\/dashboard"\}/);
    // A block is never positioned on a clock the journal does not hold.
    expect(WEEK).not.toMatch(/b\.startTime|block\.startTime/);
  });

  it("confirmation is classified by WHO decided — a self-approval is not someone else's", () => {
    expect(COMPOSE).toMatch(/confirmer_id/);
    expect(COMPOSE).toMatch(/deriveIndependentReviewResult\(rows, userId\)/);
  });
});
