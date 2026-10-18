/**
 * 14-day trial (Amivo trial readiness) — policy, checkout params, entitlement
 * and the trial_end -> active transition. No network, no Stripe account.
 *
 *   A. trial-core: Organization plan only, once per organization, fail closed;
 *   B. checkout route: first-time org -> trialPeriodDays=14 handed to the
 *      provider; repeat org / unreadable history -> none;
 *   C. Stripe adapter: the SDK receives subscription_data.trial_period_days=14,
 *      the post-trial charge sentence (read from the Stripe price), card
 *      collection "always"; no trial -> none of it; unreadable price -> no session;
 *   D. trialing is full paid access; customer.subscription.updated trialing ->
 *      active parses, applies (no stale/terminal block) and keeps the plan.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

// -- mocks shared by B (route) and C (adapter) --------------------------------
const supa = vi.hoisted(() => ({ user: { id: "user-1", email: "o@example.com" } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: supa.user } }) },
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ role: "company" }] }) }) }),
  })),
}));
vi.mock("@/lib/billing/config", () => ({
  getBillingConfig: () => ({ state: "stripe_test", reason: "ok", testMode: true, paymentsEnabled: true, mode: "test" }),
  requireStripeSecret: () => "sk_test_dummy",
  requireStripeWebhookSecret: () => "whsec_dummy",
}));
vi.mock("@/lib/billing/prices", () => ({ testPriceIdFor: (k: string) => (k === "company_pilot" ? "price_ORG" : null) }));
vi.mock("@/lib/billing/billing-subject", () => ({
  resolveBillingSubject: vi.fn(async () => ({ subject: { type: "organization", id: "org-1" }, payerProfileId: "user-1", billingAuthority: true, role: "owner" })),
}));
vi.mock("@/lib/billing/customer-store", () => ({ ensureBillingCustomer: vi.fn(async () => ({ ok: true, customerId: "cus_1" })) }));
vi.mock("@/lib/billing/provider", () => ({ getBillingProvider: vi.fn() }));
vi.mock("@/lib/billing/checkout-admission", () => ({ admitCheckout: vi.fn(), readTrialHistory: vi.fn() }));
vi.mock("@/lib/billing/checkout-operations-store", () => ({
  openCheckoutOperation: vi.fn(),
  attachProviderSession: vi.fn(async () => undefined),
  markCheckoutOperationFailed: vi.fn(async () => undefined),
}));

const stripeSdk = vi.hoisted(() => ({
  sessionsCreate: vi.fn(),
  pricesRetrieve: vi.fn(),
}));
vi.mock("stripe", () => ({
  default: class FakeStripe {
    checkout = { sessions: { create: stripeSdk.sessionsCreate } };
    prices = { retrieve: stripeSdk.pricesRetrieve };
  },
}));

import { getBillingProvider } from "@/lib/billing/provider";
import { admitCheckout, readTrialHistory } from "@/lib/billing/checkout-admission";
import { openCheckoutOperation } from "@/lib/billing/checkout-operations-store";
import { POST } from "@/app/api/billing/test-checkout/route";
import { createStripeProvider } from "@/lib/billing/providers/stripe-test";
import { decideTrial, trialConsentText, TRIAL_PERIOD_DAYS } from "@/lib/billing/trial-core";
import { resolveEntitlements } from "@/lib/billing/entitlements-v1";
import {
  decideSubscriptionTransition,
  parseSubscriptionObject,
} from "@/lib/billing/webhook-core";

// -- A. policy ----------------------------------------------------------------
describe("A. decideTrial - Organization plan, once per organization, fail closed", () => {
  const first = { planKey: "company_pilot", subjectType: "organization" as const, history: "none" as const };
  it("first-time organization on the paid Organization plan gets 14 days", () => {
    expect(TRIAL_PERIOD_DAYS).toBe(14);
    expect(decideTrial(first)).toEqual({ trial: true, days: 14 });
  });
  it("a repeat organization (any prior subscription row, even cancelled) gets none", () => {
    expect(decideTrial({ ...first, history: "has_history" })).toEqual({ trial: false, reason: "organization_has_subscription_history" });
  });
  it("unreadable history fails closed", () => {
    expect(decideTrial({ ...first, history: "unreadable" })).toEqual({ trial: false, reason: "history_unreadable" });
  });
  it("free / deferred / personal plans never get a trial", () => {
    for (const planKey of ["free_organization", "free_worker", "worker_plus", "agency_pilot", "admin_internal"]) {
      expect(decideTrial({ ...first, planKey }), planKey).toEqual({ trial: false, reason: "not_trial_plan" });
    }
  });
  it("a personal billing subject never gets a trial", () => {
    expect(decideTrial({ ...first, subjectType: "profile" })).toEqual({ trial: false, reason: "not_organization_subject" });
  });
  it("the consent sentence states days, post-trial charge, VAT exclusion and cancellation - figure from the price", () => {
    const text = trialConsentText({ days: 14, unitAmountCents: 9900, currency: "eur", interval: "month" });
    expect(text).toContain("14 days");
    expect(text).toContain("€99/month");
    expect(text).toContain("excl. VAT");
    expect(text).toMatch(/cancel/i);
    expect(text.length).toBeLessThan(500);
  });
});

// -- B. route -----------------------------------------------------------------
const createSession = vi.fn();
function post(planKey = "company_pilot"): Promise<Response> {
  return POST(new Request("http://localhost/api/billing/test-checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ planKey }),
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getBillingProvider).mockResolvedValue({ id: "stripe_test", active: true, createCheckoutSession: createSession } as never);
  createSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/c/x", sessionId: "cs_1", testMode: true });
  vi.mocked(admitCheckout).mockResolvedValue({ admit: true, reason: "no_local_subscription" });
  vi.mocked(openCheckoutOperation).mockResolvedValue({
    kind: "opened",
    operation: { id: "op-1", scopeKey: "organization:org-1", planKey: "company_pilot", idempotencyKey: "k", expiresAt: "2026-09-05T10:45:00.000Z", providerSessionId: null },
  } as never);
});

describe("B. checkout route - trial_period_days decision reaches the provider", () => {
  it("first-time organization -> trialPeriodDays = 14 (and the response says so)", async () => {
    vi.mocked(readTrialHistory).mockResolvedValue("none");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).trialDays).toBe(14);
    expect(createSession.mock.calls[0][0].trialPeriodDays).toBe(14);
    expect(readTrialHistory).toHaveBeenCalledWith(expect.objectContaining({ scope: { type: "organization", id: "org-1" }, planKey: "company_pilot" }));
  });
  it("repeat organization -> NO trialPeriodDays", async () => {
    vi.mocked(readTrialHistory).mockResolvedValue("has_history");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).trialDays).toBeNull();
    expect(createSession.mock.calls[0][0]).not.toHaveProperty("trialPeriodDays");
  });
  it("unreadable history -> checkout proceeds WITHOUT a trial (fail closed)", async () => {
    vi.mocked(readTrialHistory).mockResolvedValue("unreadable");
    await post();
    expect(createSession.mock.calls[0][0]).not.toHaveProperty("trialPeriodDays");
  });
  it("a free plan never reaches the provider, so no trial is possible", async () => {
    vi.mocked(readTrialHistory).mockResolvedValue("none");
    const res = await post("free_organization");
    expect(res.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });
});

// -- C. adapter ---------------------------------------------------------------
const baseInput = {
  planKey: "company_pilot",
  priceId: "price_ORG",
  clientReferenceId: "user-1",
  successUrl: "https://x/s",
  cancelUrl: "https://x/c",
};
describe("C. Stripe adapter - session params", () => {
  beforeEach(() => {
    stripeSdk.sessionsCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/x" });
    stripeSdk.pricesRetrieve.mockResolvedValue({ unit_amount: 9900, currency: "eur", recurring: { interval: "month" } });
  });
  it("trial: trial_period_days=14, post-trial charge text, card always, cancel if no card at end", async () => {
    const r = await createStripeProvider().createCheckoutSession({ ...baseInput, trialPeriodDays: 14 });
    expect(r.ok).toBe(true);
    const params = stripeSdk.sessionsCreate.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.subscription_data.trial_period_days).toBe(14);
    expect(params.subscription_data.trial_settings).toEqual({ end_behavior: { missing_payment_method: "cancel" } });
    expect(params.payment_method_collection).toBe("always");
    expect(params.custom_text.submit.message).toContain("€99/month");
    expect(params.custom_text.submit.message).toContain("excl. VAT");
    expect(params.subscription_data.metadata).toEqual(expect.objectContaining({ plan_key: "company_pilot" }));
    expect(params.automatic_tax).toEqual({ enabled: true });
  });
  it("no trial input: none of the trial params are sent and the price is not read", async () => {
    await createStripeProvider().createCheckoutSession(baseInput);
    const params = stripeSdk.sessionsCreate.mock.calls[0][0];
    expect(params.subscription_data).not.toHaveProperty("trial_period_days");
    expect(params).not.toHaveProperty("custom_text");
    expect(stripeSdk.pricesRetrieve).not.toHaveBeenCalled();
  });
  it("trial but the price cannot be read -> NO session (never a trial with an unstated charge)", async () => {
    stripeSdk.pricesRetrieve.mockResolvedValue({ unit_amount: null, currency: "eur" });
    const r = await createStripeProvider().createCheckoutSession({ ...baseInput, trialPeriodDays: 14 });
    expect(r).toEqual({ ok: false, reason: "trial_price_unreadable" });
    expect(stripeSdk.sessionsCreate).not.toHaveBeenCalled();
  });
});

// -- D. trialing = paid access; trial_end -> active ---------------------------
describe("D. trialing is full paid access and trial_end -> active keeps it", () => {
  const ent = (status: "trialing" | "active" | "past_due" | "cancelled") =>
    resolveEntitlements({
      billingActive: true, isAdmin: false, audience: "company",
      subscriptionPlanKey: "company_pilot", subscriptionStatus: status, manualOverridePlanKey: null,
    });
  it("trialing resolves to the paid Organization plan via the subscription source", () => {
    expect(ent("trialing")).toEqual(expect.objectContaining({ effectivePlanKey: "company_pilot", source: "subscription", active: true, grace: false }));
  });
  it("trialing and active are entitlement-identical (same plan, source, active)", () => {
    const { subscriptionStatus: _a, ...t } = ent("trialing");
    const { subscriptionStatus: _b, ...a } = ent("active");
    expect(t).toEqual(a);
  });
  it("customer.subscription.updated trialing -> active (trial end, invoice paid): parses, applies, keeps plan + org", () => {
    const meta = { client_reference_id: "user-1", plan_key: "company_pilot", organization_id: "org-1" };
    const T0 = 1_800_000_000;
    const trialing = parseSubscriptionObject(
      { id: "sub_1", customer: "cus_1", status: "trialing", trial_end: T0 + 14 * 86400, metadata: meta },
      true, { id: "evt_1", created: T0 },
    )!;
    const active = parseSubscriptionObject(
      { id: "sub_1", customer: "cus_1", status: "active", trial_end: T0 + 14 * 86400, metadata: meta },
      true, { id: "evt_2", created: T0 + 14 * 86400 + 60 },
    )!;
    expect(trialing.status).toBe("trialing");
    expect(active.status).toBe("active");
    expect(active.planKey).toBe("company_pilot");
    expect(active.organizationId).toBe("org-1");
    const decision = decideSubscriptionTransition(
      { status: "trialing", lastEventCreatedAt: new Date(T0 * 1000).toISOString() },
      { kind: "subscription", status: active.status, eventCreated: active.eventCreated ?? null },
    );
    expect(decision).toEqual({ apply: true, keepStatus: false });
    expect(ent(active.status as "active").active).toBe(true);
  });
  it("trial ends without payment: past_due stays a flagged grace, cancelled falls back to free", () => {
    expect(ent("past_due")).toEqual(expect.objectContaining({ active: true, grace: true }));
    expect(ent("cancelled").active).toBe(false);
  });
});
