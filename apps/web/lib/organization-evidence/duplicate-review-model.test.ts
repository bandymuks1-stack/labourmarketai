import { describe, expect, it } from "vitest";

import { duplicateNote, groupPossibleDuplicates, type DuplicateCandidateInput } from "./duplicate-review-model";

const ORG = "org-1";
const rec = (o: Partial<DuplicateCandidateInput> & { id: string }): DuplicateCandidateInput => ({
  organizationId: ORG,
  personId: "p1",
  personName: "Jonas",
  activityDate: "2026-03-02",
  workObjectId: "w1",
  hours: 8,
  text: "Plytelių klijavimas",
  sourceFilename: "2026-03.xlsx",
  importedAt: "2026-10-01T10:00:00Z",
  rowOrigin: "parsed_file",
  withdrawn: false,
  superseded: false,
  ...o,
});

describe("possible duplicate history records are grouped, never decided", () => {
  it("groups two live records of the same person, day and site, with the comparison signals", () => {
    const g = groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", importedAt: "2026-10-02T10:00:00Z" })], ORG);
    expect(g).toHaveLength(1);
    expect(g[0]!.liveCount).toBe(2);
    expect(g[0]!.sameHours).toBe(true);
    expect(g[0]!.sameText).toBe(true);
    expect(g[0]!.records.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("different hours are shown as a difference, not hidden", () => {
    const g = groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", hours: 4 })], ORG);
    expect(g[0]!.sameHours).toBe(false);
  });
  it("another person, day or site is not a group; corrected originals and other organizations are ignored", () => {
    expect(groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", personId: "p2" })], ORG)).toHaveLength(0);
    expect(groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", activityDate: "2026-03-03" })], ORG)).toHaveLength(0);
    expect(groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", workObjectId: "w2" })], ORG)).toHaveLength(0);
    expect(groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", superseded: true })], ORG)).toHaveLength(0);
    expect(groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", organizationId: "org-2" })], ORG)).toHaveLength(0);
    expect(groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", workObjectId: null })], ORG)).toHaveLength(0);
  });
  it("a record marked as a duplicate stays listed beside the one kept (undo), and the group no longer awaits a decision", () => {
    const g = groupPossibleDuplicates([rec({ id: "a" }), rec({ id: "b", withdrawn: true })], ORG);
    expect(g).toHaveLength(1);
    expect(g[0]!.liveCount).toBe(1);
    expect(g[0]!.records.map((r) => [r.id, r.withdrawn])).toEqual([["a", false], ["b", true]]);
  });
  it("groups awaiting a decision come first", () => {
    const g = groupPossibleDuplicates(
      [
        rec({ id: "a", activityDate: "2026-04-01" }),
        rec({ id: "b", activityDate: "2026-04-01", withdrawn: true }),
        rec({ id: "c", activityDate: "2026-01-01" }),
        rec({ id: "d", activityDate: "2026-01-01" }),
      ],
      ORG,
    );
    expect(g.map((x) => x.liveCount)).toEqual([2, 1]);
  });
  it("the decision note names the record kept", () => {
    expect(duplicateNote("k1")).toBe("duplicate_of:k1");
  });
});
