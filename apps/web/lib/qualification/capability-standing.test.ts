import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAPABILITY_STANDINGS,
  assessCapability,
  isRealWorkStanding,
  type CapabilityEvidence,
} from "@/lib/qualification/capability-standing";
import { deriveWorkerProjectAsks } from "@/lib/projects/worker-project-asks";

/**
 * FIVE YEARS OF REAL WORK IS NOT "CERTIFICATE MISSING".
 * (Owner correction 2026-09-07 — "REAL EXPERIENCE MUST HAVE ECONOMIC VALUE".)
 *
 * ── THE CONTRADICTION ──────────────────────────────────────────────────────
 * `READINESS_ITEM_DOCUMENT_TYPES.qualification_or_skill_evidence` maps to two
 * document slugs and nothing else, so the product's entire answer to "does
 * this person have qualification or SKILL EVIDENCE?" was certificate present
 * or certificate missing. A person with years of independently confirmed work
 * read identically to a person with nothing — and the row's own name already
 * promised to accept skill evidence.
 *
 * ── THE TWO FAILURE DIRECTIONS, BOTH TESTED ────────────────────────────────
 * Being too STINGY is the defect above: real work rendering as nothing.
 * Being too GENEROUS is worse: implying that recorded work satisfies a legal
 * certificate requirement would put someone on a site they may not lawfully
 * be on. Every case below pins which side of that line it falls on.
 */

const NOTHING: CapabilityEvidence = {
  independentlyConfirmedEntries: 0,
  recordedEntries: 0,
  verifiedSkills: 0,
  hasValidCredential: false,
  hasExpiringCredential: false,
  hasRecognizedEquivalence: false,
};

describe("a required certificate stays required — always", () => {
  it("independently confirmed work does NOT satisfy a formal requirement", () => {
    const a = assessCapability({ ...NOTHING, independentlyConfirmedEntries: 400 });
    expect(a.standing).toBe("demonstrated_capability");
    // The load-bearing assertion of this whole model.
    expect(a.formalRequirementMet).toBe(false);
  });

  it("no amount of verified skill satisfies it either", () => {
    const a = assessCapability({ ...NOTHING, verifiedSkills: 50 });
    expect(a.formalRequirementMet).toBe(false);
  });

  it("ONLY a credential or an assessed equivalence ever satisfies it", () => {
    const met = CAPABILITY_STANDINGS.filter((s) => {
      const a =
        s === "valid_credential"
          ? assessCapability({ ...NOTHING, hasValidCredential: true })
          : s === "recognized_equivalence"
            ? assessCapability({ ...NOTHING, hasRecognizedEquivalence: true })
            : s === "demonstrated_capability"
              ? assessCapability({ ...NOTHING, independentlyConfirmedEntries: 5 })
              : s === "self_reported_capability"
                ? assessCapability({ ...NOTHING, recordedEntries: 5 })
                : s === "unknown"
                  ? assessCapability({
                      independentlyConfirmedEntries: null,
                      recordedEntries: null,
                      verifiedSkills: null,
                      hasValidCredential: false,
                      hasExpiringCredential: false,
                      hasRecognizedEquivalence: false,
                    })
                  : assessCapability(NOTHING);
      return a.formalRequirementMet;
    });
    expect(met.sort()).toEqual(["recognized_equivalence", "valid_credential"]);
  });
});

describe("real work stops being invisible", () => {
  it("confirmed work is DEMONSTRATED and opens the recognition route", () => {
    const a = assessCapability({ ...NOTHING, independentlyConfirmedEntries: 120 });
    expect(a.standing).toBe("demonstrated_capability");
    expect(a.route).toBe("prior_learning_review");
    // The flag a surface reads to show the work beside the gap.
    expect(a.hasUncountedRealWork).toBe(true);
  });

  it("unconfirmed work is SELF-REPORTED — real, weaker, and given its own step", () => {
    const a = assessCapability({ ...NOTHING, recordedEntries: 90 });
    expect(a.standing).toBe("self_reported_capability");
    // Confirmation first, not a course. Sending someone on training for work
    // they have already done is exactly the insult this model prevents.
    expect(a.route).toBe("seek_confirmation");
    expect(a.hasUncountedRealWork).toBe(true);
  });

  it("nothing recorded is NO EVIDENCE, and training IS the honest route there", () => {
    const a = assessCapability(NOTHING);
    expect(a.standing).toBe("no_evidence");
    expect(a.route).toBe("training");
    expect(a.hasUncountedRealWork).toBe(false);
  });

  it("only the two real-work standings count as real work", () => {
    expect(CAPABILITY_STANDINGS.filter(isRealWorkStanding).sort()).toEqual([
      "demonstrated_capability",
      "self_reported_capability",
    ]);
  });
});

