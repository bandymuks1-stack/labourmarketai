import { describe, expect, it } from "vitest";

import { evidenceVariant } from "@/components/app/work-world/primitives";
import {
  WORK_VERIFICATION_STATES,
  type WorkVerificationState,
} from "@/lib/journal/work-verification-state";
import {
  evidenceStandingOfVerification,
  spineNodeSolid,
} from "@/lib/journal/work-verification-standing";

describe("journal verification state → evidence standing (work-world bridge)", () => {
  it("covers every canonical verification state", () => {
    for (const s of WORK_VERIFICATION_STATES) {
      expect(evidenceStandingOfVerification(s)).toBeTruthy();
    }
  });

  it("a manager confirmation is organization attestation — never the green verification colour", () => {
    expect(evidenceStandingOfVerification("verified")).toBe("ORGANIZATION_ATTESTED");
    expect(evidenceVariant(evidenceStandingOfVerification("verified"))).toBe("attested");
    for (const s of WORK_VERIFICATION_STATES) {
      expect(evidenceVariant(evidenceStandingOfVerification(s)), s).not.toBe("verified");
    }
  });

  it("a self-confirmation is cyan self-attestation, not a manager's word", () => {
    expect(evidenceStandingOfVerification("self_confirmed")).toBe("SELF_ATTESTED");
    expect(evidenceVariant("SELF_ATTESTED")).toBe("evidence");
  });

  it("every waiting / unreachable / organization-less state is the person's own record", () => {
    const own: WorkVerificationState[] = [
      "self_reported",
      "verifier_not_identified",
      "verifier_available",
      "verification_pending",
      "not_applicable",
    ];
    for (const s of own) expect(evidenceStandingOfVerification(s), s).toBe("SELF_REPORTED");
  });

  it("returned and disputed are contested, not withdrawn or unknown", () => {
    expect(evidenceVariant(evidenceStandingOfVerification("returned"))).toBe("contested");
    expect(evidenceVariant(evidenceStandingOfVerification("disputed"))).toBe("contested");
  });

  it("only a real decision row draws a solid node", () => {
    expect(spineNodeSolid("verified")).toBe(true);
    expect(spineNodeSolid("self_confirmed")).toBe(true);
    expect(spineNodeSolid("verification_pending")).toBe(false);
    expect(spineNodeSolid("self_reported")).toBe(false);
  });
});
