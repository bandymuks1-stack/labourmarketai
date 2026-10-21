import { describe, expect, it } from "vitest";

import {
  findSellableTopupPackage,
  isSellableTopupPackage,
  OWNER_APPROVED_LMC_TOPUP_PACKAGES,
  type LmcTopupPackage,
} from "@/lib/lmc/topup-packages";

// Arbitrary TEST figures — not an offer, not a denomination proposal.
const ok: LmcTopupPackage = {
  key: "t_pack",
  creditCents: 300,
  chargeMinor: 300,
  currency: "eur",
  approval: { state: "owner_approved", decisionRef: "TEST-ONLY", approvedOnIso: "2026-10-21" },
};

describe("top-up packages (MDD-03 open)", () => {
  it("the production list is empty — nothing is sellable", () => {
    expect(OWNER_APPROVED_LMC_TOPUP_PACKAGES).toEqual([]);
    expect(findSellableTopupPackage("t_pack")).toBeNull();
  });

  it("an owner-approved, well-formed package resolves from an injected list", () => {
    expect(findSellableTopupPackage("t_pack", [ok])).toBe(ok);
  });

  it("unapproved, malformed, blank-decision and duplicated packages never resolve", () => {
    const bad: LmcTopupPackage[] = [
      { ...ok, key: "u", approval: { state: "owner_unapproved" } },
      { ...ok, key: "zero_credit", creditCents: 0 },
      { ...ok, key: "frac", chargeMinor: 1.5 },
      { ...ok, key: "huge", creditCents: 100_000_001 },
      { ...ok, key: "blank_ref", approval: { state: "owner_approved", decisionRef: " ", approvedOnIso: "2026-10-21" } },
    ];
    for (const p of bad) {
      expect(isSellableTopupPackage(p), p.key).toBe(false);
      expect(findSellableTopupPackage(p.key, bad)).toBeNull();
    }
    expect(findSellableTopupPackage("t_pack", [ok, { ...ok }])).toBeNull();
    for (const k of [undefined, 7, "", "UPPER", "a".repeat(41)]) {
      expect(findSellableTopupPackage(k, [ok])).toBeNull();
    }
  });
});
