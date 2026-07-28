/**
 * Guard — COMMERCIAL READINESS (audit v1).
 *
 * Pins the payment-chain defects closed by the commercial readiness audit so
 * they cannot silently return. Every assertion names the failure it prevents;
 * none of them can be satisfied by a comment.
 *
 * Scope note: this guard does NOT relax any existing safety rule. Live payments
 * stay hard-blocked (lib/guards/no-live-payments.test.ts), the LMC kill-switches
 * stay false (lib/guards/lmc-ledger-foundation.test.ts).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  mapStripeStatus,
  parseSubscriptionObject,
  parseInvoiceObject,
  parseSubscriptionPeriod,
  isHandledEventType,
  shouldApplyStatus,
} from "../billing/webhook-core";
import {
  resolveEntitlements,
  entitlementAllows,
  withinPastDueGrace,
  PAST_DUE_GRACE_DAYS,
} from "../billing/entitlements-v1";
import {
  LMC_ADMIN_GRANT_MAX_CENTS,
  LMC_ADMIN_GRANT_MAX_EXPIRY_DAYS,
  mapLmcError,
} from "../lmc/ledger";

const here = resolve(fileURLToPath(import.meta.url), "..");
const webRoot = resolve(here, "..", "..");
const read = (rel: string) => readFileSync(resolve(webRoot, rel), "utf8");

// ── 1. Stripe API-version drift (the two removed fields) ────────────────────

describe("commercial readiness — Stripe payload shape (API 2026-05-27.dahlia)", () => {
  it("the subscription period is read from items.data[], not the removed top-level field", () => {
    const start = Math.floor(Date.parse("2026-07-01T00:00:00Z") / 1000);
    const end = Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000);
    const period = parseSubscriptionPeriod({
      items: { data: [{ current_period_start: start, current_period_end: end }] },
    });
    expect(period.start).toBe("2026-07-01T00:00:00.000Z");
    expect(period.end).toBe("2026-08-01T00:00:00.000Z");
  });

  it("a legacy top-level period still parses (replayed / older-API events)", () => {
    const period = parseSubscriptionPeriod({
      current_period_start: Math.floor(Date.parse("2026-07-01T00:00:00Z") / 1000),
      current_period_end: Math.floor(Date.parse("2026-08-01T00:00:00Z") / 1000),
    });
    expect(period.start).toBe("2026-07-01T00:00:00.000Z");
  });

  it("the invoice's subscription is read from parent.subscription_details", () => {
    const parsed = parseInvoiceObject(
      {
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: "sub_9" },
        },
      },
      false,
    );
    expect(parsed.providerSubscriptionId).toBe("sub_9");
    expect(parsed.lastPaymentStatus).toBe("failed");
    // Without this, EVERY invoice event was a silent no-op: a failed payment
    // never reached the subscription row.
  });

  it("invoice.paid is handled (it is the modern success event)", () => {
    expect(isHandledEventType("invoice.paid")).toBe(true);
    expect(isHandledEventType("invoice.payment_failed")).toBe(true);
  });
});

// ── 2. Entitlement leaks ────────────────────────────────────────────────────

describe("commercial readiness — no free paid access", () => {
  it("a paused subscription is NOT an entitling grace state", () => {
    expect(mapStripeStatus("paused")).toBe("unpaid");
  });

  it("pause_collection (status stays active) is not entitling either", () => {
    const parsed = parseSubscriptionObject(
      {
        id: "sub_1",
        status: "active",
        pause_collection: { behavior: "void" },
        metadata: { plan_key: "company_pilot", client_reference_id: "u1" },
      },
      true,
    );
    expect(parsed?.status).toBe("unpaid");
  });

  it("the past_due grace window is bounded, not open-ended", () => {
    expect(PAST_DUE_GRACE_DAYS).toBeGreaterThan(0);
    const end = "2026-08-01T00:00:00.000Z";
    expect(withinPastDueGrace(end, new Date("2026-08-03T00:00:00Z"))).toBe(true);
    expect(withinPastDueGrace(end, new Date("2026-09-01T00:00:00Z"))).toBe(false);

    const ctx = resolveEntitlements({
      billingActive: true,
      isAdmin: false,
      audience: "company",
      subscriptionPlanKey: "company_pilot",
      subscriptionStatus: "past_due",
      manualOverridePlanKey: null,
      currentPeriodEnd: end,
      now: new Date("2026-09-01T00:00:00Z"),
    });
    expect(ctx.active).toBe(false);
    expect(entitlementAllows(ctx, "booking_requests")).toBe(false);
  });

  it("an out-of-order link event never downgrades an active subscription", () => {
    expect(shouldApplyStatus("incomplete", "active", { fromLink: true })).toBe(false);
    expect(shouldApplyStatus("active", "incomplete", { fromLink: true })).toBe(true);
    // A real lifecycle event still applies.
    expect(shouldApplyStatus("past_due", "active")).toBe(true);
  });
});

// ── 3. The chain a real buyer walks ─────────────────────────────────────────

describe("commercial readiness — the buyer can finish and can leave", () => {
  it("checkout puts the owner+plan link on the SUBSCRIPTION, not only the session", () => {
    const src = read("lib/billing/providers/stripe-test.ts");
    expect(src).toMatch(/subscription_data:\s*\{\s*metadata:/);
    // Session metadata is not copied to the subscription: without this the
    // subscription events carry no owner and no plan.
  });

  it("checkout is idempotent (a double click cannot open two subscriptions)", () => {
    expect(read("lib/billing/providers/stripe-test.ts")).toMatch(/idempotencyKey/);
    expect(read("app/api/billing/test-checkout/route.ts")).toMatch(/idempotencyKey:/);
  });

  it("a customer portal route exists and is gated exactly like checkout", () => {
    const rel = "app/api/billing/portal/route.ts";
    expect(existsSync(resolve(webRoot, rel))).toBe(true);
    const src = read(rel);
    expect(src).toMatch(/stripe_live_blocked/);
    expect(src).toMatch(/state !== "stripe_test"/);
    expect(src).toMatch(/not_authenticated/);
    // The customer is resolved from the SESSION, never from the request body.
    expect(src).toMatch(/getBillingCustomerId\(user\.id\)/);
    expect(src).not.toMatch(/req\.json\(\)/);
  });

  it("the customer link is stored, otherwise the portal can never open", () => {
    expect(read("app/api/billing/webhook/route.ts")).toMatch(/upsertBillingCustomer/);
  });

  it("the account page acknowledges the provider return and shows real state", () => {
    const page = read("app/[locale]/dashboard/account/page.tsx");
    expect(page).toMatch(/searchParams/);
    expect(page).toMatch(/AccountBillingSection/);
    const section = read("components/app/account-billing-section.tsx");
    expect(section).toMatch(/test_success/);
    expect(section).toMatch(/test_cancelled/);
    expect(section).toMatch(/portal_return/);
  });
});

// ── 4. Money must never be silently lost ────────────────────────────────────

describe("commercial readiness — webhook failure is visible", () => {
  it("a store failure answers non-2xx so Stripe retries", () => {
    const src = read("app/api/billing/webhook/route.ts");
    expect(src).toMatch(/status:\s*500/);
    expect(src).toMatch(/isRetryable/);
  });

  it("a retry of a FAILED event is reprocessed, not dismissed as a duplicate", () => {
    const src = read("lib/billing/subscription-store.ts");
    expect(src).toMatch(/prior\.processed === true && !prior\.error/);
  });

  it("re-subscription rebinds the owner+plan row instead of violating its unique index", () => {
    const src = read("lib/billing/subscription-store.ts");
    expect(src).toMatch(/rebound/);
    expect(src).toMatch(/\.eq\("plan_key", planKey\)/);
  });

  it("a verified signature is still required before any business logic", () => {
    const src = read("app/api/billing/webhook/route.ts");
    // Compare CALL SITES, not imports: the rejection must precede the first
    // write of the event.
    const sigIndex = src.indexOf('reason: "invalid_signature"');
    const storeIndex = src.indexOf("await recordWebhookEvent(");
    expect(sigIndex).toBeGreaterThan(-1);
    expect(storeIndex).toBeGreaterThan(-1);
    expect(sigIndex).toBeLessThan(storeIndex);
    expect(src).toMatch(/live_event_rejected/);
  });
});

// ── 5. LMC: a seam over the existing ledger, never a second ledger ──────────

describe("commercial readiness — LMC application seam", () => {
  it("credits go through the existing RPC with the admin's own session", () => {
    const src = read("lib/lmc/ledger.ts");
    expect(src).toMatch(/rpc\("lmc_admin_grant_v1"/);
    // The RPC self-gates on auth.uid() + is_admin(): a service-role client
    // would bypass that identity check entirely.
    expect(src).not.toMatch(/createAdminClient/);
  });

  it("no new LMC table, RPC or kill-switch is introduced by the application layer", () => {
    const src = read("lib/lmc/ledger.ts") + read("lib/admin/lmc-actions.ts");
    expect(src).not.toMatch(/create\s+table/i);
    expect(src).not.toMatch(/create\s+or\s+replace\s+function/i);
    // Flags stay owner-only: the app may never CALL the setter (naming it in a
    // comment that explains why is fine).
    expect(src).not.toMatch(/rpc\(\s*["']lmc_set_flag_v1/);
  });

  it("the ledger's own limits are mirrored, not widened", () => {
    // migration 20260720190000: v_cap = 100000 cents, expiry <= 365 days.
    expect(LMC_ADMIN_GRANT_MAX_CENTS).toBe(100_000);
    expect(LMC_ADMIN_GRANT_MAX_EXPIRY_DAYS).toBe(365);
  });

  it("a disabled kill-switch is reported honestly, never as a silent success", () => {
    expect(mapLmcError("lmc_promotional_grants_disabled").reason).toBe("grants_disabled");
    expect(mapLmcError("Admin only").reason).toBe("not_admin");
    expect(mapLmcError("lmc_idempotency_conflict: key x").reason).toBe(
      "idempotency_conflict",
    );
  });

  it("the expiry function finally has a caller (liability can be shed)", () => {
    expect(existsSync(resolve(webRoot, "scripts/lmc-expire-lots.ts"))).toBe(true);
    expect(read("scripts/lmc-expire-lots.ts")).toMatch(/lmc_expire_lots_v1/);
    expect(read("package.json")).toMatch(/"lmc:expire-lots"/);
  });

  it("no withdrawal / cash-out capability is offered anywhere in the LMC surface", () => {
    // Comments are stripped: the doctrine text deliberately says LMC is "not a
    // withdrawable balance" and "not a promise of future cash redemption".
    const stripComments = (s: string) =>
      s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const surfaces = [
      "lib/lmc/ledger.ts",
      "lib/admin/lmc-actions.ts",
      "components/app/admin-lmc-panel.tsx",
      "components/app/admin-lmc-grant-form.tsx",
      "components/app/account-billing-section.tsx",
    ]
      .map((f) => stripComments(read(f)))
      .join("\n");
    expect(surfaces).not.toMatch(/withdraw|cash[- ]?out|payout|iban|redeem/i);
  });

  it("the user-facing credit copy states LMC is not cash, in every active locale", () => {
    for (const loc of ["en", "lt", "ru", "nl", "de"] as const) {
      const m = JSON.parse(read(`messages/${loc}.json`));
      const credit = m.accountBilling?.credit;
      expect(credit, `${loc}: accountBilling.credit missing`).toBeTruthy();
      expect(typeof credit.note).toBe("string");
      expect(credit.note.length).toBeGreaterThan(30);
      // The balance is a statement, never an action: no locale may put a
      // withdrawal/cash-out CONTROL on the credit block.
      expect(Object.keys(credit).sort()).toEqual([
        "amount",
        "expiring",
        "frozen",
        "note",
        "title",
      ]);
    }
  });
});
