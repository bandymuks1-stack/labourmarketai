import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { evidenceVariant, type EvidenceStanding } from "@/components/app/work-world/primitives";

/**
 * Guard: the work-world primitives carry the accepted "Living Work World"
 * grammar into the real product AND enforce the one semantic rule —
 * EVIDENCE (cyan) ≠ VERIFICATION (green) — so no surface can paint a
 * self-attestation as verified.
 */
const root = resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(resolve(root, rel), "utf8");

describe("Guard: work-world primitives", () => {
  it("only INDEPENDENTLY_VERIFIED is the verification variant", () => {
    const cases: Array<[EvidenceStanding, string]> = [
      ["INDEPENDENTLY_VERIFIED", "verified"],
      ["SELF_ATTESTED", "evidence"],
      ["SELF_REPORTED", "evidence"],
      ["ORGANIZATION_ATTESTED", "attested"],
      ["THIRD_PARTY_ATTESTED", "attested"],
      ["ORGANIZATION_REPORTED", "reported"],
      ["DISPUTED", "contested"],
      ["CORRECTED", "contested"],
      ["WITHDRAWN", "unknown"],
      ["UNKNOWN", "unknown"],
    ];
    for (const [state, variant] of cases) {
      expect(evidenceVariant(state), state).toBe(variant);
    }
  });

  it("a self-attestation is NEVER the verified variant", () => {
    expect(evidenceVariant("SELF_ATTESTED")).not.toBe("verified");
    expect(evidenceVariant("SELF_REPORTED")).not.toBe("verified");
  });

  it("the primitives are token-only — no raw hex, cyan=evidence and trust-accent=verification", () => {
    const src = read("components/app/work-world/primitives.tsx");
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,6}\b/); // no raw hex colours
    // evidence maps to brand-cyan, verification to trust-accent, and the two
    // colour roles are never swapped.
    expect(src).toMatch(/evidence:\s*"text-brand-cyan/);
    expect(src).toMatch(/verified:\s*"text-trust-accent/);
  });

  it("the subject evidence surface consumes the canonical primitive", () => {
    const page = read("components/app/organization-evidence-section.tsx");
    expect(page).toContain('from "@/components/app/work-world/primitives"');
    expect(page).toContain("<EvidenceState");
  });
});
