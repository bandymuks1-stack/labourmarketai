import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { entitlementAllows, highestOrganizationPlanKey, resolveEntitlements, type ResolveEntitlementsInput } from "./entitlements-v1";
import { decideOpenNeedsGate } from "./open-needs-gate";
import { limitFor } from "./entitlements";
import { FREE_ORGANIZATION_PLAN_KEY, ORGANIZATION_PLAN_KEY, PRE_PAYMENT_PLANS, getPlan } from "./plans";
import { effectivePilotPassStatus } from "./pilot-pass-core";
import { VIP_ORGANIZATIONS, VIP_PLAN_LABEL, isVipOrganization } from "./vip-organizations";

/**
 * PERMANENT VIP ORGANIZATIONS (owner decision 2026-11-15).
 *
 * The owner's organizations hold the highest organization plan, at €0, with no
 * end, no return to FREE, no card and no Stripe subscription — and keep it after
 * UAB „Nonstop Group"'s 1 € pilot pass ends on 2026-11-22. These tests pin the
 * resolver, the plan rule, and every surface that could ask a VIP for money.
 */

const NONSTOP = "20b2c802-c624-43c0-b368-8fa6c1fbeae3";
const LMAI_PL = "19f47e78-7bd1-4120-9937-603dba769f8a";
const OTHER = "00000000-0000-4000-8000-000000000001";

const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");

const base: ResolveEntitlementsInput = {
  billingActive: true,
  isAdmin: false,
  audience: "company",
  subscriptionPlanKey: null,
  subscriptionStatus: null,
  manualOverridePlanKey: null,
};

describe("the VIP list", () => {
  it("lists exactly the two organizations verified on production, by id", () => {
    expect(VIP_ORGANIZATIONS.map((o) => o.organizationId).sort()).toEqual([LMAI_PL, NONSTOP].sort());
    expect(isVipOrganization(NONSTOP)).toBe(true);
    expect(isVipOrganization(LMAI_PL.toUpperCase())).toBe(true);
  });

  it("never matches another organization, a person, or a missing id", () => {
    expect(isVipOrganization(OTHER)).toBe(false);
    expect(isVipOrganization(null)).toBe(false);
    expect(isVipOrganization(undefined)).toBe(false);
    expect(isVipOrganization("")).toBe(false);
    // The archived agency "Nonstop" is a different organization and is not VIP.
    expect(isVipOrganization("f2315826-5501-4bfd-a976-3c674559dedd")).toBe(false);
  });
});

describe("the highest organization plan", () => {
  it("is today's one paid organization plan, derived from the catalogue", () => {
    expect(highestOrganizationPlanKey()).toBe(ORGANIZATION_PLAN_KEY);
    const plan = getPlan(highestOrganizationPlanKey())!;
    expect(plan.audience).toBe("company");
    expect(plan.launch).toBe("sellable");
  });

  it("includes every feature the free organization plan has, with no lower limit", () => {
    const top = getPlan(highestOrganizationPlanKey())!;
    const free = getPlan(FREE_ORGANIZATION_PLAN_KEY)!;
    for (const [k, v] of Object.entries(free.entitlements)) {
      const t = top.entitlements[k as keyof typeof top.entitlements];
      if (v === true) expect(t, k).toBe(true);
      if (typeof v === "number") expect(t === true || (typeof t === "number" && t >= v), k).toBe(true);
    }
  });

  it("is never a deferred, free or internal plan", () => {
    const top = getPlan(highestOrganizationPlanKey())!;
    expect(top.accessState).toBe("payment_not_enabled");
    expect(PRE_PAYMENT_PLANS.filter((p) => p.launch === "deferred").map((p) => p.slug)).not.toContain(top.slug);
  });
});

