import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  PILOT_PASS_AMOUNT_CENTS,
  PILOT_PASS_CURRENCY,
  PILOT_PASS_DAYS,
  PILOT_PASS_PLAN_KEY,
  PILOT_PASS_PURPOSE,
  effectivePilotPassStatus,
  evaluatePilotPass,
  isPilotPassSubscriptionId,
  parsePilotPassGrant,
  pilotPassIdempotencyKey,
  pilotPassMetadata,
  summarizePilotPassSession,
} from "@/lib/billing/pilot-pass-core";
import { ORGANIZATION_PLAN_KEY, getPlan } from "@/lib/billing/plans";
import { summarizeRecordedEvent } from "@/lib/billing/webhook-core";

const ORG = "11111111-2222-3333-4444-555555555555";
const ready = {
  enabled: true,
  authenticated: true,
  organizationId: ORG,
  billingAuthority: true,
  billingState: "stripe_live",
  planActive: false,
};

describe("the pilot pass gate", () => {
  it("opens when switched on, signed in, in an organization with billing authority, billing active, no plan yet", () => {
    expect(evaluatePilotPass(ready)).toEqual({ ok: true, organizationId: ORG });
    expect(evaluatePilotPass({ ...ready, billingState: "stripe_test" })).toEqual({ ok: true, organizationId: ORG });
  });
  it("refuses every missing condition with its own reason", () => {
    expect(evaluatePilotPass({ ...ready, enabled: false })).toMatchObject({ ok: false, reason: "pilot_pass_disabled" });
    expect(evaluatePilotPass({ ...ready, authenticated: false })).toMatchObject({ ok: false, reason: "unauthenticated" });
    expect(evaluatePilotPass({ ...ready, organizationId: null })).toMatchObject({ ok: false, reason: "no_organization" });
    expect(evaluatePilotPass({ ...ready, billingAuthority: false })).toMatchObject({ ok: false, reason: "not_billing_authority" });
    expect(evaluatePilotPass({ ...ready, planActive: true })).toMatchObject({ ok: false, reason: "plan_active" });
  });
  it("never runs with billing off, a blocked live config, or an organization outside the pilot", () => {
    for (const state of ["stripe_live_blocked", "disabled"]) {
      expect(evaluatePilotPass({ ...ready, billingState: state })).toMatchObject({ ok: false, reason: "billing_not_active" });
    }
  });
  it("1 € once, for the one paid Organization plan, for a stated period", () => {
    expect(PILOT_PASS_AMOUNT_CENTS).toBe(100);
    expect(PILOT_PASS_CURRENCY).toBe("eur");
    expect(PILOT_PASS_DAYS).toBe(30);
    expect(PILOT_PASS_PLAN_KEY).toBe(ORGANIZATION_PLAN_KEY);
    expect(getPlan(PILOT_PASS_PLAN_KEY)).toBeTruthy();
  });
});

describe("one payable session per organization per UTC day", () => {
  it("derives the Stripe idempotency key from the organization and the date", () => {
    const a = pilotPassIdempotencyKey(ORG, new Date("2026-10-22T08:00:00Z"));
    expect(a).toBe(pilotPassIdempotencyKey(ORG, new Date("2026-10-22T23:59:00Z")));
    expect(a).not.toBe(pilotPassIdempotencyKey(ORG, new Date("2026-10-23T00:00:00Z")));
  });
  it("stamps purpose, plan, period and organization on the session", () => {
    expect(pilotPassMetadata({ organizationId: ORG, ownerId: "p1" })).toEqual({
      lm_purpose: PILOT_PASS_PURPOSE,
      plan_key: PILOT_PASS_PLAN_KEY,
      pilot_days: "30",
      organization_id: ORG,
      owner_id: "p1",
    });
  });
});

