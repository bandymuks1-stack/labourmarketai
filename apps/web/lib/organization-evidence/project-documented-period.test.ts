import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { foldProjectDocumentedPeriods } from "./project-documented-period";

const rec = (o: Partial<Parameters<typeof foldProjectDocumentedPeriods>[0][number]>) => ({
  workObjectId: "o1",
  projectId: null,
  personId: "p1",
  activityDate: null,
  periodStart: null,
  periodEnd: null,
  hours: null,
  withdrawn: false,
  superseded: false,
  ...o,
});
const objects = new Map([
  ["o1", "P"],
  ["o2", "P"],
  ["o3", "Q"],
]);

describe("project documented period (derived on read)", () => {
  it("first/last recorded day, distinct days, person-days and day hours across the project's objects", () => {
    const p = foldProjectDocumentedPeriods(
      [
        rec({ activityDate: "2023-03-06", hours: 8 }),
        rec({ activityDate: "2023-03-06", hours: 7.5, personId: "p2" }),
        rec({ workObjectId: "o2", activityDate: "2023-11-24", hours: 8 }),
      ],
      objects,
    ).get("P")!;
    expect(p).toEqual({
      firstDate: "2023-03-06",
      lastDate: "2023-11-24",
      recordedDays: 2, // the days between are NOT invented
      personDays: 3,
      dayHours: 23.5,
      periodHours: 0,
      periodRecords: 0,
      people: 2,
    });
  });

  it("a period record widens the span but its hours are never added to day hours", () => {
    const p = foldProjectDocumentedPeriods(
      [rec({ activityDate: "2024-05-02", hours: 8 }), rec({ periodStart: "2024-04-01", periodEnd: "2024-06-30", hours: 400 })],
      objects,
    ).get("P")!;
    expect(p.firstDate).toBe("2024-04-01");
    expect(p.lastDate).toBe("2024-06-30");
    expect(p.dayHours).toBe(8);
    expect(p.periodHours).toBe(400);
    expect(p.recordedDays).toBe(1);
  });

  it("withdrawn and superseded records count for nothing; unplaced records belong to no project", () => {
    const m = foldProjectDocumentedPeriods(
      [
        rec({ activityDate: "2022-01-17", hours: 8, withdrawn: true }),
        rec({ activityDate: "2022-01-18", hours: 8, superseded: true }),
        rec({ workObjectId: null, activityDate: "2022-01-19", hours: 8 }),
        rec({ workObjectId: "o3", activityDate: "2022-02-01", hours: 6 }),
      ],
      objects,
    );
    expect(m.has("P")).toBe(false);
    expect(m.get("Q")).toMatchObject({ firstDate: "2022-02-01", dayHours: 6, people: 1 });
  });

  it("a record stamped with the project directly counts there without a work object", () => {
    const m = foldProjectDocumentedPeriods([rec({ workObjectId: null, projectId: "R", activityDate: "2025-07-01", hours: 4 })], objects);
    expect(m.get("R")).toMatchObject({ firstDate: "2025-07-01", lastDate: "2025-07-01", dayHours: 4 });
  });
});
