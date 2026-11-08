import { describe, expect, it } from "vitest";

import { countInScope, groupByOrganization, reviewScopeOf, rowsInScope } from "./review-scope";

/** One reviewer, two organizations, and one row whose organization cannot be read. */
const ROWS = [
  { id: "a1", organizationId: "org-a", organizationName: "Alfa UAB" },
  { id: "b1", organizationId: "org-b", organizationName: "Beta UAB" },
  { id: "a2", organizationId: "org-a", organizationName: "Alfa UAB" },
  { id: "x1", organizationId: null, organizationName: null },
  { id: "b2", organizationId: "org-b", organizationName: null },
  { id: "a3", organizationId: "org-a", organizationName: "Alfa UAB" },
];
const BY_ENTRY = new Map(ROWS.map((r) => [r.id, r.organizationId]));
const ids = (rows: readonly { id: string }[]) => rows.map((r) => r.id);

describe("a reviewer in two organizations", () => {
  const inA = reviewScopeOf("org-a");
  const inB = reviewScopeOf("org-b");

  it("sees only Alfa's rows and count under Alfa", () => {
    expect(countInScope(BY_ENTRY, inA)).toBe(3);
    expect(ids(rowsInScope(ROWS, inA).rows)).toEqual(["a1", "a2", "a3"]);
  });

  it("sees only Beta's rows and count under Beta", () => {
    expect(countInScope(BY_ENTRY, inB)).toBe(2);
    expect(ids(rowsInScope(ROWS, inB).rows)).toEqual(["b1", "b2"]);
  });

  it("the count and the rows agree in each organization", () => {
    for (const scope of [inA, inB]) {
      expect(countInScope(BY_ENTRY, scope)).toBe(rowsInScope(ROWS, scope).rows.length);
    }
  });

  it("loses nothing: each scope names the rest as waiting elsewhere", () => {
    for (const scope of [inA, inB]) {
      const { rows, elsewhere } = rowsInScope(ROWS, scope);
      expect(rows.length + elsewhere).toBe(ROWS.length);
    }
    // Alfa + Beta + the unreadable row is the whole set, with no row counted twice.
    const a = rowsInScope(ROWS, inA).rows;
    const b = rowsInScope(ROWS, inB).rows;
    expect(new Set([...ids(a), ...ids(b)]).size).toBe(a.length + b.length);
    expect(a.length + b.length + ROWS.filter((r) => r.organizationId === null).length).toBe(ROWS.length);
  });

  it("a row whose organization cannot be read is claimed by no organization", () => {
    expect(ids(rowsInScope(ROWS, inA).rows)).not.toContain("x1");
    expect(ids(rowsInScope(ROWS, inB).rows)).not.toContain("x1");
  });

  it("an organization where the reader reviews nothing counts zero, and leaves every row elsewhere", () => {
    const inC = reviewScopeOf("org-c");
    expect(countInScope(BY_ENTRY, inC)).toBe(0);
    expect(rowsInScope(ROWS, inC)).toEqual({ rows: [], elsewhere: ROWS.length });
  });
});

describe("no organization active", () => {
  const all = reviewScopeOf(null);

  it("counts and shows every reviewable entry", () => {
    expect(all).toEqual({ kind: "all" });
    expect(reviewScopeOf(undefined)).toEqual({ kind: "all" });
    expect(countInScope(BY_ENTRY, all)).toBe(ROWS.length);
    expect(rowsInScope(ROWS, all)).toEqual({ rows: ROWS, elsewhere: 0 });
  });

  it("groups them by organization, each row exactly once, the unreadable group last", () => {
    const groups = groupByOrganization(ROWS);
    expect(groups.map((g) => [g.organizationId, g.organizationName, ids(g.rows)])).toEqual([
      ["org-a", "Alfa UAB", ["a1", "a2", "a3"]],
      ["org-b", "Beta UAB", ["b1", "b2"]],
      [null, null, ["x1"]],
    ]);
    expect(groups.flatMap((g) => ids(g.rows)).sort()).toEqual(ids(ROWS).sort());
  });

  it("an empty queue has no groups", () => {
    expect(groupByOrganization([])).toEqual([]);
  });
});
