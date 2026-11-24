import { describe, expect, it } from "vitest";

import {
  countsAfterResolutions,
  planPeopleIngest,
  type IngestPlanRow,
  type RowResolution,
} from "./ingest-core";

/**
 * The projection the review panel shows must be the SAME arithmetic the
 * server will perform when it re-plans with those answers. The last test here
 * is the one that matters: it runs both and compares them.
 */

const ambiguousRow = (index: number, candidateIds: readonly string[]): IngestPlanRow => ({
  index,
  source: { name: `Person ${index}` },
  normalizedName: `person ${index}`,
  disposition: {
    kind: "ambiguous",
    candidates: candidateIds.map((id) => ({ id, displayName: `Roster ${id}` })),
  },
  relationship: null,
});

const newRow = (index: number): IngestPlanRow => ({
  index,
  source: { name: `Person ${index}` },
  normalizedName: `person ${index}`,
  disposition: { kind: "new" },
  relationship: "employee",
});

const COUNTS = {
  total: 3,
  toCreate: 1,
  alreadyOnRoster: 0,
  duplicateInBatch: 0,
  ambiguous: 2,
  unusable: 0,
};

describe("countsAfterResolutions — the number the human is approving", () => {
  const rows = [newRow(0), ambiguousRow(1, ["a"]), ambiguousRow(2, ["b", "c"])];

  it("leaves the counts alone while nothing is answered", () => {
    expect(countsAfterResolutions(rows, COUNTS, [])).toEqual(COUNTS);
  });

  it("moves an ambiguity answered NEW into the creations", () => {
    const out = countsAfterResolutions(rows, COUNTS, [{ index: 1, choice: "new" }]);
    expect(out.toCreate).toBe(2);
    expect(out.ambiguous).toBe(1);
    expect(out.alreadyOnRoster).toBe(0);
  });

  it("moves an ambiguity answered EXISTING onto the roster count", () => {
    const out = countsAfterResolutions(rows, COUNTS, [
      { index: 2, choice: "existing", personId: "c" },
    ]);
    expect(out.alreadyOnRoster).toBe(1);
    expect(out.ambiguous).toBe(1);
    expect(out.toCreate).toBe(1);
  });

  it("UNBLOCKS the all-ambiguous file — the dead-button case", () => {
    // Every row a question, so the first preview said toCreate = 0 and the
    // confirm button was disabled. Answering every question with "new" has to
    // move that number, or the file can never be imported at all.
    const allAmbiguous = [ambiguousRow(0, ["a"]), ambiguousRow(1, ["b"])];
    const zero = { ...COUNTS, total: 2, toCreate: 0, ambiguous: 2 };
    const answers: RowResolution[] = [
      { index: 0, choice: "new" },
      { index: 1, choice: "new" },
    ];
    expect(countsAfterResolutions(allAmbiguous, zero, [])).toMatchObject({ toCreate: 0 });
    expect(countsAfterResolutions(allAmbiguous, zero, answers)).toMatchObject({
      toCreate: 2,
      ambiguous: 0,
    });
  });

  it("ignores an answer naming a candidate that row was never offered", () => {
    const out = countsAfterResolutions(rows, COUNTS, [
      { index: 1, choice: "existing", personId: "not-offered" },
    ]);
    expect(out).toEqual(COUNTS);
  });

  it("ignores an answer for a row that is not a question", () => {
    expect(countsAfterResolutions(rows, COUNTS, [{ index: 0, choice: "new" }])).toEqual(COUNTS);
  });

  it("never moves the counts that answers cannot affect", () => {
    const out = countsAfterResolutions(rows, COUNTS, [{ index: 1, choice: "new" }]);
    expect(out.total).toBe(COUNTS.total);
    expect(out.duplicateInBatch).toBe(COUNTS.duplicateInBatch);
    expect(out.unusable).toBe(COUNTS.unusable);
  });
});

describe("the projection agrees with the planner it mirrors", () => {
  // Two roster people share a name, so "Jonas Jonaitis" is genuinely a
  // question; "Nauja Zmogus" is not on the roster at all.
  const roster = [
    { id: "p1", displayName: "Jonas Jonaitis", normalizedName: "jonaitis jonas", externalRef: null },
    { id: "p2", displayName: "Jonas Jonaitis", normalizedName: "jonaitis jonas", externalRef: null },
  ];
  const sources = [{ name: "Jonas Jonaitis" }, { name: "Nauja Zmogus" }];

  const firstPass = planPeopleIngest({ sources, roster, relationship: "employee" });

  it("reproduces the planner's own counts for every answer", () => {
    if (firstPass.kind !== "plan") throw new Error("expected a plan");
    expect(firstPass.counts.ambiguous).toBe(1);

    for (const answer of [
      { index: 0, choice: "new" } as const,
      { index: 0, choice: "existing", personId: "p2" } as const,
    ]) {
      const projected = countsAfterResolutions(firstPass.rows, firstPass.counts, [answer]);
      const replanned = planPeopleIngest({
        sources,
        roster,
        relationship: "employee",
        resolutions: [answer],
      });
      if (replanned.kind !== "plan") throw new Error("expected a plan");
      expect(projected).toEqual(replanned.counts);
    }
  });
});