const paidSession = {
  id: "cs_live_1",
  mode: "payment",
  payment_status: "paid",
  amount_total: 100,
  currency: "eur",
  livemode: true,
  customer: "cus_1",
  client_reference_id: "p1",
  payment_intent: "pi_1",
  metadata: { lm_purpose: PILOT_PASS_PURPOSE, plan_key: PILOT_PASS_PLAN_KEY, pilot_days: "30", organization_id: ORG, owner_id: "p1" },
};
const CREATED = Date.parse("2026-10-22T10:00:00Z") / 1000;

describe("the webhook grant", () => {
  it("a paid pass becomes the organization's plan row for exactly the pilot period, from Stripe's own clock", () => {
    expect(parsePilotPassGrant(paidSession, CREATED)).toEqual({
      providerSubscriptionId: "pilotpass_cs_live_1",
      providerCustomerId: "cus_1",
      ownerId: "p1",
      organizationId: ORG,
      planKey: PILOT_PASS_PLAN_KEY,
      periodStart: "2026-10-22T10:00:00.000Z",
      periodEnd: "2026-11-21T10:00:00.000Z",
      amountTotal: 100,
      currency: "eur",
    });
  });
  it("grants nothing for an unpaid session, a subscription session, another purpose, or a missing organization/owner/time", () => {
    expect(parsePilotPassGrant({ ...paidSession, payment_status: "unpaid" }, CREATED)).toBeNull();
    expect(parsePilotPassGrant({ ...paidSession, mode: "subscription" }, CREATED)).toBeNull();
    expect(parsePilotPassGrant({ ...paidSession, metadata: { plan_key: "company_pilot" } }, CREATED)).toBeNull();
    expect(parsePilotPassGrant({ ...paidSession, metadata: { lm_purpose: PILOT_PASS_PURPOSE } }, CREATED)).toBeNull();
    expect(parsePilotPassGrant({ ...paidSession, client_reference_id: null, metadata: { ...paidSession.metadata, owner_id: "" } }, CREATED)).toBeNull();
    expect(parsePilotPassGrant(paidSession, null)).toBeNull();
    expect(parsePilotPassGrant(null, CREATED)).toBeNull();
  });
  it("a Stripe retry grants the same window, not a later one", () => {
    expect(parsePilotPassGrant(paidSession, CREATED)).toEqual(parsePilotPassGrant(paidSession, CREATED));
  });
  it("the idempotency record carries what was paid; subscription sessions keep no summary", () => {
    expect(summarizeRecordedEvent("checkout.session.completed", paidSession)).toMatchObject({
      purpose: PILOT_PASS_PURPOSE,
      session_id: "cs_live_1",
      amount_total: 100,
      currency: "eur",
      livemode: true,
      organization_id: ORG,
      plan_key: PILOT_PASS_PLAN_KEY,
      pilot_days: "30",
    });
    expect(summarizePilotPassSession({ ...paidSession, metadata: { plan_key: "company_pilot" } })).toBeNull();
    expect(summarizeRecordedEvent("checkout.session.completed", { mode: "subscription" })).toBeNull();
  });
});

describe("the pass ends by itself", () => {
  const row = { provider_subscription_id: "pilotpass_cs_live_1", status: "active", current_period_end: "2026-11-21T10:00:00.000Z" };
  it("is active until its end and expired from that moment on", () => {
    expect(effectivePilotPassStatus(row, new Date("2026-11-21T09:59:59Z"))).toBe("active");
    expect(effectivePilotPassStatus(row, new Date("2026-11-21T10:00:00Z"))).toBe("expired");
    expect(effectivePilotPassStatus({ ...row, current_period_end: null }, new Date())).toBe("expired");
  });
  it("leaves every other plan row exactly as stored", () => {
    const sub = { provider_subscription_id: "sub_1", status: "active", current_period_end: "2020-01-01T00:00:00Z" };
    expect(effectivePilotPassStatus(sub, new Date())).toBe("active");
    expect(isPilotPassSubscriptionId("manual_x")).toBe(false);
    expect(isPilotPassSubscriptionId("pilotpass_cs_1")).toBe(true);
  });
});

