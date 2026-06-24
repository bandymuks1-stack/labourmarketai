import { describe, expect, it } from "vitest";
import {
  classifyEntrySkillSource,
  buildEntrySkillSources,
  needsReview,
  CLEAN_EVIDENCE_SOURCES,
} from "./entry-skill-source";

describe("classifyEntrySkillSource — honest per-chip source", () => {
  it("unlinked profile skill → available to link", () => {
    expect(
      classifyEntrySkillSource({ linked: false, verified: false, recognizedFromText: false, recognizable: true }),
    ).toBe("profile_skill_available_to_link");
  });

  it("verified wins → confirmed_by_person (even if recognized)", () => {
    expect(
      classifyEntrySkillSource({ linked: true, verified: true, recognizedFromText: true, recognizable: true }),
    ).toBe("confirmed_by_person");
  });

  it("grounded in the entry text → recognized_from_text", () => {
    expect(
      classifyEntrySkillSource({ linked: true, verified: false, recognizedFromText: true, recognizable: true }),
    ).toBe("recognized_from_text");
  });

  it("linked + recognizer knows it but text does NOT support it → stale_needs_review", () => {
    // The old-construction-chip case: a known skill linked to an entry whose
    // text gives it no support.
    expect(
      classifyEntrySkillSource({ linked: true, verified: false, recognizedFromText: false, recognizable: true }),
    ).toBe("stale_needs_review");
  });

  it("linked but recognizer cannot judge it → manually_linked_to_entry (not over-flagged)", () => {
    expect(
      classifyEntrySkillSource({ linked: true, verified: false, recognizedFromText: false, recognizable: false }),
    ).toBe("manually_linked_to_entry");
  });
});

describe("needsReview / CLEAN_EVIDENCE_SOURCES", () => {
  it("only stale_needs_review needs review", () => {
    expect(needsReview("stale_needs_review")).toBe(true);
    for (const s of ["recognized_from_text", "confirmed_by_person", "manually_linked_to_entry"] as const) {
      expect(needsReview(s)).toBe(false);
      expect(CLEAN_EVIDENCE_SOURCES.has(s)).toBe(true);
    }
  });
  it("stale is NOT clean current evidence", () => {
    expect(CLEAN_EVIDENCE_SOURCES.has("stale_needs_review")).toBe(false);
  });
});

describe("buildEntrySkillSources — wiring real signals", () => {
  // Scenario mirrors the owner's case: a dog-walking entry with an old
  // construction chip still linked. "statyba" is recognizable but not in the
  // entry's recognized slugs → flagged for review; "pet-care" is recognized.
  const idToSlug = new Map([
    ["id-statyba", "statyba"],
    ["id-pet", "pet-care"],
    ["id-niche", "obscure-skill"],
    ["id-verified", "vadyba"],
  ]);
  const recognizableSlugs = new Set(["statyba", "pet-care", "vadyba"]);
  const recognizedSlugs = new Set(["pet-care"]); // only pet care grounded in text
  const verifiedSkillIds = new Set(["id-verified"]);

  const sources = buildEntrySkillSources({
    linkedSkillIds: ["id-statyba", "id-pet", "id-niche", "id-verified"],
    idToSlug,
    verifiedSkillIds,
    recognizedSlugs,
    recognizableSlugs,
  });

  it("stale construction chip is flagged for review, not clean evidence", () => {
    expect(sources["id-statyba"]).toBe("stale_needs_review");
  });
  it("text-grounded skill is recognized_from_text", () => {
    expect(sources["id-pet"]).toBe("recognized_from_text");
  });
  it("skill outside the recognizer vocabulary stays an honest manual link", () => {
    expect(sources["id-niche"]).toBe("manually_linked_to_entry");
  });
  it("verified skill is confirmed_by_person", () => {
    expect(sources["id-verified"]).toBe("confirmed_by_person");
  });
});
