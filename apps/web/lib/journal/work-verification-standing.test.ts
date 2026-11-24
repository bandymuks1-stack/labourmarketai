import { describe, expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EvidenceDot,
  EvidenceState,
  WorkSpineNode,
  evidenceVariant,
} from "@/components/app/work-world/primitives";

/** Green = the trust-accent token, present, and no gold family anywhere in
 *  the same markup (champagne, brand-blue = the gold brand, metallic). */
function isConfirmationGreen(html: string): boolean {
  return (
    /\btext-trust-accent\b/.test(html) &&
    /\bbg-trust-accent\b/.test(html) &&
    !/brand-champagne|brand-blue|metallic|\bgold\b/.test(html)
  );
}
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

  it("a manager confirmation is organization attestation — never INDEPENDENTLY_VERIFIED", () => {
    // The STANDING is unchanged by design rule #4: a manager belongs to the
    // organization the work was done for, so it is attestation, and no
    // journal state is the `verified` (independent) variant.
    expect(evidenceStandingOfVerification("verified")).toBe("ORGANIZATION_ATTESTED");
    expect(evidenceVariant(evidenceStandingOfVerification("verified"))).toBe("attested");
    for (const s of WORK_VERIFICATION_STATES) {
      expect(evidenceVariant(evidenceStandingOfVerification(s)), s).not.toBe("verified");
    }
  });

  it("…and it is drawn in the trust-accent GREEN, never gold (design rule #4, owner-ratified 2026-09-22)", () => {
    // Employer-confirmed = trust-accent green; gold never means confirmation.
    // Rendered, so the assertion is about the colour a person actually sees
    // on a confirmed entry — chip, diamond and spine node.
    const standing = evidenceStandingOfVerification("verified");
    const html = [
      renderToStaticMarkup(createElement(EvidenceState, { state: standing, label: "x" })),
      renderToStaticMarkup(createElement(EvidenceDot, { state: standing })),
      renderToStaticMarkup(
        createElement(
          WorkSpineNode,
          { state: standing, solid: spineNodeSolid("verified") } as ComponentProps<
            typeof WorkSpineNode
          >,
          "x",
        ),
      ),
    ].join("");
    expect(isConfirmationGreen(html)).toBe(true);

    // A self-confirmation stays cyan evidence — green is someone ELSE's word.
    const self = renderToStaticMarkup(
      createElement(EvidenceState, { state: evidenceStandingOfVerification("self_confirmed"), label: "x" }),
    );
    expect(self).not.toContain("trust-accent");
    expect(self).toContain("brand-cyan");

    // Control: the champagne rendering this replaced fails the check.
    expect(
      isConfirmationGreen(
        '<span class="text-brand-champagne border-brand-champagne/40"><span class="bg-brand-champagne"></span></span>',
      ),
    ).toBe(false);
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
