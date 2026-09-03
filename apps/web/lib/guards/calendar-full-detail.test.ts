import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PLANNING_SOURCE_TYPES,
  PLANNING_VIEWS,
  clockTime,
  daySpanDays,
  itemsForDay,
  planningMeta,
  projectFinanceItem,
  visibleRange,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * §7 CALENDAR — the owner visual-acceptance contract.
 *
 *   §7.1 every projection states time, duration, workspace, project, place,
 *        status, conflict, type, source, related person and organization —
 *        each one ONLY when the source row really carries it;
 *   §7.2 every agreed source is composed (bookings, projects, tasks,
 *        journal, finance, invitations, absences, stages);
 *   §7.3 ONE ACTIVE ENTRY per correction chain in day/week/month/year — an
 *        edited journal entry may never appear twice.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP, rel), "utf-8");

const PAGE = read("app/[locale]/dashboard/planning/page.tsx");
const COMPOSE = read("lib/planning/planning.ts");

function item(over: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "journal:j1",
    sourceType: "journal",
    sourceId: "j1",
    label: "Klojau plyteles",
    detail: null,
    startDate: "2026-07-29",
    endDate: null,
    status: "recorded",
    statusKey: "planning.journalStatus.recorded",
    href: "/dashboard/journal",
    roleContext: "mine",
    ...planningMeta(),
    ...over,
  };
}

describe("§7.1 the full agreed field set exists in the model and renders", () => {
  it("PlanningItem carries every agreed field, defaulting to honest null", () => {
    const meta = planningMeta();
    for (const key of [
      "startTime",
      "duration",
      "workspace",
      "project",
      "place",
      "counterpart",
      "organization",
    ] as const) {
      expect(meta[key], key).toBeNull();
    }
  });

  it("planningMeta keeps only real values — blank strings never become data", () => {
    const meta = planningMeta({ place: "   ", workspace: "Statybos UAB" });
    expect(meta.place).toBeNull();
    expect(meta.workspace).toBe("Statybos UAB");
  });

  it("the calendar renders time, duration and the work-context row", () => {
    expect(PAGE).toMatch(/planning-time-\$\{item\.id\}/);
    expect(PAGE).toMatch(/planning-duration-\$\{item\.id\}/);
    expect(PAGE).toMatch(/planning-context-\$\{item\.id\}/);
    for (const key of [
      "meta.workspace",
      "meta.project",
      "meta.place",
      "meta.organization",
      "meta.counterpart",
    ]) {
      expect(PAGE, key).toContain(key);
    }
    // Type + source + status + conflict were already on the row and stay.
    expect(PAGE).toMatch(/source\.\$\{item\.sourceType\}/);
    expect(PAGE).toMatch(/tAll\(item\.statusKey\)/);
    expect(PAGE).toMatch(/planning-conflict-\$\{item\.id\}/);
  });

  it("the context row renders NOTHING when the source carries no context", () => {
    // The guard is structural: the row is gated on `.some(Boolean)`, so a
    // bare source can never paint a line of empty labels.
    expect(PAGE).toMatch(/\]\.some\(\s*Boolean,?\s*\)\s*\?/);
  });

  it("a clock time is only claimed when the timestamp really has one", () => {
    expect(clockTime("2026-07-29T08:30:00Z")).toBe("08:30");
    // Midnight-exact = a date-only value; claiming "00:00" would invent an
    // appointment that does not exist.
    expect(clockTime("2026-07-29T00:00:00Z")).toBeNull();
    expect(clockTime(null)).toBeNull();
    expect(clockTime("not-a-date")).toBeNull();
  });

  it("a duration is only claimed for a real multi-day band", () => {
    expect(daySpanDays("2026-07-29", "2026-07-31")).toBe("3"); // inclusive
    expect(daySpanDays("2026-07-29", "2026-07-29")).toBeNull();
    expect(daySpanDays("2026-07-29", null)).toBeNull();
  });

  it("finance stays operational-only — no place, org or person", () => {
    const fin = projectFinanceItem(
      { id: "f1", title: "Sąskaita", status: "unpaid", dueDate: "2026-08-01", paidAt: null },
      "2026-07-29",
    )!;
    expect(fin.place).toBeNull();
    expect(fin.organization).toBeNull();
    expect(fin.counterpart).toBeNull();
  });
});

describe("§7.2 every agreed source is really composed", () => {
  it("the source catalogue is the agreed eight + the plan primitive (Train F1)", () => {
    // FINAL COMPLETION Train F1 (2026-09-02): `plan` = work_plan_entries, the
    // organization's own PLAN object (who works where, when). A real table
    // with RLS and RPC writes, projected like every other source — not a
    // simulation, not a calendar copy.
    expect([...PLANNING_SOURCE_TYPES].sort()).toEqual(
      [
        "absence",
        "booking",
        "finance",
        "invitation",
        "journal",
        "plan",
        "project",
        "stage",
        "task",
      ].sort(),
    );
  });

  it("the composition really reads each one", () => {
    for (const marker of [
      "listMyBookings",
      "listMyTasks",
      "listMyFinanceRecords",
      "getMyAbsences",
      "projectStageItem",
      "listMySentInvitations",
      "listInvitationsForMe",
      "journal_entries",
      "projects",
    ]) {
      expect(COMPOSE, marker).toContain(marker);
    }
  });

  it("the journal row states its REAL hours, site and workspace", () => {
    // The follow-up reads are chained over the same entry ids (§7.1) —
    // metrics carry the hours + site, engagement_contexts the workspace.
    expect(COMPOSE).toContain("journal_entry_metrics");
    expect(COMPOSE).toContain("engagement_contexts");
    // THE HOURS come from the CANONICAL rule (owner ruling 2026-08-18), not
    // from this file's own reading of one metric. The old assertion pinned a
    // quantity-only read that reported "5 h" for an entry whose worker had
    // recorded 5 h + 1 h + 3 h across three activities — the calendar and the
    // timesheet disagreed by construction. Both now call the same derivation.
    expect(COMPOSE).toMatch(/deriveEntryWorkTime\(/);
    expect(COMPOSE).toMatch(/workTimeDurationLabel\(/);
    expect(COMPOSE).toMatch(/site_name/);
  });
});

describe("§7.3 no duplicates in ANY projection", () => {
  it("a corrected journal entry is replaced, never shown twice", () => {
    // The server drops any entry a LIVE correction points at, so every
    // projection (day/week/month/year, all derived from the same items)
    // sees exactly one row per chain.
    expect(COMPOSE).toMatch(/correctedIds/);
    expect(COMPOSE).toMatch(/\.filter\(\(e\) => !correctedIds\.has\(e\.id\)\)/);
  });

  it("item ids are unique per source record, so no view can double-render", () => {
    const items = [item({ id: "journal:j1" }), item({ id: "journal:j2" })];
    const day = itemsForDay(items, "2026-07-29");
    expect(day).toHaveLength(2);
    expect(new Set(day.map((i) => i.id)).size).toBe(2);
  });

  it("every view resolves a real range, so day/week/month/year all render", () => {
    for (const view of PLANNING_VIEWS) {
      const range = visibleRange(view, "2026-07-29");
      expect(range.start, view).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(range.end >= range.start, view).toBe(true);
    }
  });
});
