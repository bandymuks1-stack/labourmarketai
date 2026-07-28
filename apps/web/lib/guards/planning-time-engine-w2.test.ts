import { describe, expect, it } from "vitest";

import {
  detectConflicts,
  isConflictEligible,
  projectAbsenceItem,
  projectStageItem,
  type PlanningItem,
} from "@/lib/planning/planning-model";

/**
 * Time Engine W2 guards (real-user workflow rebuild).
 *
 * Pins the three load-bearing decisions of the slice:
 *  1. The APPLIED W6/W7 models project into the ONE canonical calendar with
 *     honest semantics — stage dates mirror the gantt (actual overrides
 *     planned); absence history never joins the forward plan.
 *  2. APPROVED leave overlapping an ACCEPTED booking IS a conflict — the
 *     calendar must refuse to present a physically impossible plan as fine.
 *  3. The "assigned" conflict context is REACHABLE: an assigned project band
 *     overlapping an accepted booking is flagged (before W2 the server never
 *     produced roleContext "assigned", so that branch was dead code).
 */

function bookingAccepted(over: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "booking:b1",
    sourceType: "booking",
    sourceId: "b1",
    label: null,
    detail: null,
    startDate: "2026-08-03",
    endDate: "2026-08-07",
    status: "accepted",
    statusKey: "bookings.status.accepted",
    href: "/dashboard/bookings",
    roleContext: "incoming",
    ...over,
  };
}

describe("absence projection", () => {
  it("requested and approved absences join the plan at their real band", () => {
    for (const status of ["requested", "approved"]) {
      const item = projectAbsenceItem({
        id: "a1",
        startDate: "2026-08-04",
        endDate: "2026-08-05",
        status,
      });
      expect(item).not.toBeNull();
      expect(item!.id).toBe("absence:a1");
      expect(item!.startDate).toBe("2026-08-04");
      expect(item!.endDate).toBe("2026-08-05");
      expect(item!.statusKey).toBe(`absences.statuses.${status}`);
      expect(item!.href).toBe("/dashboard/absences");
    }
  });

  it("rejected/cancelled absences are history — never projected", () => {
    for (const status of ["rejected", "cancelled"]) {
      expect(
        projectAbsenceItem({
          id: "a1",
          startDate: "2026-08-04",
          endDate: "2026-08-05",
          status,
        }),
      ).toBeNull();
    }
  });

  it("only APPROVED absences are conflict-eligible (a request is not yet a commitment)", () => {
    const approved = projectAbsenceItem({
      id: "a1", startDate: "2026-08-04", endDate: "2026-08-05", status: "approved",
    })!;
    const requested = projectAbsenceItem({
      id: "a2", startDate: "2026-08-04", endDate: "2026-08-05", status: "requested",
    })!;
    expect(isConflictEligible(approved)).toBe(true);
    expect(isConflictEligible(requested)).toBe(false);
  });
});

describe("stage projection", () => {
  const base = {
    id: "s1",
    projectId: "p1",
    projectTitle: "Halė B",
    name: "Pamatai",
    status: "in_progress",
    plannedStart: "2026-08-01",
    plannedEnd: "2026-08-10",
    actualStart: "2026-08-03",
    actualEnd: null,
  };

  it("ACTUAL dates override PLANNED — identical to the stage gantt", () => {
    const item = projectStageItem(base)!;
    expect(item.startDate).toBe("2026-08-03"); // actual wins
    expect(item.endDate).toBe("2026-08-10"); // planned end (no actual yet)
    expect(item.label).toBe("Pamatai");
    expect(item.detail).toBe("Halė B");
    expect(item.href).toBe("/dashboard/projects/p1/operations");
    expect(item.statusKey).toBe("projectStages.statuses.in_progress");
  });

  it("a stage with no date at all has no calendar meaning", () => {
    expect(
      projectStageItem({
        ...base,
        plannedStart: null,
        plannedEnd: null,
        actualStart: null,
        actualEnd: null,
      }),
    ).toBeNull();
  });

  it("cancelled stages are history — never projected; stages never conflict", () => {
    expect(projectStageItem({ ...base, status: "cancelled" })).toBeNull();
    expect(isConflictEligible(projectStageItem(base)!)).toBe(false);
  });
});

describe("cross-source conflicts — impossible plans are surfaced", () => {
  it("APPROVED leave overlapping an ACCEPTED booking is a conflict", () => {
    const leave = projectAbsenceItem({
      id: "a1", startDate: "2026-08-05", endDate: "2026-08-09", status: "approved",
    })!;
    const conflicts = detectConflicts([bookingAccepted(), leave]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].overlapStart).toBe("2026-08-05");
  });

  it("REQUESTED leave does not conflict — nothing is invented", () => {
    const leave = projectAbsenceItem({
      id: "a1", startDate: "2026-08-05", endDate: "2026-08-09", status: "requested",
    })!;
    expect(detectConflicts([bookingAccepted(), leave])).toHaveLength(0);
  });

  it("an ASSIGNED project band overlapping an accepted booking is a conflict (the branch is now reachable)", () => {
    const assigned: PlanningItem = {
      id: "project:p9",
      sourceType: "project",
      sourceId: "p9",
      label: null,
      detail: null,
      startDate: "2026-08-06",
      endDate: "2026-08-20",
      status: "live",
      statusKey: "planning.projectStatus.live",
      href: "/dashboard/projects/p9",
      roleContext: "assigned",
    };
    expect(detectConflicts([bookingAccepted(), assigned])).toHaveLength(1);
    // The managed twin of the same band never conflicts (unchanged rule).
    expect(
      detectConflicts([bookingAccepted(), { ...assigned, roleContext: "managed" }]),
    ).toHaveLength(0);
  });
});
