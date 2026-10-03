import { describe, expect, it } from "vitest";

import { planningMeta, type PlanningItem } from "@/lib/planning/planning-model";
import { buildRosterTimeline } from "@/lib/planning/roster-timeline-model";
import type { PlanningZoneEntry } from "@/lib/workforce/planning-zone-view";
import {
  assignLanes,
  buildCapacityBand,
  buildMyNowNext,
  buildProjectsInTime,
  epistemicForBar,
  epistemicForItem,
  isTimeLens,
  lensHref,
  nowAndNext,
  parseTimeFocus,
  projectIdOfStage,
} from "@/lib/planning/time-lens";

function item(over: Partial<PlanningItem> & { readonly id: string }): PlanningItem {
  return {
    sourceType: "booking",
    sourceId: over.id,
    label: null,
    detail: null,
    startDate: "2026-10-05",
    endDate: "2026-10-07",
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...planningMeta(),
    ...over,
  };
}

const row = (workerId: string, c: { id: string; kind?: "project" | "booking"; s: string; e: string }[]) => ({
  workerId,
  workerName: workerId,
  overlaps: 0,
  undatedProjects: [],
  commitments: c.map((x) => ({
    kind: x.kind ?? ("project" as const),
    sourceId: x.id,
    label: x.id,
    startDate: x.s,
    endDate: x.e,
    conflict: false,
  })),
});

const zoneEntry = (over: Partial<PlanningZoneEntry> & { id: string }): PlanningZoneEntry => ({
  source: "project" as PlanningZoneEntry["source"],
  title: null,
  startDate: null,
  endDate: null,
  href: null,
  requiredHeadcount: 0,
  coveredHeadcount: 0,
  userEnteredHeadcount: null,
  systemSuggestedHeadcount: null,
  confirmedHeadcount: null,
  ...over,
});

describe("epistemic state of an item", () => {
  const opts = { today: "2026-10-06", confirmedIds: new Set(["journal:c"]) };
  it("a journal entry is RECORDED, and CONFIRMED only with a confirmation fact", () => {
    expect(epistemicForItem(item({ id: "journal:a", sourceType: "journal", status: "recorded" }), opts)).toBe("recorded");
    expect(epistemicForItem(item({ id: "journal:c", sourceType: "journal", status: "recorded" }), opts)).toBe("confirmed");
  });
  it("no date is NOT PROVIDED — never today, never zero", () => {
    expect(epistemicForItem(item({ id: "t", sourceType: "task", startDate: null, endDate: null }), opts)).toBe("notProvided");
  });
  it("a binding commitment is KNOWN while in effect and PLANNED before", () => {
    expect(epistemicForItem(item({ id: "b1", startDate: "2026-10-05" }), opts)).toBe("known");
    expect(epistemicForItem(item({ id: "b2", startDate: "2026-10-09" }), opts)).toBe("planned");
  });
  it("a plan that does not bind is only PLANNED, never recorded", () => {
    expect(epistemicForItem(item({ id: "p", sourceType: "booking", status: "proposed" }), opts)).toBe("planned");
  });
  it("approved leave is CONFIRMED", () => {
    expect(epistemicForItem(item({ id: "a", sourceType: "absence", status: "approved" }), opts)).toBe("confirmed");
  });
  it("bars follow the same rule", () => {
    expect(epistemicForBar({ kind: "absence", startDate: "2026-12-01" }, "2026-10-06")).toBe("confirmed");
    expect(epistemicForBar({ kind: "project", startDate: "2026-12-01" }, "2026-10-06")).toBe("planned");
    expect(epistemicForBar({ kind: "booking", startDate: "2026-10-01" }, "2026-10-06")).toBe("known");
  });
});

describe("lanes", () => {
  it("stack overlapping bars and reuse a lane once it is free", () => {
    const { items, lanes } = assignLanes([
      { key: "a", startDate: "2026-10-05", endDate: "2026-10-09" },
      { key: "b", startDate: "2026-10-07", endDate: "2026-10-10" },
      { key: "c", startDate: "2026-10-12", endDate: "2026-10-13" },
    ]);
    expect(lanes).toBe(2);
    expect(items.find((i) => i.bar.key === "b")?.lane).toBe(1);
    expect(items.find((i) => i.bar.key === "c")?.lane).toBe(0);
  });
  it("never reports zero lanes for an empty person", () => {
    expect(assignLanes([]).lanes).toBe(1);
  });
});

