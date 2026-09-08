import { describe, it, expect } from "vitest";
import {
  PRE_PAYMENT_PLANS,
  PAYMENTS_ENABLED,
  getPlan,
} from "./plans";
import {
  gateFeature,
  gateFeatureBySlug,
  isPaymentEnabled,
  limitFor,
  planIncludes,
} from "./entitlements";

describe("pre-payment plan boundary", () => {
  it("payments are NOT enabled this sprint", () => {
    expect(PAYMENTS_ENABLED).toBe(false);
    expect(isPaymentEnabled()).toBe(false);
  });

  it("plan slugs are unique and cover the launch registry (owner pricing 2026-09-05)", () => {
    const slugs = PRE_PAYMENT_PLANS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toEqual([
      "free_worker",
      "worker_plus",
      "free_organization",
      "company_pilot",
      "agency_pilot",
      "admin_internal",
    ]);
  });

  it("no paid tier claims free access; only the sellable launch plan keeps the pilot CTA, deferred plans point to contact", () => {
    for (const p of PRE_PAYMENT_PLANS) {
      if (p.slug === "free_worker" || p.slug === "free_organization" || p.slug === "admin_internal") continue;
      expect(p.accessState, `${p.slug}`).toBe("payment_not_enabled");
      expect(p.cta).toBe(p.launch === "sellable" ? "request_pilot_access" : "contact");
    }
  });

  it("free worker can use a free feature (ok gate)", () => {
    const plan = getPlan("free_worker")!;
    const g = gateFeature(plan, "worker_journal");
    expect(g.allowed).toBe(true);
    expect(g.reason).toBe("ok");
  });

  it("free worker readiness is limited to one country", () => {
    const plan = getPlan("free_worker")!;
    expect(limitFor(plan, "readiness_checklist_countries")).toBe(1);
    expect(gateFeature(plan, "readiness_checklist_countries", 0).allowed).toBe(true);
    expect(gateFeature(plan, "readiness_checklist_countries", 1).reason).toBe("over_limit");
  });

  it("a paid feature on a payment_not_enabled tier resolves to payment_not_enabled", () => {
    const g = gateFeatureBySlug("company_pilot", "booking_requests");
    expect(g.allowed).toBe(false);
    expect(g.reason).toBe("payment_not_enabled");
    expect(g.cta).toBe("request_pilot_access");
  });

  it("a feature not in a plan resolves to not_in_plan", () => {
    const plan = getPlan("free_worker")!;
    expect(gateFeature(plan, "booking_requests").reason).toBe("not_in_plan");
  });

  it("unknown plan slug → not_in_plan + contact cta", () => {
    const g = gateFeatureBySlug("nope", "communication");
    expect(g.reason).toBe("not_in_plan");
    expect(g.cta).toBe("contact");
  });

  it("priority_visibility is never claimed active (false in worker_plus)", () => {
    const plan = getPlan("worker_plus")!;
    expect(planIncludes(plan, "priority_visibility")).toBe(false);
  });

  it("admin internal plan includes verification + country-rule management", () => {
    const plan = getPlan("admin_internal")!;
    expect(planIncludes(plan, "verify_documents")).toBe(true);
    expect(planIncludes(plan, "manage_country_rules")).toBe(true);
  });
});
