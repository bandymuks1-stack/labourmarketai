/**
 * Billing config — PURE core (Stripe sprint PR1). No IO, no server-only, no env
 * read: safe to unit-test and to import from the guard. The server wrapper
 * (lib/billing/config.ts) feeds the validated env into resolveBillingConfig.
 *
 * Hard guarantees encoded here:
 *   - LIVE is impossible to activate: a live mode OR a live key shape
 *     (sk_live_/pk_live_/rk_live_) → `stripe_live_blocked`, paymentsEnabled=false.
 *   - OFF by default: payments activate ONLY with PAYMENTS_ENABLED=true +
 *     BILLING_PROVIDER=stripe + STRIPE_MODE=test + sk_test_ + whsec_.
 *   - Never exposes a secret value — only presence flags.
 */

export type BillingProviderState =
  | "disabled"
  | "stripe_test"
  | "stripe_live_blocked";

export type BillingDisabledReason =
  | "ok"
  | "payments_disabled"
  | "no_provider"
  | "live_blocked"
  | "missing_test_secret"
  | "missing_webhook_secret"
  | "invalid_test_secret";

export interface BillingConfig {
  readonly state: BillingProviderState;
  readonly paymentsEnabled: boolean;
  readonly testMode: boolean;
  readonly mode: "test" | "live";
  readonly hasTestSecret: boolean;
  readonly hasWebhookSecret: boolean;
  readonly hasPublishableKey: boolean;
  readonly reason: BillingDisabledReason;
}

export const LIVE_KEY = /^(sk|pk|rk)_live_/i;
const TEST_SECRET = /^sk_test_/;
const WEBHOOK_SECRET = /^whsec_/;

function anyLiveKey(values: Array<string | undefined>): boolean {
  return values.some((v) => typeof v === "string" && LIVE_KEY.test(v));
}

export interface BillingConfigInput {
  paymentsEnabled: string | boolean | undefined;
  provider: string | undefined;
  mode: string | undefined;
  secretKey: string | undefined;
  webhookSecret: string | undefined;
  publishableKey: string | undefined;
}

export function resolveBillingConfig(input: BillingConfigInput): BillingConfig {
  const mode: "test" | "live" = input.mode === "live" ? "live" : "test";
  const hasTestSecret = TEST_SECRET.test(input.secretKey ?? "");
  const hasWebhookSecret = WEBHOOK_SECRET.test(input.webhookSecret ?? "");
  const hasPublishableKey = Boolean(input.publishableKey);

  const off = (reason: BillingDisabledReason): BillingConfig => ({
    state: "disabled",
    paymentsEnabled: false,
    testMode: false,
    mode,
    hasTestSecret,
    hasWebhookSecret,
    hasPublishableKey,
    reason,
  });

  // 1. HARD live block — highest priority, never an active provider.
  if (mode === "live" || anyLiveKey([input.secretKey, input.publishableKey])) {
    return {
      state: "stripe_live_blocked",
      paymentsEnabled: false,
      testMode: false,
      mode: "live",
      hasTestSecret,
      hasWebhookSecret,
      hasPublishableKey,
      reason: "live_blocked",
    };
  }

  // 2. Off by default.
  const enabled =
    input.paymentsEnabled === true || input.paymentsEnabled === "true";
  if (!enabled) return off("payments_disabled");
  if (input.provider !== "stripe") return off("no_provider");

  // 3. Test mode requires a real test secret + webhook secret.
  if ((input.secretKey ?? "").length > 0 && !hasTestSecret) {
    return off("invalid_test_secret");
  }
  if (!hasTestSecret) return off("missing_test_secret");
  if (!hasWebhookSecret) return off("missing_webhook_secret");

  return {
    state: "stripe_test",
    paymentsEnabled: true,
    testMode: true,
    mode: "test",
    hasTestSecret,
    hasWebhookSecret,
    hasPublishableKey,
    reason: "ok",
  };
}

/** Pure provider selection — disabled/blocked → noop (no checkout possible). */
export function providerKindFor(cfg: BillingConfig): "noop" | "stripe_test" {
  return cfg.state === "stripe_test" ? "stripe_test" : "noop";
}

export function isTestSecret(v: string | undefined): boolean {
  return TEST_SECRET.test(v ?? "");
}
