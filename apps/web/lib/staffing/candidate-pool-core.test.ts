/**
 * Candidate pool core — honest status + filtering. No DB, no server-only.
 */
import { describe, it, expect } from "vitest";
import {
  candidateEvidenceStatus,
  candidateMissingFields,
  toCandidateView,
  filterCandidates,
  candidatePoolFacets,
  type CandidateInput,
} from "./candidate-pool-core";

function cand(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    id: "w1",
    profileId: "p1",
    displayName: "Jonas",
    headline: "Tiler",
    availableFrom: "2026-07-01",
    availabilityStatus: "available",
    locationCountry: "LT",
    preferredCountries: ["NL"],
    experienceYears: 5,
    professionSlugs: ["tiler"],
    skillsDeclared: 3,
    skillsConfirmed: 0,
    journalEntries: 2,
    managerConfirmations: 0,
    ...overrides,
  };
}

describe("candidateEvidenceStatus (honest, never 'verified')", () => {
  it("confirmed_evidence when manager-confirmed skills/journal exist", () => {
    expect(candidateEvidenceStatus(cand({ skillsConfirmed: 2 }))).toBe("confirmed_evidence");
    expect(candidateEvidenceStatus(cand({ managerConfirmations: 1, skillsConfirmed: 0 }))).toBe(
      "confirmed_evidence",
    );
  });
  it("self_declared when only declared skills / journal exist", () => {
    expect(candidateEvidenceStatus(cand({ skillsConfirmed: 0, managerConfirmations: 0 }))).toBe(
      "self_declared",
    );
  });
  it("missing_info when nothing is declared", () => {
    expect(
      candidateEvidenceStatus(
        cand({ skillsDeclared: 0, skillsConfirmed: 0, journalEntries: 0, managerConfirmations: 0 }),
      ),
    ).toBe("missing_info");
  });
});

describe("candidateMissingFields", () => {
  it("flags missing profession / availability / country", () => {
    const m = candidateMissingFields(
      cand({ professionSlugs: [], availableFrom: null, availabilityStatus: null, locationCountry: null, preferredCountries: [] }),
    );
    expect(m).toEqual(["profession", "availability", "country"]);
  });
  it("no missing fields when all present", () => {
    expect(candidateMissingFields(cand())).toEqual([]);
  });
});

describe("filterCandidates", () => {
  const views = [
    toCandidateView(cand({ id: "a", professionSlugs: ["tiler"], locationCountry: "LT", availableFrom: "2026-07-01", skillsConfirmed: 2 })),
    toCandidateView(cand({ id: "b", displayName: "Petras", professionSlugs: ["welder"], locationCountry: "PL", preferredCountries: ["DE"], availableFrom: "2026-09-01", skillsConfirmed: 0 })),
    toCandidateView(cand({ id: "c", displayName: "Anna", professionSlugs: ["tiler"], locationCountry: "LV", availableFrom: null, availabilityStatus: null })),
  ];

  it("filters by profession", () => {
    expect(filterCandidates(views, { profession: "welder" }).map((c) => c.id)).toEqual(["b"]);
  });
  it("filters by country across location and preferred", () => {
    expect(filterCandidates(views, { country: "DE" }).map((c) => c.id)).toEqual(["b"]);
    expect(filterCandidates(views, { country: "LT" }).map((c) => c.id)).toEqual(["a"]);
  });
  it("filters by availableBy — unknown availability never passes", () => {
    expect(filterCandidates(views, { availableBy: "2026-08-01" }).map((c) => c.id)).toEqual(["a"]);
  });
  it("filters by evidence status", () => {
    expect(filterCandidates(views, { evidence: "confirmed_evidence" }).map((c) => c.id)).toEqual(["a"]);
  });
  it("filters by search text", () => {
    expect(filterCandidates(views, { search: "anna" }).map((c) => c.id)).toEqual(["c"]);
  });
});

describe("candidatePoolFacets", () => {
  it("returns distinct sorted professions + countries", () => {
    const views = [
      toCandidateView(cand({ professionSlugs: ["tiler"], locationCountry: "LT", preferredCountries: ["NL"] })),
      toCandidateView(cand({ professionSlugs: ["welder"], locationCountry: "PL", preferredCountries: ["DE"] })),
    ];
    const f = candidatePoolFacets(views);
    expect(f.professions).toEqual(["tiler", "welder"]);
    expect(f.countries).toEqual(["DE", "LT", "NL", "PL"]);
  });
});
