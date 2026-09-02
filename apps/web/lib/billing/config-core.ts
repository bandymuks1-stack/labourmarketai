/**
 * Billing config — PURE core (Stripe sprint PR1). No IO, no server-only, no env
 * read: safe to unit-test and to import from the guard. The server wrapper
 * (lib/billing/config.ts) feeds the validated env into resolveBillingConfig.
 *
 * Hard guarantees encoded here:
 *   - LIVE is impossible to activate implicitly: a live mode OR a live key
 *     shape (sk_live_/pk_live_/rk_live_) → `stripe_live_blocked`,
 *     paymentsEnabled=false — for every caller that passes no `liveActivation`
 *     (all of them before D3, 2026-09-02).
 *   - LIVE activates ONLY through the owner-armed path (D3): the exact
 *     activation token in env (gate G-8) AND the price table confirmed in code
 *     (PRICING_READINESS_STATE, gate G-7) AND a complete live key set AND
 *     STRIPE_MODE=live. Any missing piece keeps the historical block, with the
 *     reason named.
 *   - OFF by default: payments activate ONLY with PAYMENTS_ENABLED=true +
 *     BILLING_PROVIDER=stripe + STRIPE_MODE=test + sk_test_ + whsec_.
 *   - Never exposes a secret value — only presence flags.
 */

export type BillingProviderState =
  | "disabled"
  | "stripe_test"
  | "stripe_live"
  | "stripe_live_blocked";

export type BillingDisabledReason =
  | "ok"
  | "payments_disabled"
  | "no_provider"
  | "live_blocked"
  | "live_pricing_not_confirmed"
  | "live_keys_incomplete"
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
const LIVE_SECRET = /^sk_live_/;
const LIVE_PUBLISHABLE = /^pk_live_/;
const TEST_SECRET = /^sk_test_/;
const WEBHOOK_SECRET = /^whsec_/;

/**
 * The exact value STRIPE_LIVE_ACTIVATION must carry for live mode to resolve
 * to an active provider. It is not a secret — it is the owner's recorded
 * decision, set beside the live keys in the same env change (gate G-8), and
 * it does nothing unless the price table is owner-confirmed in code
 * (PRICING_READINESS_STATE) and every live key is present.
 */
export const LIVE_ACTIVATION_TOKEN = "approved-by-owner";

export interface LiveActivationInput {
  /** `PRICING_READINESS_STATE === "owner_confirmed"` (code constant, gate G-7). */
  readonly pricingConfirmed: boolean;
  /** `STRIPE_LIVE_ACTIVATION` env value (gate G-8). */
  readonly token: string | undefined;
}

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
  /**
   * Absent (the historical callers, every test that predates D3) means "not
   * armed": any live signal resolves to `stripe_live_blocked` exactly as
   * before. Present AND complete is the only way live mode activates.
   */
  liveActivation?: LiveActivationInput;
}

export function resolveBillingConfig(input: BillingConfigInput): BillingConfig {
  const mode: "test" | "live" = input.mode === "live" ? "live" : "test";
  const hasTestSecret = TEST_SECRET.test(input.secretKey ?? "");
  const hasWebhookSecret = WEBHOOK_SECRET.test(input.webhookSecret ?? "");
  const hasPublishableKey = Boolean(input.publishableKey);
  const enabled =
    input.paymentsEnabled === true || input.paymentsEnabled === "true";

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

  // 1. LIVE signal (mode or key shape) — highest priority. Blocked unless the
  //    owner ARMED it: the exact activation token + the price table confirmed
  //    in code + a complete live key set. Every earlier caller passes no
  //    `liveActivation` and therefore keeps the historical hard block.
  if (mode === "live" || anyLiveKey([input.secretKey, input.publishableKey])) {
    const blocked = (reason: BillingDisabledReason): BillingConfig => ({
      state: "stripe_live_blocked",
      paymentsEnabled: false,
      testMode: false,
      mode: "live",
      hasTestSecret,
      hasWebhookSecret,
      hasPublishableKey,
      reason,
    });
    const act = input.liveActivation;
    if (!act || act.token !== LIVE_ACTIVATION_TOKEN) return blocked("live_blocked");
    if (!act.pricingConfirmed) return blocked("live_pricing_not_confirmed");
    if (!enabled) return blocked("payments_disabled");
    if (input.provider !== "stripe") return blocked("no_provider");
    const hasLiveSecret = LIVE_SECRET.test(input.secretKey ?? "");
    const hasLivePublishable = LIVE_PUBLISHABLE.test(input.publishableKey ?? "");
    if (mode !== "live" || !hasLiveSecret || !hasLivePublishable) {
      return blocked("live_keys_incomplete");
    }
    if (!hasWebhookSecret) return blocked("missing_webhook_secret");
    return {
      state: "stripe_live",
      paymentsEnabled: true,
      testMode: false,
      mode: "live",
      hasTestSecret,
      hasWebhookSecret,
      hasPublishableKey,
      reason: "ok",
    };
  }

  // 2. Off by default.
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
export function providerKindFor(
  cfg: BillingConfig,
): "noop" | "stripe_test" | "stripe_live" {
  if (cfg.state === "stripe_test") return "stripe_test";
  if (cfg.state === "stripe_live") return "stripe_live";
  return "noop";
}

/** Either Stripe adapter state — the two in which the SDK may be constructed. */
export function isStripeActive(cfg: Pick<BillingConfig, "state">): boolean {
  return cfg.state === "stripe_test" || cfg.state === "stripe_live";
}

export function isTestSecret(v: string | undefined): boolean {
  return TEST_SECRET.test(v ?? "");
}

export function isLiveSecret(v: string | undefined): boolean {
  return LIVE_SECRET.test(v ?? "");
}
