import { describe, expect, it } from "vitest";

import type { EvidenceRecordView } from "./import-core";
import { summarizePersonHistory } from "./person-history-summary";

const rec = (o: Partial<EvidenceRecordView> & { id: string }) =>
  ({
    personId: "p1",
    personName: "Jonas",
    activityDate: null,
    periodStart: null,
    periodEnd: null,
    hours: null,
    contextLabel: null,
    workObjectId: null,
    withdrawn: false,
    ...o,
  }) as unknown as EvidenceRecordView;

describe("summarizePersonHistory", () => {
  it("keeps records WITHOUT a work object, grouped by source label or 'none' — never dropped", () => {
    const s = summarizePersonHistory([
      rec({ id: "a", activityDate: "2025-03-01", hours: 8, workObjectId: "w1" }),
      rec({ id: "b", activityDate: "2025-03-02", hours: 6, contextLabel: "Vilnius, Gedimino 5" }),
      rec({ id: "c", activityDate: "2025-03-03", hours: 4 }),
    ], [{ id: "w1", name: "Site A", addressLine: null, city: null, projectId: null, archived: false }]);
    expect(s.liveRecords).toBe(3);
    expect(s.recordsWithoutWorkObject).toBe(2);
    expect(s.history.places.map((p) => [p.kind, p.name])).toEqual(
      expect.arrayContaining([["object", "Site A"], ["label", "Vilnius, Gedimino 5"], ["none", null]]),
    );
    expect(s.history.places.reduce((n, p) => n + p.records.length, 0)).toBe(3);
  });

  it("hours are STATED hours; a record with no hours is counted, not zeroed", () => {
    const s = summarizePersonHistory([
      rec({ id: "a", activityDate: "2025-03-01", hours: 8 }),
      rec({ id: "b", activityDate: "2025-03-02", hours: null }),
      rec({ id: "c", activityDate: "2025-03-03", hours: 0 }),
    ]);
    expect(s.dayHours).toBe(8);
    expect(s.recordsWithoutHours).toBe(1);
  });

  it("an undated record stays in the history and is counted", () => {
    const s = summarizePersonHistory([rec({ id: "a", hours: 5 }), rec({ id: "b", activityDate: "2025-01-01", hours: 1 })]);
    expect(s.recordsUndated).toBe(1);
    expect(s.liveRecords).toBe(2);
  });

  it("a period total is its own figure: never in the headline day hours, never spread onto months", () => {
    // Formerly pinned `statedHours = 308` (day + period in ONE headline). That
    // sum broke the never-sum rule the card's own place lines and
    // person-hours.ts follow, and decision 0025 (a period total joins a total
    // only inside the one reading). The headline is the day hours; the period
    // total stands beside it.
    const s = summarizePersonHistory([
      rec({ id: "p", periodStart: "2025-01-01", periodEnd: "2025-03-31", hours: 300 }),
      rec({ id: "d", activityDate: "2025-02-10", hours: 8 }),
    ]);
    expect(s.periodHours).toBe(300);
    expect(s.dayHours).toBe(8);
    expect(s).not.toHaveProperty("statedHours");
    expect(s.byMonth).toEqual([{ month: "2025-02", hours: 8 }]);
  });

  it("headline and place lines state the SAME day hours (one rule, personHoursOf)", () => {
    const s = summarizePersonHistory(
      [
        rec({ id: "p", workObjectId: "w1", periodStart: "2025-01-01", periodEnd: "2025-03-31", hours: 300 }),
        rec({ id: "d1", workObjectId: "w1", activityDate: "2025-02-10", hours: 8 }),
        rec({ id: "d2", activityDate: "2025-02-11", hours: 6.5 }),
      ],
      [{ id: "w1", name: "Site A", addressLine: null, city: null, projectId: null, archived: false }],
    );
    expect(s.dayHours).toBe(14.5);
    expect(s.history.places.reduce((n, p) => n + p.dayHours, 0)).toBe(s.dayHours);
    expect(s.history.places.reduce((n, p) => n + p.periodHours, 0)).toBe(s.periodHours);
  });

  it("counts only the correction, matching the place rows, while the original record stays intact", () => {
    const records = [
      rec({ id: "original", activityDate: "2025-03-01", hours: 8, superseded: true }),
      rec({ id: "correction", activityDate: "2025-03-01", hours: 6, correctionOf: "original" }),
    ];
    const s = summarizePersonHistory(records);
    expect(s.liveRecords).toBe(1);
    expect(s.dayHours).toBe(6);
    expect(s.byMonth).toEqual([{ month: "2025-03", hours: 6 }]);
    expect(s.history.places.reduce((sum, place) => sum + place.dayHours, 0)).toBe(6);
    expect(records[0].hours).toBe(8);
  });

  it("withdrawn records count nowhere", () => {
    const s = summarizePersonHistory([rec({ id: "a", activityDate: "2025-03-01", hours: 8, withdrawn: true })]);
    expect(s.liveRecords).toBe(0);
    expect(s.periodHours).toBe(0);
    expect(s.dayHours).toBe(0);
  });
});
