import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isLiveSecret, isTestSecret } from "@/lib/billing/config-core";

/**
 * Owner decision 2026-09-05 (launch pricing): the €99 ORGANIZATION price is
 * tax-EXCLUSIVE and Stripe Tax computes VAT per customer country. That only
 * happens when the Checkout Session asks for it — these pins keep the session
 * honest to the decision. Source pins because the adapter talks to the SDK.
 */
const ADAPTER = readFileSync(join(__dirname, "providers", "stripe-test.ts"), "utf8");

describe("Checkout carries the tax decision", () => {
  it("enables automatic tax, requires the billing address and collects the VAT id", () => {
    expect(ADAPTER).toContain("automatic_tax: { enabled: true }");
    expect(ADAPTER).toContain('billing_address_collection: "required"');
    expect(ADAPTER).toContain("tax_id_collection: { enabled: true }");
  });
  it("lets Stripe store the address on a REUSED customer (required for automatic tax), never on a bare e-mail checkout", () => {
    expect(ADAPTER).toMatch(/input\.providerCustomerId\s*\?\s*\{ customer_update: \{ address: "auto", name: "auto" \} \}\s*:\s*\{\}/);
  });
});

describe("live secret shape — full or restricted, never test", () => {
  it("accepts sk_live_ and rk_live_ as live secrets", () => {
    expect(isLiveSecret("sk_live_x")).toBe(true);
    expect(isLiveSecret("rk_live_x")).toBe(true);
  });
  it("rejects test keys, publishable keys and restricted TEST keys as live secrets", () => {
    expect(isLiveSecret("sk_test_x")).toBe(false);
    expect(isLiveSecret("rk_test_x")).toBe(false);
    expect(isLiveSecret("pk_live_x")).toBe(false);
    expect(isLiveSecret(undefined)).toBe(false);
    expect(isTestSecret("rk_live_x")).toBe(false);
  });
});
