import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LIVE_CHECK_AMOUNT_CENTS,
  LIVE_CHECK_CURRENCY,
  LIVE_CHECK_PURPOSE,
  evaluateLiveCheck,
  liveCheckIdempotencyKey,
  liveCheckMetadata,
  summarizeLiveCheckSession,
} from "@/lib/billing/live-check-core";
import { summarizeRecordedEvent } from "@/lib/billing/webhook-core";

const ORG = "11111111-2222-3333-4444-555555555555";
const ready = {
  enabled: true,
  authenticated: true,
  organizationId: ORG,
  billingAuthority: true,
  billingState: "stripe_live",
};

describe("the owner's 1 € LIVE payment check gate", () => {
  it("opens only when switched on, signed in, in an organization with billing authority, and billing is LIVE for it", () => {
    expect(evaluateLiveCheck(ready)).toEqual({ ok: true, organizationId: ORG });
  });
  it("refuses every missing condition, in order, with its own reason", () => {
    expect(evaluateLiveCheck({ ...ready, enabled: false })).toMatchObject({ ok: false, reason: "live_check_disabled" });
    expect(evaluateLiveCheck({ ...ready, authenticated: false })).toMatchObject({ ok: false, reason: "unauthenticated" });
    expect(evaluateLiveCheck({ ...ready, organizationId: null })).toMatchObject({ ok: false, reason: "no_organization" });
    expect(evaluateLiveCheck({ ...ready, billingAuthority: false })).toMatchObject({ ok: false, reason: "not_billing_authority" });
  });
  it("never runs under TEST, a blocked live config, billing off, or an organization outside the pilot", () => {
    for (const state of ["stripe_test", "stripe_live_blocked", "disabled"]) {
      expect(evaluateLiveCheck({ ...ready, billingState: state })).toMatchObject({ ok: false, reason: "not_live" });
    }
  });
  it("the amount is a fixed 1 € — a constant, never an input", () => {
    expect(LIVE_CHECK_AMOUNT_CENTS).toBe(100);
    expect(LIVE_CHECK_CURRENCY).toBe("eur");
  });
});

describe("one payable session per organization per UTC day", () => {
  it("derives the Stripe idempotency key from the organization and the date", () => {
    const a = liveCheckIdempotencyKey(ORG, new Date("2026-10-22T08:00:00Z"));
    expect(a).toBe(liveCheckIdempotencyKey(ORG, new Date("2026-10-22T23:59:00Z")));
    expect(a).not.toBe(liveCheckIdempotencyKey(ORG, new Date("2026-10-23T00:00:00Z")));
    expect(a).not.toBe(liveCheckIdempotencyKey("99999999-2222-3333-4444-555555555555", new Date("2026-10-22T08:00:00Z")));
  });
  it("stamps the purpose and the organization on the session", () => {
    expect(liveCheckMetadata({ organizationId: ORG, ownerId: "p1" })).toEqual({
      lm_purpose: LIVE_CHECK_PURPOSE,
      organization_id: ORG,
      owner_id: "p1",
    });
  });
});

describe("the webhook records what was paid", () => {
  const session = {
    id: "cs_live_1",
    mode: "payment",
    payment_status: "paid",
    amount_total: 100,
    currency: "eur",
    livemode: true,
    payment_intent: "pi_1",
    metadata: { lm_purpose: LIVE_CHECK_PURPOSE, organization_id: ORG },
  };
  it("summarizes a completed LIVE check session for the idempotency record", () => {
    expect(summarizeRecordedEvent("checkout.session.completed", session)).toEqual({
      purpose: LIVE_CHECK_PURPOSE,
      session_id: "cs_live_1",
      mode: "payment",
      payment_status: "paid",
      amount_total: 100,
      currency: "eur",
      livemode: true,
      organization_id: ORG,
      payment_intent: "pi_1",
    });
  });
  it("leaves every other checkout session (the subscription chain) without a summary, as before", () => {
    expect(summarizeLiveCheckSession({ ...session, metadata: { plan_key: "company_pilot" } })).toBeNull();
    expect(summarizeRecordedEvent("checkout.session.completed", { mode: "subscription" })).toBeNull();
    expect(summarizeRecordedEvent("checkout.session.completed", null)).toBeNull();
  });
});

describe("source pins", () => {
  const adapter = readFileSync(join(__dirname, "providers", "stripe-test.ts"), "utf8");
  const block = adapter.slice(
    adapter.indexOf("async createOneTimeCheckoutSession("),
    adapter.indexOf("async createCustomer("),
  );
  it("the one-time session is payment mode with inline price data — no subscription, no saved price, no tax", () => {
    expect(block).toContain('mode: "payment"');
    expect(block).toContain("unit_amount: input.amountCents");
    expect(block).not.toContain("subscription_data");
    expect(block).not.toContain("automatic_tax");
    expect(block).toContain("idempotencyKey: input.idempotencyKey");
  });
  it("the route reads no request body: amount, currency, organization and key are decided on the server", () => {
    const route = readFileSync(join(__dirname, "..", "..", "app", "api", "billing", "live-check", "route.ts"), "utf8");
    expect(route).not.toMatch(/req\.(json|formData|text)\(/);
    expect(route).toContain("LIVE_CHECK_AMOUNT_CENTS");
    expect(route).toContain('provider.id !== "stripe_live"');
  });
});
