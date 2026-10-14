import { describe, expect, it } from "vitest";

import { buildHistoryQuality, unplacedKind, type QualityProjectRow, type QualityRecord } from "./history-quality";

// Synthetic shapes of the 2026-10 production import (ids invented).
let n = 0;
const rec = (o: Partial<QualityRecord>): QualityRecord => ({
  id: `r${++n}`,
  sessionId: "s1",
  sourceFilename: "NL_2023.xlsx",
  personId: "pA",
  workObjectId: null,
  activityDate: "2023-03-06",
  periodStart: null,
  periodEnd: null,
  hours: 8,
  objectText: "",
  objectListLength: 0,
  ...o,
});
const projects = (state: "before" | "after"): QualityProjectRow[] => [
  { id: "P", title: "W22.073", recordState: "active", canonicalProjectId: null, historical: true },
  { id: "F1", title: "Cerero beton, W22.073", recordState: state === "after" ? "duplicate" : "active", canonicalProjectId: state === "after" ? "P" : null, historical: true },
  { id: "F2", title: "w22:073 afdichten", recordState: state === "after" ? "duplicate" : "active", canonicalProjectId: state === "after" ? "P" : null, historical: true },
  { id: "Q", title: "Hubartlaan 6", recordState: "active", canonicalProjectId: null, historical: true },
];
const projectOfObject = new Map([["oP", "P"], ["oF1", "F1"], ["oF2", "F2"], ["oQ", "Q"]]);
const records = [
  rec({ workObjectId: "oP", activityDate: "2023-01-13" }),
  rec({ workObjectId: "oF1", activityDate: "2023-11-03", personId: "pB" }),
  rec({ workObjectId: "oF2", activityDate: "2023-03-28", hours: 9 }),
  rec({ workObjectId: "oQ", activityDate: "2024-09-09", personId: "pC" }),
  rec({ objectText: "", hours: 7 }),
  rec({ objectText: "W22.073 (adresas nerastas žodyne), W22.057 (adresas nerastas žodyne)", activityDate: "2023-01-16" }),
  rec({ objectText: "Vivaldipark", activityDate: "2024-05-01", sessionId: "s2", sourceFilename: "NL_2024.xlsx" }),
  // one day label reused for three weeks: same person, same date, 26 h
  rec({ workObjectId: "oQ", activityDate: "2023-02-14", personId: "pD", hours: 9 }),
  rec({ workObjectId: "oQ", activityDate: "2023-02-14", personId: "pD", hours: 9 }),
  rec({ workObjectId: "oQ", activityDate: "2023-02-14", personId: "pD", hours: 8 }),
];

describe("history quality", () => {
  const before = buildHistoryQuality({ records, projects: projects("before"), projectOfObject, decisions: [] });
  const after = buildHistoryQuality({ records, projects: projects("after"), projectOfObject, decisions: [] });

  it("consolidation moves no record, no hour and no person", () => {
    expect(after.after.records).toBe(before.before.records);
    expect(after.after.hours).toBe(before.before.hours);
    expect(after.after.people).toBe(before.before.people);
    expect(after.after.recordsOnAProject).toBe(before.after.recordsOnAProject);
    expect(after.after.hoursOnAProject).toBe(before.after.hoursOnAProject);
  });

  it("imported rows vs real projects: the fragments count toward the kept project", () => {
    expect(before.before.importedProjectRows).toBe(4);
    expect(before.after.realProjects).toBe(4);
    expect(after.after.realProjects).toBe(2);
    expect(after.after.mergedRows).toBe(2);
    const p = after.byProject.find((x) => x.projectId === "P")!;
    expect(p).toMatchObject({ importedRows: 3, records: 3, hours: 25, people: 2, firstDate: "2023-01-13", lastDate: "2023-11-03" });
  });

  it("records without an object are categorized from their own text, never placed", () => {
    expect(after.after.unplaced.no_object).toEqual({ records: 1, hours: 7 });
    expect(after.after.unplaced.multiple_objects.records).toBe(1);
    expect(after.after.unplaced.single_unmatched.records).toBe(1);
    expect(unplacedKind({ objectText: "Travers 19", objectListLength: 0 })).toBe("single_unmatched");
    expect(unplacedKind({ objectText: "a", objectListLength: 2 })).toBe("multiple_objects");
  });

  it("a day label reused across weeks is a date conflict — the hours are kept, not doubled", () => {
    expect(after.after.dateConflicts).toEqual({ personDays: 1, records: 3 });
    expect(after.after.hours).toBe(before.before.hours);
  });

  it("per source: records, hours, placed and unplaced add up", () => {
    const total = after.bySession.reduce((s, x) => s + x.records, 0);
    expect(total).toBe(records.length);
    for (const s of after.bySession) expect(s.onAProject + s.unplaced).toBeLessThanOrEqual(s.records);
  });
});
