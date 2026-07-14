/**
 * Ad product registry + entitlement resolution guard (Sprint v2 §10).
 * Architecture-only: everything inactive, no prices until the owner sets them.
 */
import { describe, it, expect } from "vitest";

import {
  AD_PRODUCTS,
  AD_PRODUCT_SLUGS,
  getAdProduct,
  inactiveAdProducts,
  resolveActiveAdAllowance,
} from "./ad-products";
import { getPlanV2 } from "./plans";

describe("ad product registry (§10 slug registry)", () => {
  it("carries exactly the 8 owner-scoped slugs", () => {
    expect([...AD_PRODUCT_SLUGS].sort()).toEqual(
      [
        "single_ad",
        "ai_promoted_ad",
        "premium_promoted_ad",
        "international_ad",
        "package_5",
        "package_20",
        "agency_package",
        "extra_promotion",
      ].sort(),
    );
    expect(AD_PRODUCTS.map((p) => p.slug).sort()).toEqual(
      [...AD_PRODUCT_SLUGS].sort(),
    );
  });

  it("every product is INACTIVE with a NULL price (owner has not priced ads)", () => {
    for (const p of AD_PRODUCTS) {
      expect(p.active, p.slug).toBe(false);
      expect(p.priceCents, p.slug).toBeNull();
      expect(p.currency, p.slug).toBe("EUR");
    }
    expect(inactiveAdProducts().length).toBe(AD_PRODUCTS.length);
  });

  it("lookup works and unknown slugs return null", () => {
    expect(getAdProduct("package_5")?.entitlement.adCredits).toBe(5);
    expect(getAdProduct("package_20")?.entitlement.adCredits).toBe(20);
    expect(getAdProduct("extra_promotion")?.entitlement.adCredits).toBe(0);
    expect(getAdProduct("international_ad")?.entitlement.international).toBe(true);
    expect(getAdProduct("made_up")).toBeNull();
  });
});

describe("ad allowance resolution (plan limit + purchased credits)", () => {
  it("free company: 1 from plan, credits add on top", () => {
    const plan = getPlanV2("free_company")!;
    expect(resolveActiveAdAllowance(plan, 0)).toEqual({
      activeAdLimit: 1,
      fromPlan: 1,
      fromCredits: 0,
    });
    expect(resolveActiveAdAllowance(plan, 5).activeAdLimit).toBe(6);
  });

  it("launch offer: unlimited regardless of credits (the only company exception)", () => {
    const plan = getPlanV2("launch_offer_99")!;
    expect(resolveActiveAdAllowance(plan, 0).activeAdLimit).toBe("unlimited");
    expect(resolveActiveAdAllowance(plan, 100).activeAdLimit).toBe("unlimited");
  });

  it("agency tiers: finite START/GROWTH, unlimited SCALE", () => {
    expect(
      resolveActiveAdAllowance(getPlanV2("agency_start")!, 2).activeAdLimit,
    ).toBe(12);
    expect(
      resolveActiveAdAllowance(getPlanV2("agency_growth")!, 0).activeAdLimit,
    ).toBe(50);
    expect(
      resolveActiveAdAllowance(getPlanV2("agency_scale")!, 0).activeAdLimit,
    ).toBe("unlimited");
  });

  it("garbage credit inputs never inflate the allowance", () => {
    const plan = getPlanV2("free_company")!;
    expect(resolveActiveAdAllowance(plan, -3).activeAdLimit).toBe(1);
    expect(resolveActiveAdAllowance(plan, Number.NaN).activeAdLimit).toBe(1);
    expect(resolveActiveAdAllowance(plan, 2.9).activeAdLimit).toBe(3); // floor(2.9)=2 credits
  });
});
