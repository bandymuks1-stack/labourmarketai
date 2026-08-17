import { describe, expect, it } from "vitest";

import { planningMeta, type PlanningItem } from "@/lib/planning/planning-model";
import {
  buildWorkloadWeeks,
  workloadHasSignal,
} from "@/lib/planning/workload-model";

function item(partial: Partial<PlanningItem>): PlanningItem {
  return {
    id: "booking:b1",
    sourceType: "booking",
    sourceId: "b1",
    label: null,
    detail: null,
    startDate: "2026-08-10",
    endDate: "2026-08-12",
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...planningMeta(),
    ...partial,
  };
}

describe("buildWorkloadWeeks", () => {
  it("counts planned days ONLY from confirmed personal commitments", () => {
    // Mon 2026-08-10 .. Sun 2026-08-16 is one ISO week.
    const weeks = buildWorkloadWeeks(
      [
        item({}), // accepted incoming booking Mon-Wed → 3 planned days
        item({
          id: "booking:b2",
          sourceId: "b2",
          status: "proposed", // a proposal is not yet work
          startDate: "2026-08-13",
          endDate: "2026-08-14",
        }),
        item({
          id: "project:p1",
          sourceId: "p1",
          sourceType: "project",
          roleContext: "managed", // someone else's schedule
          startDate: "2026-08-13",
          endDate: "2026-08-14",
        }),
      ],
      [],
      "2026-08-10",
      "2026-08-16",
    );
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toBe("2026-08-10");
    expect(weeks[0].weekEnd).toBe("2026-08-16");
    expect(weeks[0].plannedDays).toBe(3);
    expect(weeks[0].actualHours).toBe(0);
  });

  it("sums recorded hours per week and never converts days<->hours", () => {
    const weeks = buildWorkloadWeeks(
      [],
      [
        { day: "2026-08-10", hours: 8 },
        { day: "2026-08-11", hours: 6.5 },
        { day: "2026-08-17", hours: 4 }, // next week
        { day: "bad-day", hours: 99 }, // dropped
        { day: "2026-08-12", hours: -3 }, // dropped
      ],
      "2026-08-10",
      "2026-08-23",
    );
    expect(weeks).toHaveLength(2);
    expect(weeks[0].actualHours).toBe(14.5);
    expect(weeks[1].actualHours).toBe(4);
    expect(weeks[0].plannedDays).toBe(0); // hours never become days
  });

  it("expands the range outward to whole Monday-started weeks, capped", () => {
    const weeks = buildWorkloadWeeks([], [], "2026-08-13", "2026-08-13");
    expect(weeks).toHaveLength(1);
    expect(weeks[0].weekStart).toBe("2026-08-10");
    // A malformed / reversed range yields nothing rather than looping.
    expect(buildWorkloadWeeks([], [], "2026-08-20", "2026-08-10")).toHaveLength(0);
    expect(buildWorkloadWeeks([], [], "nope", "2026-08-10")).toHaveLength(0);
    // A year-long range is capped at 12 weeks (hard guard).
    expect(
      buildWorkloadWeeks([], [], "2026-01-01", "2026-12-31").length,
    ).toBeLessThanOrEqual(12);
  });

  it("workloadHasSignal is false for an all-zero strip", () => {
    const weeks = buildWorkloadWeeks([], [], "2026-08-10", "2026-08-16");
    expect(workloadHasSignal(weeks)).toBe(false);
    expect(
      workloadHasSignal([
        { weekStart: "2026-08-10", weekEnd: "2026-08-16", plannedDays: 0, actualHours: 2 },
      ]),
    ).toBe(true);
  });
});
