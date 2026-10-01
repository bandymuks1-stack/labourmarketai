import { describe, expect, it } from "vitest";

import { buildRosterTimeline, mondayOf, shiftDay } from "./roster-timeline-model";

const row = (workerId: string, commitments: { id: string; s: string; e: string | null }[]) => ({
  workerId,
  workerName: workerId,
  overlaps: 0,
  undatedProjects: [],
  commitments: commitments.map((c) => ({
    kind: "project" as const,
    sourceId: c.id,
    label: c.id,
    startDate: c.s,
    endDate: c.e,
    conflict: false,
  })),
});

describe("roster timeline", () => {
  it("positions a bar on the shared day axis", () => {
    const t = buildRosterTimeline({
      rows: [row("a", [{ id: "p1", s: "2026-10-05", e: "2026-10-09" }])],
      absences: [],
      from: "2026-10-05",
      days: 28,
      today: "2026-10-06",
    });
    const bar = t.people[0].bars[0];
    expect(bar.leftPct).toBe(0);
    expect(bar.widthPct).toBeCloseTo((5 / 28) * 100);
    expect(t.todayPct).not.toBeNull();
  });

  it("flags an overlap between a commitment and an approved absence, hiding neither", () => {
    const t = buildRosterTimeline({
      rows: [row("a", [{ id: "p1", s: "2026-10-05", e: "2026-10-09" }])],
      absences: [
        { workerId: "a", workerName: "a", sourceId: "x", startDate: "2026-10-08", endDate: "2026-10-12" },
      ],
      from: "2026-10-05",
      days: 28,
      today: "2026-10-01",
    });
    expect(t.people[0].bars).toHaveLength(2);
    expect(t.people[0].bars.every((b) => b.conflict)).toBe(true);
    expect(t.people[0].bars.find((b) => b.kind === "absence")?.label).toBeNull();
  });

  it("clips to the window and counts what lies outside it", () => {
    const t = buildRosterTimeline({
      rows: [
        row("a", [
          { id: "p1", s: "2026-09-20", e: "2026-10-07" },
          { id: "p2", s: "2027-01-01", e: null },
        ]),
      ],
      absences: [],
      from: "2026-10-05",
      days: 28,
      today: "2026-10-05",
    });
    const p = t.people[0];
    expect(p.bars).toHaveLength(1);
    expect(p.bars[0].clippedStart).toBe(true);
    expect(p.bars[0].leftPct).toBe(0);
    expect(p.outsideWindow).toBe(1);
  });

  it("an absence-only person is still on the timeline", () => {
    const t = buildRosterTimeline({
      rows: [],
      absences: [{ workerId: "z", workerName: "Z", sourceId: "s", startDate: "2026-10-06", endDate: null }],
      from: "2026-10-05",
      days: 14,
      today: "2026-10-05",
    });
    expect(t.people[0].name).toBe("Z");
    expect(t.people[0].bars[0].widthPct).toBeCloseTo((1 / 14) * 100);
  });

  it("date helpers are UTC and week-correct", () => {
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
  });
});