describe("the resolver: VIP comes before any subscription row", () => {
  it("a VIP with no row holds the highest plan, active, from source vip", () => {
    const ctx = resolveEntitlements({ ...base, vip: true });
    expect(ctx).toMatchObject({ effectivePlanKey: highestOrganizationPlanKey(), source: "vip", active: true, grace: false });
  });

  it("a VIP whose 1 € pilot pass has ended does NOT fall to FREE (2026-11-22)", () => {
    const afterEnd = new Date("2026-11-22T05:34:49Z");
    const status = effectivePilotPassStatus(
      { provider_subscription_id: "pilotpass_x", status: "active", current_period_end: "2026-11-22T05:34:48Z" },
      afterEnd,
    );
    expect(status).toBe("expired");
    const vip = resolveEntitlements({ ...base, vip: true, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "expired" });
    expect(vip.source).toBe("vip");
    expect(vip.effectivePlanKey).toBe(highestOrganizationPlanKey());
    // Control: the same row without VIP is FREE, as the pilot-pass end rule says.
    const notVip = resolveEntitlements({ ...base, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "expired" });
    expect(notVip.effectivePlanKey).toBe(FREE_ORGANIZATION_PLAN_KEY);
  });

  it.each(["cancelled", "expired", "unpaid", "incomplete", "past_due", "active", "trialing"] as const)(
    "any subscription status (%s) leaves a VIP on the highest plan",
    (status) => {
      const ctx = resolveEntitlements({ ...base, vip: true, subscriptionPlanKey: FREE_ORGANIZATION_PLAN_KEY, subscriptionStatus: status });
      expect(ctx.source).toBe("vip");
      expect(ctx.effectivePlanKey).toBe(highestOrganizationPlanKey());
      expect(ctx.grace).toBe(false);
    },
  );

  it("a VIP may create needs with no limit while billing is enforced", () => {
    const ctx = resolveEntitlements({ ...base, vip: true });
    expect(entitlementAllows(ctx, "company_create_needs")).toBe(true);
    const plan = getPlan(ctx.effectivePlanKey)!;
    const gate = decideOpenNeedsGate({ enforced: true, planKey: ctx.effectivePlanKey, limit: limitFor(plan, "company_create_needs"), used: 500 });
    expect(gate.allowed).toBe(true);
  });

  it("an ordinary organization is unchanged: FREE, one open need", () => {
    const ctx = resolveEntitlements(base);
    expect(ctx.effectivePlanKey).toBe(FREE_ORGANIZATION_PLAN_KEY);
    const gate = decideOpenNeedsGate({ enforced: true, planKey: ctx.effectivePlanKey, limit: limitFor(getPlan(ctx.effectivePlanKey)!, "company_create_needs"), used: 1 });
    expect(gate.allowed).toBe(false);
  });

  it("an ordinary paying organization is unchanged", () => {
    const ctx = resolveEntitlements({ ...base, subscriptionPlanKey: ORGANIZATION_PLAN_KEY, subscriptionStatus: "active" });
    expect(ctx).toMatchObject({ effectivePlanKey: ORGANIZATION_PLAN_KEY, source: "subscription" });
  });
});

describe("the server wiring", () => {
  it("VIP is decided from the PROVEN organization subject, never a client value", () => {
    const src = read("lib/billing/effective-entitlements.ts");
    expect(src).toMatch(/vip: actsForOrganization && isVipOrganization\(subject\?\.id\)/);
    // A VIP plan carries no period end and no cancel flag from an old pass.
    expect(src).toMatch(/ctx\.source === "vip"\) return \{ \.\.\.ctx, profileId: user\.id, cancelAtPeriodEnd: false, currentPeriodEnd: null \}/);
  });

  it("checkout refuses a VIP organization before any Stripe session", () => {
    const src = read("app/api/billing/test-checkout/route.ts");
    const vip = src.indexOf("isVipOrganization(workspaceOrganizationId)");
    expect(vip).toBeGreaterThan(-1);
    expect(vip).toBeLessThan(src.indexOf("evaluateCheckoutRequest({"));
    expect(src).toMatch(/reason: "vip_organization"/);
  });

  it("the 1 € pilot pass is neither offered to nor sold to a VIP organization", () => {
    for (const p of ["lib/billing/pilot-pass-offer.ts", "app/api/billing/pilot-pass/route.ts"]) {
      expect(read(p), p).toMatch(/ent\.source === "subscription" \|\| ent\.source === "vip"\) && ent\.active/);
    }
  });

  it("the account shows the plan name VIP and no order, card, end date or portal", () => {
    const src = read("components/app/account-billing-section.tsx");
    const vip = src.indexOf('ent.source === "vip" ?');
    const rest = src.indexOf("!billingOn ?");
    expect(vip).toBeGreaterThan(-1);
    expect(vip).toBeLessThan(rest);
    const branch = src.slice(vip, rest);
    expect(branch).toContain("{VIP_PLAN_LABEL}");
    expect(VIP_PLAN_LABEL).toBe("VIP");
    for (const forbidden of ["TestCheckoutButton", "BillingPortalButton", "endsOn", "subscribe", "trial"]) {
      expect(branch, forbidden).not.toContain(forbidden);
    }
  });
});
