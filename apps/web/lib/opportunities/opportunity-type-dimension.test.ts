import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { classifyIntent } from "@/lib/conversation/intent-router";
import { readWorldState, WORLD_STATE_DIMENSIONS } from "@/lib/ai-workspace/world-state-language";
import {
  EMPTY_DISCOVERY_FILTERS,
  applyDiscoveryFilters,
  buildDiscoveryQuery,
  collectDiscoveryFacets,
  externalAdMatchesFilters,
  needMatchesFilters,
  parseDiscoveryParams,
} from "./discovery-filters";
import type { OpportunityNeed } from "./opportunity-fit";

/**
 * Owner Master Execution Contract 2026-09-04 §4A / §15: "Where can I do an
 * internship?" — the declared opportunity type is a World State dimension
 * the board honours. Before this slice "kur galiu atlikti praktiką?" ran the
 * whole board: every employment demand came back as if it were a practice
 * placement.
 */

const need = (over: Partial<OpportunityNeed>): OpportunityNeed => ({
  id: "n",
  roleText: "welder",
  country: "LT",
  teamSize: 1,
  startPeriod: null,
  accommodation: null,
  ...over,
});

describe("the declared opportunity type is a discovery filter", () => {
  it("filters to the stated type; a demand that stated none is NOT an internship", () => {
    const cards = [
      { need: need({ id: "a", opportunityType: "internship" }) },
      { need: need({ id: "b", opportunityType: "employment" }) },
      { need: need({ id: "c" }) },
    ];
    const f = { ...EMPTY_DISCOVERY_FILTERS, opportunityType: "internship" };
    expect(applyDiscoveryFilters(cards, f).map((c) => c.need.id)).toEqual(["a"]);
    expect(needMatchesFilters(need({ opportunityType: null }), f)).toBe(false);
    // An external ad carries no type: a stated type EXCLUDES it (unknown ≠ match).
    expect(externalAdMatchesFilters({ professionSlug: "welder", country: "LT" }, f)).toBe(false);
  });

  it("rides the URL and the facets like every other dimension", () => {
    expect(parseDiscoveryParams({ opportunityType: "apprenticeship" }).filters.opportunityType).toBe("apprenticeship");
    expect(parseDiscoveryParams({ opportunityType: "<x>" }).filters.opportunityType).toBeNull();
    expect(buildDiscoveryQuery(EMPTY_DISCOVERY_FILTERS, "relevance", { opportunityType: "internship" })).toBe("?opportunityType=internship");
    const facets = collectDiscoveryFacets([need({ opportunityType: "internship" }), need({ id: "2", opportunityType: "employment" }), need({ id: "3" })]);
    expect(facets.opportunityTypes).toEqual(["employment", "internship"]);
  });

  it("is a World State dimension that maps onto the canonical filter field", () => {
    expect(WORLD_STATE_DIMENSIONS.opportunityType).toBe("opportunityType");
    expect(EMPTY_DISCOVERY_FILTERS).toHaveProperty("opportunityType");
  });
});

describe("the student's sentence narrows the board", () => {
  const vocab = [
    { dimension: "opportunityType" as const, value: "internship", terms: ["Praktika", "praktika", "stažuotė", "internship", "стажировка", "stage", "praktikum"], available: true },
    { dimension: "country" as const, value: "LT", terms: ["Lietuva", "Lithuania"], available: true },
  ];
  it.each([
    "Kur galiu atlikti praktiką?",
    "Where can I do an internship?",
    "Где я могу пройти стажировку?",
    "Waar kan ik stage lopen?",
    "Wo kann ich ein Praktikum machen?",
  ])("%s → opportunityType=internship", (text) => {
    expect(classifyIntent(text).intent).toBe("opportunities");
    expect(readWorldState(text, vocab).filters.opportunityType).toBe("internship");
  });
  it("a type NOT on the board is still understood and reported as unavailable — never silently the whole board", () => {
    // Prod walk 2026-09-04: no verified company had an internship demand, so
    // "praktiką" was an unknown word and the student got everything. The
    // closed set is always in the vocabulary; availability comes from the
    // board (same rule as a country the board does not contain).
    const withoutInternships = vocab.map((t) => (t.dimension === "opportunityType" ? { ...t, available: false } : t));
    const reading = readWorldState("Kur galiu atlikti praktiką?", withoutInternships);
    expect(reading.filters.opportunityType ?? null).toBeNull();
    expect(reading.matches.some((m) => m.dimension === "opportunityType" && m.available === false)).toBe(true);
    const SRC = readFileSync(join(__dirname, "..", "ai-workspace", "vocabulary-server.ts"), "utf8");
    expect(SRC).toMatch(/for \(const value of OPPORTUNITY_TYPES\)/);
    expect(SRC).toMatch(/available: facets\.opportunityTypes\.includes\(value\)/);
  });

  it("a plain job search sets no type", () => {
    expect(readWorldState("Ieškau darbo Lietuvoje", vocab).filters.opportunityType ?? null).toBeNull();
  });
});
