import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { limitFor } from "./entitlements";
import { resolveEntitlements } from "./entitlements-v1";
import { decideOpenNeedsGate } from "./open-needs-gate";
import { getPlan } from "./plans";
import { PILOT_PASS_DAYS, effectivePilotPassStatus, parsePilotPassGrant } from "./pilot-pass-core";

/**
 * THE END OF THE ORGANIZATION PILOT PASS (owner decision 2026-11-13).
 *
 *   start 2026-10-23, end 2026-11-22; automatic renewal is forbidden; no
 *   further payment without the customer's own separate confirmation; after
 *   the end the organization keeps its account and every free function.
 *
 * The pass is a ONE-TIME payment, not a provider subscription, so there is
 * nothing at Stripe that could renew. No event arrives at the end: the stored
 * row stays as written and the entitlement read alone turns it into FREE.
 * This file pins that chain and the absence of any path that charges again.
 */
const WEB = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const sources = (dir: string): string[] =>
  readdirSync(join(WEB, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(WEB, rel)).isDirectory()) return sources(rel);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [rel] : [];
  });

const PAID_AT = Date.parse("2026-10-23T12:00:00Z") / 1000;
const session = {
  id: "cs_live_pass", mode: "payment", payment_status: "paid", amount_total: 100, currency: "eur",
  client_reference_id: "owner_1", customer: "cus_1",
  metadata: { lm_purpose: "lm_pilot_pass", organization_id: "org_1", owner_id: "owner_1", plan_key: "company_pilot" },
};
const company = { billingActive: true, isAdmin: false, audience: "company" as const, manualOverridePlanKey: null };

describe("the pass runs for a fixed period and ends by itself", () => {
  const grant = parsePilotPassGrant(session, PAID_AT)!;
  const row = { provider_subscription_id: grant.providerSubscriptionId, status: "active", current_period_end: grant.periodEnd };

  it("a pass paid on 2026-10-23 ends on 2026-11-22: 30 days from Stripe's own event time", () => {
    expect(PILOT_PASS_DAYS).toBe(30);
    expect(grant.periodStart).toBe("2026-10-23T12:00:00.000Z");
    expect(grant.periodEnd).toBe("2026-11-22T12:00:00.000Z");
  });

  it("a later replay of the same event grants the SAME window, never a later one", () => {
    expect(parsePilotPassGrant(session, PAID_AT)!.periodEnd).toBe(grant.periodEnd);
  });

  it("until the end the organization holds the paid plan; from the end it is on FREE", () => {
    const before = resolveEntitlements({
      ...company, subscriptionPlanKey: "company_pilot",
      subscriptionStatus: effectivePilotPassStatus(row, new Date("2026-11-22T11:59:59Z")) as "active",
    });
    expect(before).toMatchObject({ active: true, effectivePlanKey: "company_pilot" });
    const after = resolveEntitlements({
      ...company, subscriptionPlanKey: "company_pilot",
      subscriptionStatus: effectivePilotPassStatus(row, new Date("2026-11-22T12:00:00Z")) as "expired",
    });
    expect(after).toMatchObject({ active: false, source: "free", effectivePlanKey: "free_organization" });
  });

  it("after the end the free functions stay: one need is allowed, existing needs above it only block a NEW one", () => {
    const limit = limitFor(getPlan("free_organization")!, "company_create_needs");
    expect(limit).toBe(1);
    expect(decideOpenNeedsGate({ enforced: true, planKey: "free_organization", limit, used: 0 }).allowed).toBe(true);
    // The organization still holds 3 needs from the paid period: nothing is
    // closed, paused or deleted — the decision is a refusal of the NEXT one.
    expect(decideOpenNeedsGate({ enforced: true, planKey: "free_organization", limit, used: 3 })).toMatchObject({
      allowed: false, reason: "over_open_need_limit", used: 3,
    });
  });
});

describe("nothing renews the pass or charges again", () => {
  const adapter = read("lib/billing/providers/stripe-test.ts");
  const oneTime = adapter.slice(adapter.indexOf("async createOneTimeCheckoutSession("), adapter.indexOf("async createCustomer("));

  it("the session is a single payment: no subscription and no card kept for later charges", () => {
    expect(oneTime).toContain('mode: "payment"');
    for (const forbidden of ["subscription_data", "setup_future_usage", "off_session", "recurring"]) {
      expect(oneTime, forbidden).not.toContain(forbidden);
    }
  });

  it("no module charges without a hosted checkout the customer completes themselves", () => {
    const all = [...sources("lib"), ...sources("app")].map((f) => [f, read(f)] as const);
    for (const call of [/subscriptions\.(create|resume)\(/, /invoices\.(pay|create)\(/, /paymentIntents\.(create|confirm)\(/, /charges\.create\(/]) {
      expect(all.filter(([, src]) => call.test(src)).map(([f]) => f), String(call)).toEqual([]);
    }
  });

  it("only the pilot-pass route can create the one-time session, and it refuses while a plan is active", () => {
    const callers = [...sources("lib"), ...sources("app")]
      .filter((f) => /\.createOneTimeCheckoutSession\(/.test(read(f)))
      .sort();
    expect(callers).toEqual(["app/api/billing/pilot-pass/route.ts"]);
    expect(read("app/api/billing/pilot-pass/route.ts")).toContain('planActive = ent.source === "subscription" && ent.active');
  });

  it("recovery and reconciliation never look a pass up at the provider or move its row", () => {
    expect(read("lib/billing/reconcile.ts")).toMatch(/startsWith\("pilotpass_"\)[\s\S]{0,80}continue;/);
    expect(read("lib/billing/reconcile-core.ts")).toContain('s.providerSubscriptionId.startsWith("pilotpass_")');
  });

  it("the end is applied by the entitlement read alone: billing has no write that ends, pauses or deletes anything at that moment", () => {
    const core = read("lib/billing/pilot-pass-core.ts");
    expect(core).not.toMatch(/\.(update|delete|insert|upsert)\(/);
    expect(read("lib/billing/effective-entitlements.ts")).toContain("effectivePilotPassStatus(real, new Date())");
  });
});