describe("capacity band — no record is not free", () => {
  const timeline = buildRosterTimeline({
    rows: [row("a", [{ id: "p1", s: "2026-10-05", e: "2026-10-06" }]), row("b", [{ id: "p2", s: "2026-10-06", e: "2026-10-06" }])],
    absences: [{ workerId: "b", workerName: "b", sourceId: "x", startDate: "2026-10-06", endDate: "2026-10-06" }],
    from: "2026-10-05",
    days: 7,
    today: "2026-10-05",
  });
  it("counts committed, away and NO RECORD per day, summing to the roster", () => {
    const band = buildCapacityBand(timeline, 2);
    const d6 = band.find((d) => d.day === "2026-10-06")!;
    expect(d6.total).toBe(4);
    expect(d6.committed).toBe(2);
    expect(d6.away).toBe(1);
    expect(d6.overlapping).toBe(1);
    // a (committed), b (committed + away) => 2 people have something; 2 have nothing.
    expect(d6.noRecord).toBe(2);
    const d9 = band.find((d) => d.day === "2026-10-09")!;
    expect(d9.noRecord).toBe(4);
    expect(d9.committed).toBe(0);
  });
  it("marks weekends", () => {
    const band = buildCapacityBand(timeline);
    expect(band.filter((d) => d.weekend).map((d) => d.day)).toEqual(["2026-10-10", "2026-10-11"]);
  });
  it("finds now and next for one person", () => {
    const p = timeline.people.find((x) => x.workerId === "a")!;
    expect(nowAndNext(p.bars, "2026-10-05").now?.key).toBe("project:p1");
    expect(nowAndNext(p.bars, "2026-10-01").next?.key).toBe("project:p1");
    expect(nowAndNext(p.bars, "2026-10-20")).toEqual({ now: null, next: null });
  });
});

describe("projects in time", () => {
  const timeline = buildRosterTimeline({
    rows: [row("a", [{ id: "pr1", s: "2026-10-05", e: "2026-10-09" }]), row("b", [{ id: "pr1", s: "2026-10-07", e: "2026-10-12" }])],
    absences: [],
    from: "2026-10-05",
    days: 28,
    today: "2026-10-06",
  });
  const items: PlanningItem[] = [
    item({ id: "project:pr1", sourceType: "project", sourceId: "pr1", label: "Kitchen", startDate: "2026-10-05", endDate: "2026-10-30", status: "live", roleContext: "managed", href: "/dashboard/projects/pr1" }),
    item({ id: "stage:s1", sourceType: "stage", sourceId: "s1", label: "Demolition", project: "Kitchen", startDate: "2026-10-05", endDate: "2026-10-08", status: "done", href: "/dashboard/projects/pr1/operations" }),
    item({ id: "stage:s2", sourceType: "stage", sourceId: "s2", label: "Tiling", project: "Kitchen", startDate: "2026-10-12", endDate: "2026-10-20", status: "planned", href: "/dashboard/projects/pr1/operations" }),
  ];

  it("reads the project id out of a stage href", () => {
    expect(projectIdOfStage({ href: "/dashboard/projects/pr1/operations" })).toBe("pr1");
    expect(projectIdOfStage({ href: "/dashboard/finance" })).toBeNull();
  });

  it("joins band, stages and staffing by project id", () => {
    const m = buildProjectsInTime({ items, timeline, entries: [], today: "2026-10-06" });
    expect(m.projects).toHaveLength(1);
    const p = m.projects[0];
    expect(p.label).toBe("Kitchen");
    expect(p.stages.map((s) => s.label)).toEqual(["Demolition", "Tiling"]);
    expect(p.stages[0].state).toBe("recorded");
    expect(p.stages[1].state).toBe("planned");
    expect(p.staffed).toHaveLength(2);
    expect(p.peakStaffing).toBe(2);
    // staffing density per day: Oct 5 only a, Oct 7 both, Oct 11 only b.
    expect(p.staffingByDay[0]).toBe(1);
    expect(p.staffingByDay[2]).toBe(2);
    expect(p.staffingByDay[6]).toBe(1);
    expect(p.state).toBe("known");
  });

  it("an unstated headcount is NOT PROVIDED, never zero or covered", () => {
    const m = buildProjectsInTime({ items, timeline, entries: [zoneEntry({ id: "project:pr1", requiredHeadcount: 0 })], today: "2026-10-06" });
    expect(m.projects[0].need.kind).toBe("notProvided");
  });

  it("a stated headcount that is not covered is an OPEN NEED with the real gap", () => {
    const m = buildProjectsInTime({ items, timeline, entries: [zoneEntry({ id: "project:pr1", requiredHeadcount: 4, coveredHeadcount: 1, userEnteredHeadcount: 4 })], today: "2026-10-06" });
    expect(m.projects[0].need).toEqual({ kind: "open", missing: 3, required: 4, covered: 1 });
  });

  it("a system-suggested headcount nobody stated is NOT a need", () => {
    const m = buildProjectsInTime({ items, timeline, entries: [zoneEntry({ id: "project:pr1", requiredHeadcount: 1, coveredHeadcount: 0, systemSuggestedHeadcount: 1 })], today: "2026-10-06" });
    expect(m.projects[0].need.kind).toBe("notProvided");
  });

  it("a covered need says covered", () => {
    const m = buildProjectsInTime({ items, timeline, entries: [zoneEntry({ id: "project:pr1", requiredHeadcount: 2, coveredHeadcount: 2, userEnteredHeadcount: 2 })], today: "2026-10-06" });
    expect(m.projects[0].need).toEqual({ kind: "covered", required: 2 });
  });

  it("demand without a project becomes an open-need lane, undated demand is counted not placed", () => {
    const m = buildProjectsInTime({
      items,
      timeline,
      entries: [
        zoneEntry({ id: "demand:d1", source: "demand" as PlanningZoneEntry["source"], title: "Bricklayers", startDate: "2026-10-14", endDate: "2026-10-18", requiredHeadcount: 3, coveredHeadcount: 1, userEnteredHeadcount: 3 }),
        zoneEntry({ id: "demand:d2", source: "demand" as PlanningZoneEntry["source"], title: "Painters", requiredHeadcount: 2, coveredHeadcount: 0, userEnteredHeadcount: 2 }),
        zoneEntry({ id: "demand:d3", source: "demand" as PlanningZoneEntry["source"], title: "Done", startDate: "2026-10-14", requiredHeadcount: 1, coveredHeadcount: 1, userEnteredHeadcount: 1 }),
      ],
      today: "2026-10-06",
    });
    expect(m.needs.map((n) => n.id)).toEqual(["demand:d1"]);
    expect(m.needs[0].missing).toBe(2);
    expect(m.needs[0].band).not.toBeNull();
    expect(m.undatedNeeds).toBe(1);
  });

  it("a project with no dates is NOT PROVIDED and counted, not given an invented span", () => {
    const m = buildProjectsInTime({
      items: [item({ id: "project:pr9", sourceType: "project", sourceId: "pr9", label: "Loft", startDate: null, endDate: null, status: "draft", roleContext: "managed", href: "/dashboard/projects/pr9" })],
      timeline,
      entries: [],
      today: "2026-10-06",
    });
    const loft = m.projects.find((p) => p.projectId === "pr9")!;
    expect(loft.state).toBe("notProvided");
    expect(loft.band).toBeNull();
    // pr1 is staffed on the roster timeline but has no project row here: its
    // span is likewise not provided, and it is counted, not given one.
    expect(m.projectsWithoutDates).toBe(2);
  });
});

