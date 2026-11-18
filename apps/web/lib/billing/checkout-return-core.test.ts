/**
 * Checkout return classification — payments production calm v1 (2026-09-22).
 *
 * MEASURED defect: the pricing page rendered its cancelled notice only for
 * `?billing=test_cancelled`, while the checkout route's LIVE cancel_url sends
 * `?billing=cancelled` (test-checkout/route.ts picks the prefix from the
 * adapter mode). Both surfaces now recognise both spellings through the one
 * pure classifier; the "syncing" withholding rule lives beside it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  awaitingProviderSync,
  classifyCheckoutReturn,
  isCheckoutCancelledReturn,
  isCheckoutSuccessReturn,
} from "./checkout-return-core";

const WEB = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

describe("classifyCheckoutReturn — both mode spellings, nothing else", () => {
  it("success: live and test", () => {
    expect(classifyCheckoutReturn("success")).toBe("success");
    expect(classifyCheckoutReturn("test_success")).toBe("success");
    expect(isCheckoutSuccessReturn("success")).toBe(true);
    expect(isCheckoutSuccessReturn("test_success")).toBe(true);
  });

  it("cancelled: live and test", () => {
    expect(classifyCheckoutReturn("cancelled")).toBe("cancelled");
    expect(classifyCheckoutReturn("test_cancelled")).toBe("cancelled");
    expect(isCheckoutCancelledReturn("cancelled")).toBe(true);
    expect(isCheckoutCancelledReturn("test_cancelled")).toBe(true);
  });

  it("portal return", () => {
    expect(classifyCheckoutReturn("portal_return")).toBe("portal");
  });

  it("anything else is no return at all — never a guess", () => {
    for (const v of [null, undefined, "", "canceled", "Success", "succes", "test", "1", "true"]) {
      expect(classifyCheckoutReturn(v), String(v)).toBeNull();
      expect(isCheckoutSuccessReturn(v), String(v)).toBe(false);
      expect(isCheckoutCancelledReturn(v), String(v)).toBe(false);
    }
  });
});

describe("the checkout route's URLs and the two surfaces agree", () => {
  const route = read("app/api/billing/test-checkout/route.ts");
  const pricing = read("app/[locale]/(marketing)/pricing/page.tsx");
  const account = read("components/app/account-billing-section.tsx");

  it("the route emits exactly the spellings the classifier recognises", () => {
    expect(route).toMatch(/billing=\$\{config\.testMode \? "test_success" : "success"\}/);
    expect(route).toMatch(/billing=\$\{config\.testMode \? "test_cancelled" : "cancelled"\}/);
  });

  it("the pricing page renders the cancelled notice through the classifier (both spellings), not a single literal", () => {
    expect(pricing).toMatch(/isCheckoutCancelledReturn\(billing\)/);
    expect(pricing).not.toMatch(/billing === "test_cancelled"/);
    expect(pricing).toMatch(/data-testid="pricing-checkout-cancelled"/);
  });

  it("the account section classifies the return through the same module", () => {
    expect(account).toMatch(/classifyCheckoutReturn\(billingReturn\)/);
    expect(account).not.toMatch(/billingReturn === "test_success"/);
  });
});

describe("awaitingProviderSync — withhold the Order button until the row exists", () => {
  const base = { billingOn: true, billingReturn: "success", subscriptionStatus: null } as const;

  it("true only for a success return with billing on and NO subscription row", () => {
    expect(awaitingProviderSync(base)).toBe(true);
    expect(awaitingProviderSync({ ...base, billingReturn: "test_success" })).toBe(true);
  });

  it("false once ANY row exists — an incomplete row is the route's own refusal, not a sync wait", () => {
    for (const s of ["active", "trialing", "past_due", "unpaid", "incomplete", "cancelled", "expired"] as const) {
      expect(awaitingProviderSync({ ...base, subscriptionStatus: s }), s).toBe(false);
    }
  });

  it("false for a cancelled / portal / absent return and while billing is off", () => {
    expect(awaitingProviderSync({ ...base, billingReturn: "cancelled" })).toBe(false);
    expect(awaitingProviderSync({ ...base, billingReturn: "test_cancelled" })).toBe(false);
    expect(awaitingProviderSync({ ...base, billingReturn: "portal_return" })).toBe(false);
    expect(awaitingProviderSync({ ...base, billingReturn: null })).toBe(false);
    expect(awaitingProviderSync({ ...base, billingOn: false })).toBe(false);
  });
});
