/**
 * Plan catalogue V2 — owner price exactness + shape guard (Sprint v2 §9).
 * A price change here is a COMMERCIAL change: this test fails until it is
 * deliberately updated together with the owner.
 */
import { describe, it, expect } from "vitest";

import {
  PAYMENTS_ENABLED,
  PLAN_CATALOGUE_V2,
  PLAN_V2_SLUGS,
  LEGACY_PLAN_ALIASES,
  getPlanV2,
  resolvePlanV2Slug,
  plansV2For,
  formatEurMonthlyCents,
} from "./plans";
import { evaluateCheckoutRequest, isPaidPlanKey } from "./checkout-core";

describe("catalogue v2 — owner prices are exact (cents, EUR)", () => {
  const EXPECTED: Record<string, number> = {
    free_person: 0,
    ai_plus: 999, // 9.99 €
    vip_media: 2499, // 24.99 €
    free_company: 0,
    launch_offer_99: 9900, // 99 €
    agency_start: 9999, // 99.99 €
    agency_growth: 24999, // 249.99 €
    agency_scale: 49999, // 499.99 €
  };

  it("every slug exists exactly once with the pinned price", () => {
    expect(PLAN_CATALOGUE_V2.map((p) => p.slug).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
    for (const plan of PLAN_CATALOGUE_V2) {
      expect(plan.priceMonthlyCents, plan.slug).toBe(EXPECTED[plan.slug]);
      expect(plan.currency, plan.slug).toBe("EUR");
    }
  });

  it("PLAN_V2_SLUGS registry matches the catalogue", () => {
    expect([...PLAN_V2_SLUGS].sort()).toEqual(
      PLAN_CATALOGUE_V2.map((p) => p.slug).sort(),
    );
  });

  it("formats prices the way the pricing page shows them", () => {
    expect(formatEurMonthlyCents(999)).toBe("9,99 €");
    expect(formatEurMonthlyCents(2499)).toBe("24,99 €");
    expect(formatEurMonthlyCents(9900)).toBe("99 €");
    expect(formatEurMonthlyCents(9999)).toBe("99,99 €");
    expect(formatEurMonthlyCents(24999)).toBe("249,99 €");
    expect(formatEurMonthlyCents(49999)).toBe("499,99 €");
  });
});

describe("catalogue v2 — kill-switch + honest access states", () => {
  it("PAYMENTS_ENABLED stays false (the V2 catalogue changes nothing)", () => {
    expect(PAYMENTS_ENABLED).toBe(false);
  });

  it("free plans are free; every priced plan is payment_not_enabled", () => {
    for (const plan of PLAN_CATALOGUE_V2) {
      if (plan.priceMonthlyCents === 0) {
        expect(plan.accessState, plan.slug).toBe("free");
        expect(plan.cta, plan.slug).toBe("use");
      } else {
        expect(plan.accessState, plan.slug).toBe("payment_not_enabled");
        expect(plan.cta, plan.slug).toBe("request_pilot_access");
      }
    }
  });

  it("audiences split into the three public columns", () => {
    expect(plansV2For("person").map((p) => p.slug)).toEqual([
      "free_person",
      "ai_plus",
      "vip_media",
    ]);
    expect(plansV2For("company").map((p) => p.slug)).toEqual([
      "free_company",
      "launch_offer_99",
    ]);
    expect(plansV2For("agency").map((p) => p.slug)).toEqual([
      "agency_start",
      "agency_growth",
      "agency_scale",
    ]);
  });
});

describe("catalogue v2 — owner ad rule in entitlements", () => {
  it("the Launch Offer is the ONLY unlimited-ads company plan", () => {
    const companies = plansV2For("company");
    const unlimited = companies.filter(
      (p) => p.entitlements.activeAdLimit === "unlimited",
    );
    expect(unlimited.map((p) => p.slug)).toEqual(["launch_offer_99"]);
  });

  it("launch_offer_99 carries internal promotion + is flagged launchOffer", () => {
    const lo = getPlanV2("launch_offer_99")!;
    expect(lo.entitlements.internalPromotion).toBe(true);
    expect(lo.launchOffer).toBe(true);
    // no other plan is the launch offer
    expect(
      PLAN_CATALOGUE_V2.filter((p) => p.launchOffer).map((p) => p.slug),
    ).toEqual(["launch_offer_99"]);
  });

  it("free company gets a small finite allowance (1 active ad)", () => {
    expect(getPlanV2("free_company")!.entitlements.activeAdLimit).toBe(1);
  });

  it("person plans sell no job ads", () => {
    for (const p of plansV2For("person")) {
      expect(p.entitlements.activeAdLimit, p.slug).toBe(0);
    }
  });
});

describe("catalogue v2 — legacy aliases keep old plan keys working", () => {
  it("every alias resolves to a real V2 plan", () => {
    expect(LEGACY_PLAN_ALIASES).toEqual({
      free_worker: "free_person",
      worker_plus: "ai_plus",
      company_pilot: "launch_offer_99",
      agency_pilot: "agency_start",
    });
    for (const [legacy, v2] of Object.entries(LEGACY_PLAN_ALIASES)) {
      expect(resolvePlanV2Slug(legacy), legacy).toBe(v2);
      expect(getPlanV2(legacy)?.slug, legacy).toBe(v2);
    }
  });

  it("V2 slugs resolve to themselves; unknown keys resolve to null", () => {
    expect(resolvePlanV2Slug("ai_plus")).toBe("ai_plus");
    expect(resolvePlanV2Slug("admin_internal")).toBeNull();
    expect(getPlanV2("nonsense")).toBeNull();
  });
});

describe("catalogue v2 — checkout gate accepts paid V2 plans (test mode only)", () => {
  const testConfig = { state: "stripe_test", reason: "ok" } as const;

  it("isPaidPlanKey covers legacy AND V2 paid tiers, never free ones", () => {
    for (const key of [
      "worker_plus",
      "company_pilot",
      "agency_pilot",
      "ai_plus",
      "vip_media",
      "launch_offer_99",
      "agency_start",
      "agency_growth",
      "agency_scale",
    ]) {
      expect(isPaidPlanKey(key), key).toBe(true);
    }
    for (const key of ["free_worker", "free_person", "free_company", "admin_internal", "nope"]) {
      expect(isPaidPlanKey(key), key).toBe(false);
    }
  });

  it("a worker can start a TEST checkout for ai_plus (person→worker role map)", () => {
    const r = evaluateCheckoutRequest({
      config: testConfig,
      authenticated: true,
      planKey: "ai_plus",
      userRoles: ["worker"],
      isAdmin: false,
      priceConfigured: true,
    });
    expect(r).toEqual({ ok: true, planKey: "ai_plus", audience: "worker" });
  });

  it("a company can start a TEST checkout for launch_offer_99", () => {
    const r = evaluateCheckoutRequest({
      config: testConfig,
      authenticated: true,
      planKey: "launch_offer_99",
      userRoles: ["company"],
      isAdmin: false,
      priceConfigured: true,
    });
    expect(r).toEqual({
      ok: true,
      planKey: "launch_offer_99",
      audience: "company",
    });
  });

  it("free V2 plans are rejected as not_a_paid_plan", () => {
    const r = evaluateCheckoutRequest({
      config: testConfig,
      authenticated: true,
      planKey: "free_company",
      userRoles: ["company"],
      isAdmin: false,
      priceConfigured: true,
    });
    expect(r).toEqual({ ok: false, status: 400, reason: "not_a_paid_plan" });
  });

  it("a worker is NOT eligible for an agency V2 plan", () => {
    const r = evaluateCheckoutRequest({
      config: testConfig,
      authenticated: true,
      planKey: "agency_growth",
      userRoles: ["worker"],
      isAdmin: false,
      priceConfigured: true,
    });
    expect(r).toEqual({ ok: false, status: 403, reason: "not_eligible" });
  });

  it("live-blocked config still refuses V2 checkout", () => {
    const r = evaluateCheckoutRequest({
      config: { state: "stripe_live_blocked", reason: "live_blocked" },
      authenticated: true,
      planKey: "ai_plus",
      userRoles: ["worker"],
      isAdmin: false,
      priceConfigured: true,
    });
    expect(r).toEqual({ ok: false, status: 403, reason: "live_blocked" });
  });
});
