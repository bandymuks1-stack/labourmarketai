import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readRequirementEvidence } from "@/lib/recognition/requirement-evidence";
import type { ReadinessRequirement } from "@/lib/country-readiness/types";

/**
 * A1 guard — a derived reading must never be renderable as an authority act.
 *
 * The risk is not that the comparison is wrong. It is that "evidenced against
 * a legal requirement" is one careless copy change away from "qualified", and
 * a platform that says the second about someone it never assessed has made a
 * claim with legal consequences for a real person. Formal recognition needs an
 * independent authorized assessor; this module has none and must not read as
 * though it does.
 */
const APP = join(__dirname, "..", "..");
const SRC = readFileSync(join(APP, "lib/recognition/requirement-evidence.ts"), "utf8");
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

describe("1. the output vocabulary cannot express an authority act", () => {
  it("the state union is evidential and has exactly three members", () => {
    expect(code).toMatch(
      /RequirementEvidenceState = "evidenced" \| "not_evidenced" \| "unknown"/,
    );
  });

  it("no authority word appears in the CODE at all", () => {
    // Prose may discuss these to explain the boundary; the executable part
    // must not be able to produce one.
    for (const word of [
      "qualified",
      "certified",
      "recognised",
      "recognized",
      "accredited",
      "approved",
      "compliant",
    ]) {
      expect(code.toLowerCase(), `"${word}" must not appear in code`).not.toContain(word);
    }
  });

  it("the all-evidenced flag is named for a reading, not a status", () => {
    expect(code).toMatch(/allRequirementsEvidenced/);
    expect(code).not.toMatch(/isReady|isQualified|isCompliant|readyToWork/);
  });
});

describe("2. no score, no rank, no ordering", () => {
  it("nothing numeric is derived beyond plain counts", () => {
    expect(code).not.toMatch(/percent|Percent|score|Score|rating|Rating|rank|Rank/);
    expect(code).not.toMatch(/\.sort\(|Math\.(round|max|min)\(/);
  });

  it("counts exist but no ratio is computed from them", () => {
    expect(code).toMatch(/evidencedCount/);
    expect(code).not.toMatch(/\/\s*rows\.length|\*\s*100/);
  });
});

describe("3. provenance cannot be dropped", () => {
  it("cited evidence carries provenance in the type", () => {
    expect(code).toMatch(/readonly provenance: EvidenceProvenance/);
    expect(code).toMatch(/readonly citedEvidence: readonly HeldEvidence\[\]/);
  });

  it("behaviourally: a self-declaration is never laundered into something stronger", () => {
    const requirement: ReadinessRequirement = {
      key: "a1",
      documentTypeSlug: "a1_certificate",
      scope: "worker_posted",
      level: "required",
      confidence: "official",
      riskLevel: "high",
      sourceId: "eu_posting_ela",
      sourceUrl: "https://example.europa.eu/posting",
      sourceTitle: "Posting of Workers",
      lastReviewedAt: "2026-09-01",
      reviewedBySystem: true,
      explanationKey: "a1.explanation",
    };
    const r = readRequirementEvidence({
      requirements: [requirement],
      held: [{ slug: "a1_certificate", provenance: "self_declared", sourceId: "x" }],
    });
    expect(r.rows[0].citedEvidence[0].provenance).toBe("self_declared");
  });
});

describe("4. UNKNOWN never collapses into the person's failing", () => {
  it("an unread source cannot produce not_evidenced", () => {
    expect(code).toMatch(/if \(unreadable\.length > 0\)/);
  });

  it("a non-checkable requirement is answered before evidence is consulted", () => {
    const notCheckable = code.indexOf('req.documentTypeSlug === null');
    const evidenceFilter = code.indexOf('input.held.filter');
    expect(notCheckable).toBeGreaterThan(-1);
    expect(evidenceFilter).toBeGreaterThan(-1);
    expect(notCheckable).toBeLessThan(evidenceFilter);
  });
});

describe("5. the module claims no ESCO capability it does not have", () => {
  it("no dead ESCO branch pretends semantic matching happens", () => {
    // `ReadinessRequirement` carries no ESCO concept, so there is nothing to
    // match on. The honest state is to not have the code at all.
    expect(code).not.toMatch(/escoUri|esco_uri/);
  });
});
