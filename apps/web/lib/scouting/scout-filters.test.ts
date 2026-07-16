import { describe, expect, it } from "vitest";

import {
  allowlistScoutFilters,
  applyScoutFilters,
  buildScoutFacets,
  hasActiveScoutFilters,
  parseScoutFilterParams,
  SCOUT_FACET_LIMIT,
  type FilterableCandidate,
} from "./scout-filters";

function candidate(
  skills: string[],
  country: string | null,
  availability: string | null,
): FilterableCandidate {
  return {
    subject: {
      skills: skills.map((uri) => ({ uri })),
      country,
      availabilityStatus: availability,
    },
  };
}

describe("parseScoutFilterParams — server-side bounds", () => {
  it("accepts well-formed values and normalizes case", () => {
    expect(
      parseScoutFilterParams({ skill: "Arc-Welding", country: "lt", available: "1" }),
    ).toEqual({ skill: "arc-welding", country: "LT", availableNow: true });
  });

  it("rejects out-of-bounds skill values (charset, length, arrays)", () => {
    expect(parseScoutFilterParams({ skill: "a".repeat(61) }).skill).toBeNull();
    expect(parseScoutFilterParams({ skill: "drop table;" }).skill).toBeNull();
    expect(parseScoutFilterParams({ skill: "ĄŽUOLAS" }).skill).toBeNull();
    expect(parseScoutFilterParams({ skill: ["a", "b"] }).skill).toBeNull();
    expect(parseScoutFilterParams({ skill: "" }).skill).toBeNull();
  });

  it("rejects non-2-letter countries and non-'1' availability flags", () => {
    expect(parseScoutFilterParams({ country: "LTU" }).country).toBeNull();
    expect(parseScoutFilterParams({ country: "1;" }).country).toBeNull();
    expect(parseScoutFilterParams({ available: "yes" }).availableNow).toBe(false);
    expect(parseScoutFilterParams({ available: ["1"] }).availableNow).toBe(false);
  });
});

describe("buildScoutFacets", () => {
  const supply = [
    candidate(["masonry", "concrete-works"], "LT", "available"),
    candidate(["masonry"], "lt", "busy"),
    candidate(["arc-welding"], "DE", null),
  ];

  it("derives facet allowlists from the visible supply only", () => {
    const facets = buildScoutFacets(supply);
    expect(facets.skills[0]).toBe("masonry");
    expect(facets.skills).toContain("arc-welding");
    expect(facets.countries).toEqual(["LT", "DE"]);
  });

  it("caps facet lists (bounded UI, bounded allowlist)", () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      candidate([`skill-${i}`], null, null),
    );
    expect(buildScoutFacets(many).skills.length).toBeLessThanOrEqual(
      SCOUT_FACET_LIMIT,
    );
  });
});

describe("allowlistScoutFilters — a probe value matching no candidate is dropped", () => {
  it("keeps only values present in the facet allowlist", () => {
    const facets = buildScoutFacets([candidate(["masonry"], "LT", null)]);
    expect(
      allowlistScoutFilters(
        { skill: "totally-unknown", country: "XX", availableNow: true },
        facets,
      ),
    ).toEqual({ skill: null, country: null, availableNow: true });
    expect(
      allowlistScoutFilters(
        { skill: "masonry", country: "LT", availableNow: false },
        facets,
      ),
    ).toEqual({ skill: "masonry", country: "LT", availableNow: false });
  });
});

describe("applyScoutFilters — strictly narrowing", () => {
  const supply = [
    candidate(["masonry"], "LT", "available"),
    candidate(["masonry"], "DE", "busy"),
    candidate(["arc-welding"], "LT", "available"),
  ];

  it("filters by skill, country, availability — and only ever removes", () => {
    expect(
      applyScoutFilters(supply, { skill: "masonry", country: null, availableNow: false }),
    ).toHaveLength(2);
    expect(
      applyScoutFilters(supply, { skill: null, country: "LT", availableNow: false }),
    ).toHaveLength(2);
    expect(
      applyScoutFilters(supply, { skill: null, country: null, availableNow: true }),
    ).toHaveLength(2);
    expect(
      applyScoutFilters(supply, { skill: "masonry", country: "LT", availableNow: true }),
    ).toHaveLength(1);
    // No filter → identity, never an addition.
    expect(
      applyScoutFilters(supply, { skill: null, country: null, availableNow: false }),
    ).toHaveLength(supply.length);
  });
});

describe("hasActiveScoutFilters", () => {
  it("reports whether any facet is active", () => {
    expect(
      hasActiveScoutFilters({ skill: null, country: null, availableNow: false }),
    ).toBe(false);
    expect(
      hasActiveScoutFilters({ skill: "masonry", country: null, availableNow: false }),
    ).toBe(true);
  });
});
