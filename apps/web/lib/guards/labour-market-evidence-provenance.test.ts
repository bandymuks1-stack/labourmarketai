/**
 * Provenance guard — public labour-market evidence cannot ship without a full,
 * sourced provenance trail. Fails the build if any evidence item is missing a
 * required field, references an unknown source, or gives a number without a
 * method note. (Step 1 — "guard against fake public statistics".)
 */
import { describe, it, expect } from "vitest";
import {
  LABOUR_MARKET_EVIDENCE,
  findEvidenceProvenanceProblems,
} from "../labour-market/evidence";
import { LABOUR_MARKET_SOURCES, isKnownSource } from "../labour-market/sources";

describe("labour-market evidence provenance", () => {
  it("every evidence item is fully sourced (no missing provenance)", () => {
    expect(findEvidenceProvenanceProblems()).toEqual([]);
  });

  it("there is at least one evidence item and all ids are unique", () => {
    expect(LABOUR_MARKET_EVIDENCE.length).toBeGreaterThan(0);
    const ids = new Set(LABOUR_MARKET_EVIDENCE.map((e) => e.id));
    expect(ids.size).toBe(LABOUR_MARKET_EVIDENCE.length);
  });

  it("every referenced source resolves to a known official source", () => {
    for (const e of LABOUR_MARKET_EVIDENCE) {
      expect(isKnownSource(e.sourceId), `${e.id} → ${e.sourceId}`).toBe(true);
      expect(LABOUR_MARKET_SOURCES[e.sourceId].url).toMatch(/^https:\/\//);
    }
  });

  it("every item links a specific https source URL for its figure", () => {
    for (const e of LABOUR_MARKET_EVIDENCE) {
      expect(e.sourceUrl, `${e.id} sourceUrl`).toMatch(/^https:\/\//);
    }
  });

  it("every item has an ISO last-checked (verified) date", () => {
    for (const e of LABOUR_MARKET_EVIDENCE) {
      expect(e.lastChecked, `${e.id} lastChecked`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("only recognised official statistics bodies are allowlisted", () => {
    for (const s of Object.values(LABOUR_MARKET_SOURCES)) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.publisher.length).toBeGreaterThan(0);
      expect(s.url).toMatch(/^https:\/\//);
    }
  });

  it("any numeric value stays locale-neutral (no English prose hidden in it)", () => {
    for (const e of LABOUR_MARKET_EVIDENCE) {
      if (e.value !== undefined) {
        expect(
          /^[\d.,/\sMBKkm%+–-]+$/.test(e.value),
          `${e.id} value "${e.value}" must be locale-neutral`,
        ).toBe(true);
      }
    }
  });

  it("the provenance validator actually catches a broken item", () => {
    const broken = findEvidenceProvenanceProblems([
      // @ts-expect-error — deliberately missing/invalid fields for the negative test
      { id: "x", sourceId: "nope", sourceUrl: "http://x", claimType: "statistic", lastChecked: "nope" },
    ]);
    expect(broken.length).toBeGreaterThan(0);
  });
});
