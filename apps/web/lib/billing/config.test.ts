import { describe, it, expect } from "vitest";
import { resolveBillingConfig, providerKindFor } from "./config-core";

const base = {
  paymentsEnabled: "true" as string | undefined,
  provider: "stripe" as string | undefined,
  mode: "test" as string | undefined,
  secretKey: "sk_test_123" as string | undefined,
  webhookSecret: "whsec_123" as string | undefined,
  publishableKey: "pk_test_123" as string | undefined,
};

describe("billing config resolver", () => {
  it("provider is DISABLED by default (no config)", () => {
    const c = resolveBillingConfig({
      paymentsEnabled: undefined, provider: undefined, mode: undefined,
      secretKey: undefined, webhookSecret: undefined, publishableKey: undefined,
    });
    expect(c.state).toBe("disabled");
    expect(c.paymentsEnabled).toBe(false);
  });

  it("test mode enabled ONLY with a full safe test config", () => {
    const c = resolveBillingConfig(base);
    expect(c.state).toBe("stripe_test");
    expect(c.paymentsEnabled).toBe(true);
    expect(c.testMode).toBe(true);
  });

  it("a live key pattern is rejected (blocked, not active)", () => {
    expect(resolveBillingConfig({ ...base, secretKey: "sk_live_123" }).state).toBe("stripe_live_blocked");
    expect(resolveBillingConfig({ ...base, mode: "live" }).state).toBe("stripe_live_blocked");
    expect(resolveBillingConfig({ ...base, publishableKey: "pk_live_123" }).state).toBe("stripe_live_blocked");
  });

  it("missing config returns an honest disabled state with a reason", () => {
    expect(resolveBillingConfig({ ...base, paymentsEnabled: "false" }).reason).toBe("payments_disabled");
    expect(resolveBillingConfig({ ...base, provider: "none" }).reason).toBe("no_provider");
    expect(resolveBillingConfig({ ...base, secretKey: undefined }).reason).toBe("missing_test_secret");
    expect(resolveBillingConfig({ ...base, webhookSecret: undefined }).reason).toBe("missing_webhook_secret");
  });

  it("a non-test secret (not sk_test_) while enabled is rejected", () => {
    expect(resolveBillingConfig({ ...base, secretKey: "sk_foo_123" }).reason).toBe("invalid_test_secret");
  });

  it("never leaks a secret value (only presence flags)", () => {
    const c = resolveBillingConfig(base);
    const blob = JSON.stringify(c);
    expect(blob).not.toContain("sk_test_123");
    expect(blob).not.toContain("whsec_123");
    expect(c.hasTestSecret).toBe(true);
    expect(c.hasWebhookSecret).toBe(true);
  });

  it("NO checkout provider when disabled or live-blocked (→ noop)", () => {
    expect(providerKindFor(resolveBillingConfig({
      paymentsEnabled: "false", provider: "stripe", mode: "test",
      secretKey: "sk_test_123", webhookSecret: "whsec_123", publishableKey: undefined,
    }))).toBe("noop");
    expect(providerKindFor(resolveBillingConfig({ ...base, mode: "live" }))).toBe("noop");
    // Only a full valid test config yields the stripe_test provider.
    expect(providerKindFor(resolveBillingConfig(base))).toBe("stripe_test");
  });
});