describe("unknown is never rendered as nothing", () => {
  it("a read that did not answer is UNKNOWN, not no_evidence", () => {
    const a = assessCapability({
      independentlyConfirmedEntries: null,
      recordedEntries: null,
      verifiedSkills: null,
      hasValidCredential: false,
      hasExpiringCredential: false,
      hasRecognizedEquivalence: false,
    });
    expect(a.standing).toBe("unknown");
    // And it claims no real work it cannot see.
    expect(a.hasUncountedRealWork).toBe(false);
  });
});

describe("credentials answer first, and an expiry is still a deadline", () => {
  it("a valid credential wins over everything", () => {
    const a = assessCapability({
      ...NOTHING,
      hasValidCredential: true,
      independentlyConfirmedEntries: 5,
    });
    expect(a.standing).toBe("valid_credential");
    expect(a.route).toBe("none");
  });

  it("an expiring credential is valid TODAY and still says renew", () => {
    const a = assessCapability({ ...NOTHING, hasExpiringCredential: true, recordedEntries: 3 });
    expect(a.formalRequirementMet).toBe(true);
    expect(a.route).toBe("renew_credential");
  });

  it("a recognized equivalence IS a formal answer — that is what RPL is", () => {
    const a = assessCapability({ ...NOTHING, hasRecognizedEquivalence: true });
    expect(a.formalRequirementMet).toBe(true);
    expect(a.route).toBe("none");
  });
});

describe("where no paper is demanded, the model invents no gap", () => {
  it("demonstrated capability is a complete answer, with no route", () => {
    const a = assessCapability(
      { ...NOTHING, independentlyConfirmedEntries: 10 },
      { formalRequirementRequired: false },
    );
    expect(a.standing).toBe("demonstrated_capability");
    expect(a.route).toBe("none");
    expect(a.hasUncountedRealWork).toBe(false);
  });
});

describe("the model is CONNECTED — it does not ship unused", () => {
  const ITEM = {
    projectId: "p1",
    itemKey: "qualification_or_skill_evidence",
    label: "Qualification or skill evidence",
    status: "needed" as const,
  };

  it("the capability row carries an assessment when evidence is supplied", () => {
    const out = deriveWorkerProjectAsks([ITEM], [], new Date("2026-09-07T00:00:00Z"), {
      ...NOTHING,
      independentlyConfirmedEntries: 40,
    });
    const ask = out.get("p1")?.[0];
    expect(ask?.capability?.standing).toBe("demonstrated_capability");
    // `own` is UNTOUCHED — the formal answer and the real-work answer are two
    // facts side by side, and the certificate is still not recorded.
    expect(ask?.own).toBe("none");
    expect(ask?.capability?.formalRequirementMet).toBe(false);
  });

  it("a caller that supplies no evidence gets EXACTLY the old behaviour", () => {
    const out = deriveWorkerProjectAsks([ITEM], [], new Date("2026-09-07T00:00:00Z"));
    const ask = out.get("p1")?.[0];
    expect(ask?.capability).toBeNull();
    expect(ask?.own).toBe("none");
  });

  it("rows that are not capability rows never gain an assessment", () => {
    const out = deriveWorkerProjectAsks(
      [{ ...ITEM, itemKey: "identity_document" }],
      [],
      new Date("2026-09-07T00:00:00Z"),
      { ...NOTHING, independentlyConfirmedEntries: 40 },
    );
    expect(out.get("p1")?.[0]?.capability).toBeNull();
  });

  it("the surface renders the work AND the requirement together, never alone", () => {
    const src = readFileSync(
      join(__dirname, "..", "..", "components/app/instruction-project-asks.tsx"),
      "utf8",
    );
    expect(src).toContain("hasUncountedRealWork");
    // Both sentences, in one branch — showing capability without the standing
    // requirement would tell someone they are deployable when they are not.
    expect(src).toContain("capabilityStillRequired");
    expect(src).toContain("data-formal-met");
  });

  it("the evidence read excludes self-confirmations from 'confirmed by someone else'", () => {
    const src = readFileSync(
      join(__dirname, "capability-evidence.ts"),
      "utf8",
    );
    expect(src).toContain("confirmer === subjectProfileId");
    // A row whose confirmer is unknown is NOT counted as independent — the
    // safe direction for a claim about somebody's capability.
    expect(src).toContain("if (!confirmer || confirmer === subjectProfileId) continue;");
  });
});
