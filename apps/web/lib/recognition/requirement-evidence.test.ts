import { describe, expect, it } from "vitest";
import {
  readRequirementEvidence,
  type HeldEvidence,
} from "@/lib/recognition/requirement-evidence";
import type { ReadinessRequirement } from "@/lib/country-readiness/types";

const req = (
  key: string,
  documentTypeSlug: string | null,
): ReadinessRequirement => ({
  key,
  documentTypeSlug,
  scope: "worker_posted",
  level: "required",
  confidence: "official",
  riskLevel: "high",
  sourceId: "eu_posting_ela",
  sourceUrl: "https://example.europa.eu/posting",
  sourceTitle: "Posting of Workers",
  lastReviewedAt: "2026-09-01",
  reviewedBySystem: true,
  explanationKey: `${key}.explanation`,
});

const held = (slug: string, provenance: HeldEvidence["provenance"]): HeldEvidence => ({
  slug,
  provenance,
  sourceId: `row-${slug}`,
});

describe("the three answers", () => {
  it("a held document evidences the requirement that names it", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate")],
      held: [held("a1_certificate", "held_document")],
    });
    expect(r.rows[0].state).toBe("evidenced");
    expect(r.allRequirementsEvidenced).toBe(true);
  });

  it("nothing held, everything read → not_evidenced", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate")],
      held: [],
    });
    expect(r.rows[0].state).toBe("not_evidenced");
    expect(r.rows[0].gaps).toHaveLength(0);
  });

  it("an unreadable source makes it UNKNOWN, never not_evidenced", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate")],
      held: [],
      unreadableSources: ["worker_documents"],
    });
    expect(r.rows[0].state).toBe("unknown");
    expect(r.notEvidencedCount).toBe(0);
  });
});

describe("a requirement nobody can check is not the person's failing", () => {
  it("no documentTypeSlug → unknown, with the reason naming the requirement", () => {
    const r = readRequirementEvidence({
      requirements: [req("notify", null)],
      held: [],
    });
    expect(r.rows[0].state).toBe("unknown");
    expect(r.rows[0].gaps[0]).toEqual({
      reason: "requirement_not_checkable",
      key: "notify",
    });
  });

  it("is asked BEFORE evidence, so it can never read as a miss", () => {
    const r = readRequirementEvidence({
      requirements: [req("notify", null)],
      held: [held("something_else", "held_document")],
      unreadableSources: ["worker_documents"],
    });
    expect(r.rows[0].state).toBe("unknown");
    expect(r.rows[0].state).not.toBe("not_evidenced");
  });
});

describe("provenance travels with the answer", () => {
  it("a self-declaration evidences AND says it is self-declared", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate")],
      held: [held("a1_certificate", "self_declared")],
    });
    expect(r.rows[0].state).toBe("evidenced");
    expect(r.rows[0].citedEvidence[0].provenance).toBe("self_declared");
  });

  it("every cited row is returned, not just a count", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate")],
      held: [
        held("a1_certificate", "self_declared"),
        { ...held("a1_certificate", "manager_confirmed"), sourceId: "row-2" },
      ],
    });
    expect(r.rows[0].citedEvidence).toHaveLength(2);
    expect(r.rows[0].citedEvidence.map((e) => e.provenance)).toEqual([
      "self_declared",
      "manager_confirmed",
    ]);
  });

  it("the requirement travels whole, with its source and review date", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate")],
      held: [],
    });
    expect(r.rows[0].requirement.sourceUrl).toBe("https://example.europa.eu/posting");
    expect(r.rows[0].requirement.lastReviewedAt).toBe("2026-09-01");
    expect(r.rows[0].requirement.confidence).toBe("official");
  });
});

describe("the summary cannot overstate", () => {
  it("one unknown denies the all-evidenced answer", () => {
    const r = readRequirementEvidence({
      requirements: [req("a1", "a1_certificate"), req("notify", null)],
      held: [held("a1_certificate", "held_document")],
    });
    expect(r.evidencedCount).toBe(1);
    expect(r.unknownCount).toBe(1);
    expect(r.allRequirementsEvidenced).toBe(false);
  });

  it("an empty requirement set is not 'all evidenced'", () => {
    const r = readRequirementEvidence({ requirements: [], held: [] });
    expect(r.allRequirementsEvidenced).toBe(false);
  });
});