describe("my time — now and next", () => {
  const items = [
    item({ id: "booking:a", startDate: "2026-10-06", endDate: "2026-10-06", label: "Today job" }),
    item({ id: "journal:j", sourceType: "journal", status: "recorded", startDate: "2026-10-06", endDate: "2026-10-06" }),
    item({ id: "booking:b", startDate: "2026-10-09", endDate: "2026-10-10", label: "Later job" }),
    item({ id: "task:x", sourceType: "task", startDate: null, endDate: null }),
  ];
  it("lists what covers today (without the journal, which is a record), the next dated row and the undated count", () => {
    const n = buildMyNowNext(items, "2026-10-06");
    expect(n.today.map((i) => i.id)).toEqual(["booking:a"]);
    expect(n.next?.id).toBe("booking:b");
    expect(n.nextInDays).toBe(3);
    expect(n.undatedCount).toBe(1);
  });
  it("an empty today is empty, with no invented row", () => {
    const n = buildMyNowNext([], "2026-10-06");
    expect(n.today).toEqual([]);
    expect(n.next).toBeNull();
    expect(n.nextInDays).toBeNull();
  });
});

describe("URL state", () => {
  it("accepts only the three lenses", () => {
    expect(isTimeLens("people")).toBe(true);
    expect(isTimeLens("admin")).toBe(false);
    expect(isTimeLens(undefined)).toBe(false);
  });
  it("parses a focus and rejects anything else", () => {
    expect(parseTimeFocus("person:abc-123")).toEqual({ kind: "person", id: "abc-123" });
    expect(parseTimeFocus("project:7f")).toEqual({ kind: "project", id: "7f" });
    expect(parseTimeFocus("person:../etc")).toBeNull();
    expect(parseTimeFocus("team:1")).toBeNull();
    expect(parseTimeFocus(undefined)).toBeNull();
  });
  it("keeps the clean URL canonical and carries lens, date and focus", () => {
    expect(lensHref({ lens: "me", today: "2026-10-06" })).toBe("/dashboard/planning");
    expect(lensHref({ lens: "people", today: "2026-10-06", date: "2026-10-06" })).toBe("/dashboard/planning?lens=people");
    expect(
      lensHref({ lens: "projects", today: "2026-10-06", date: "2026-11-02", focus: { kind: "project", id: "p1" }, anchor: "wit-focus" }),
    ).toBe("/dashboard/planning?lens=projects&date=2026-11-02&focus=project%3Ap1#wit-focus");
  });
});
