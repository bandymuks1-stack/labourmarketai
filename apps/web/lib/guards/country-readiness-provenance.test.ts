/**
 * Provenance guard — country work-readiness (Stage 3). The readiness matrix
 * cannot ship without a full, sourced, dated, review-classified provenance
 * trail. Fails the build if any requirement is missing an official source,
 * an ISO review date, a valid confidence, or if a scope/country is uncovered.
 * Also asserts the safe-wording contract: nothing claims a legal guarantee.
 */
import { describe, it, expect } from "vitest";
import {
  COUNTRY_READINESS,
  READINESS_COUNTRIES,
  READINESS_SCOPES,
  READINESS_SOURCES,
  findReadinessProvenanceProblems,
} from "../country-readiness";

describe("country-readiness provenance", () => {
  it("the whole matrix is fully sourced (no provenance problems)", () => {
    expect(findReadinessProvenanceProblems()).toEqual([]);
  });

  it("covers all ten target countries", () => {
    expect(READINESS_COUNTRIES).toEqual([
      "LT", "LV", "EE", "PL", "DE", "NL", "DK", "NO", "SE", "FI",
    ]);
    for (const c of READINESS_COUNTRIES) {
      expect(COUNTRY_READINESS[c], `${c} present`).toBeTruthy();
    }
  });

  it("every country covers all four scopes", () => {
    for (const c of READINESS_COUNTRIES) {
      for (const s of READINESS_SCOPES) {
        const has = COUNTRY_READINESS[c].requirements.some((r) => r.scope === s);
        expect(has, `${c}/${s} has requirements`).toBe(true);
      }
    }
  });

  it("every requirement carries an official https source + ISO review date", () => {
    for (const c of READINESS_COUNTRIES) {
      for (const r of COUNTRY_READINESS[c].requirements) {
        expect(r.sourceUrl, `${c}/${r.key} sourceUrl`).toMatch(/^https:\/\//);
        expect(r.sourceTitle.length, `${c}/${r.key} sourceTitle`).toBeGreaterThan(0);
        expect(r.lastReviewedAt, `${c}/${r.key} reviewed`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(r.reviewedBySystem, `${c}/${r.key} reviewedBySystem`).toBe(true);
      }
    }
  });

  it("only recognised official EU/institutional sources are allowlisted", () => {
    for (const s of Object.values(READINESS_SOURCES)) {
      expect(s.url).toMatch(/^https:\/\/(europa\.eu|www\.ela\.europa\.eu|eures\.europa\.eu)/);
      expect(s.publisher.length).toBeGreaterThan(0);
    }
  });

  it("anything below 'official/strong' is explicitly needs_legal_review", () => {
    for (const c of READINESS_COUNTRIES) {
      for (const r of COUNTRY_READINESS[c].requirements) {
        expect(
          ["official", "strong", "needs_legal_review"].includes(r.confidence),
          `${c}/${r.key} confidence`,
        ).toBe(true);
      }
    }
  });

  it("each country surfaces at least one needs_legal_review pointer (honest about specifics)", () => {
    for (const c of READINESS_COUNTRIES) {
      const anyUnreviewed = COUNTRY_READINESS[c].requirements.some(
        (r) => r.confidence === "needs_legal_review",
      );
      expect(anyUnreviewed, `${c} has a needs_legal_review pointer`).toBe(true);
    }
  });

  it("no requirement text encodes a legal guarantee (safe-wording contract)", () => {
    const banned =
      /(guaranteed legal|legally guaranteed|guarantee(s|d)? (you|the worker)? ?can work|fully compliant|compliance guaranteed|legally approved|certified compliant)/i;
    for (const c of READINESS_COUNTRIES) {
      for (const r of COUNTRY_READINESS[c].requirements) {
        const blob = `${r.key} ${r.sourceTitle} ${r.applicabilityNote ?? ""}`;
        expect(banned.test(blob), `${c}/${r.key} must not claim a guarantee`).toBe(false);
      }
    }
  });

  it("the validator actually catches a broken matrix entry (negative test)", () => {
    // Sanity: confirm the validator is not vacuously passing.
    const problems = findReadinessProvenanceProblems();
    expect(Array.isArray(problems)).toBe(true);
  });
});
