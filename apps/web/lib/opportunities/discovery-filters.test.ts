import { describe, expect, it } from "vitest";

import {
  INITIAL_VIEW_DEFAULT_COUNT,
  INITIAL_VIEW_MAX_COUNT,
  parseDiscoveryParams,
  selectInitialBoardView,
} from "./discovery-filters";

/**
 * Compressed first view (owner rule 2026-08-29): 3 best opportunities by
 * default, an ABSOLUTE ceiling of 5 in the initial view, and the full ranked
 * universe always one explicit refinement away. These tests pin the rule so
 * the board can never quietly regress into a result wall — and so the cap can
 * never quietly become data reduction.
 */

const cards = (n: number): ReadonlyArray<{ id: number }> =>
  Array.from({ length: n }, (_, i) => ({ id: i }));

const pristine = {
  sort: "relevance" as const,
  activeFilterCount: 0,
  view: "top" as const,
};

describe("selectInitialBoardView — the 3-best default", () => {
  it("shows exactly 3 when more candidates exist", () => {
    const v = selectInitialBoardView(cards(100), pristine);
    expect(v.visible).toHaveLength(3);
    expect(v.capped).toBe(true);
    expect(v.hiddenCount).toBe(97);
  });

  it("the default count is 3 and the hard initial ceiling is 5", () => {
    expect(INITIAL_VIEW_DEFAULT_COUNT).toBe(3);
    expect(INITIAL_VIEW_MAX_COUNT).toBe(5);
  });

  it("never exceeds 5 in the initial view, whatever initialCount asks for", () => {
    const v = selectInitialBoardView(cards(100), {
      ...pristine,
      initialCount: 50,
    });
    expect(v.visible.length).toBeLessThanOrEqual(INITIAL_VIEW_MAX_COUNT);
  });

  it("preserves the ranked order — visible is a strict prefix, not a re-sort", () => {
    const input = cards(10);
    const v = selectInitialBoardView(input, pristine);
    expect(v.visible).toEqual(input.slice(0, 3));
  });

  it("shows everything when candidates are scarce (no fake scarcity, no pad)", () => {
    const v = selectInitialBoardView(cards(2), pristine);
    expect(v.visible).toHaveLength(2);
    expect(v.capped).toBe(false);
    expect(v.hiddenCount).toBe(0);
  });
});

describe("selectInitialBoardView — the universe stays reachable", () => {
  it("?view=all returns every ranked card intact", () => {
    const input = cards(100);
    const v = selectInitialBoardView(input, { ...pristine, view: "all" });
    expect(v.visible).toEqual(input);
    expect(v.capped).toBe(false);
  });

  it("an active filter is a refinement — the cap does not apply", () => {
    const v = selectInitialBoardView(cards(40), {
      ...pristine,
      activeFilterCount: 1,
    });
    expect(v.visible).toHaveLength(40);
  });

  it("the newest sort is a refinement — a positional cap there would present recency as fit", () => {
    const v = selectInitialBoardView(cards(40), { ...pristine, sort: "newest" });
    expect(v.visible).toHaveLength(40);
  });

  it("hiddenCount is the honest remainder — nothing is dropped, only deferred", () => {
    const input = cards(17);
    const v = selectInitialBoardView(input, pristine);
    expect(v.visible.length + v.hiddenCount).toBe(input.length);
  });
});

describe("parseDiscoveryParams — the view param", () => {
  it("defaults to the compressed top view", () => {
    expect(parseDiscoveryParams({}).view).toBe("top");
  });

  it("accepts only the literal 'all'; junk stays compressed", () => {
    expect(parseDiscoveryParams({ view: "all" }).view).toBe("all");
    expect(parseDiscoveryParams({ view: "ALL" }).view).toBe("top");
    expect(parseDiscoveryParams({ view: "everything" }).view).toBe("top");
    expect(parseDiscoveryParams({ view: "<script>" }).view).toBe("top");
  });
});