describe("source pins", () => {
  const read = (...p: string[]) => readFileSync(join(__dirname, ...p), "utf8");
  const adapter = read("providers", "stripe-test.ts");
  const block = adapter.slice(adapter.indexOf("async createOneTimeCheckoutSession("), adapter.indexOf("async createCustomer("));
  it("the session is payment mode with inline price data and an invoice — no subscription, no saved price, no tax unless the Stripe Tax switch is on", () => {
    expect(block).toContain('mode: "payment"');
    expect(block).toContain("unit_amount: input.amountCents");
    expect(block).toContain("invoice_creation: { enabled: true");
    expect(block).not.toContain("subscription_data");
    // No literal tax field: tax arrives ONLY through the switch-gated helpers
    // (stripe-tax-core returns {} while BILLING_STRIPE_TAX_ENABLED is off).
    expect(block).not.toContain("automatic_tax");
    expect(block).toContain("...oneTimePriceTaxBehavior(taxOn)");
    expect(block).toContain("...checkoutTaxParams({ enabled: taxOn,");
    expect(block).toContain("const taxOn = billingStripeTaxEnabled();");
    expect(block).toContain("idempotencyKey: input.idempotencyKey");
  });
  it("the route reads no request body and refuses an organization that already has a plan", () => {
    const route = read("..", "..", "app", "api", "billing", "pilot-pass", "route.ts");
    expect(route).not.toMatch(/req\.(json|formData|text)\(/);
    expect(route).toContain("PILOT_PASS_AMOUNT_CENTS");
    expect(route).toContain("planActive");
  });
  it("the webhook activates the pass before the subscription link, and the entitlement read expires it", () => {
    const hook = read("..", "..", "app", "api", "billing", "webhook", "route.ts");
    expect(hook.indexOf("applyPilotPass(")).toBeGreaterThan(0);
    expect(hook.indexOf("applyPilotPass(")).toBeLessThan(hook.indexOf("applyCheckoutLink(event.object"));
    expect(read("effective-entitlements.ts")).toContain("effectivePilotPassStatus(real, new Date())");
    expect(read("apply-subscription-snapshot.ts")).toMatch(/status: "active",[\s\S]*cancelAtPeriodEnd: true/);
  });
  it("the owner can find the pass: first on the account page, never inside the collapsed plan fold", () => {
    const page = read("..", "..", "app", "[locale]", "dashboard", "account", "page.tsx");
    const at = page.indexOf("<PilotPassSection");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(page.indexOf("<Fold"));
    expect(page).toContain('testId="account-plan-fold" defaultOpen={billingLive}');
    // "everything is free" only while billing is off
    expect(page.indexOf('accountPlan.freePilot')).toBeGreaterThan(page.indexOf("{!billingLive && ("));
  });
  it("the pricing page and the employer home point to it; the €99 order is withheld while the pass runs", () => {
    expect(read("..", "..", "app", "[locale]", "(marketing)", "pricing", "page.tsx")).toContain("<PilotPassInvite />");
    expect(read("..", "..", "app", "[locale]", "dashboard", "page.tsx")).toContain("<PilotPassInvite ");
    expect(read("..", "..", "components", "app", "account-billing-section.tsx")).toMatch(/canOrder =[\s\S]*!billingPilotPassEnabled\(\);/);
    const invite = read("..", "..", "components", "app", "pilot-pass-invite.tsx");
    expect(invite).toContain('href="/dashboard/account#pilot-pass"');
    expect(invite).not.toContain("/api/billing/pilot-pass");
  });
  it("a pass is never treated as a provider subscription by admission, replacement or reconciliation", () => {
    expect(read("checkout-operations-core.ts")).toContain('startsWith("pilotpass_")');
    expect(read("subscription-store.ts")).toContain('heldSubId.startsWith("pilotpass_")');
    expect(read("reconcile-core.ts")).toContain('startsWith("pilotpass_")');
    expect(read("reconcile.ts")).toContain('startsWith("pilotpass_")');
  });
});
