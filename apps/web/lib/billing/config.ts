import "server-only";

import { env } from "@/lib/env";
import {
  resolveBillingConfig,
  isTestSecret,
  isLiveSecret,
  isStripeActive,
  type BillingConfig,
} from "@/lib/billing/config-core";
import { PRICING_READINESS_STATE } from "@/lib/billing/readiness";

/**
 * Billing config — server wrapper (Stripe sprint PR1). Feeds the validated,
 * injected env into the pure resolver (config-core). NEVER reads raw
 * process.env in components; NEVER returns a secret value.
 */

export type {
  BillingConfig,
  BillingProviderState,
  BillingDisabledReason,
} from "@/lib/billing/config-core";
export {
  resolveBillingConfig,
  providerKindFor,
  isStripeActive,
  LIVE_ACTIVATION_TOKEN,
} from "@/lib/billing/config-core";

/** Server-only: the resolved billing config from the validated env. */
export function getBillingConfig(): BillingConfig {
  return resolveBillingConfig({
    paymentsEnabled: env.PAYMENTS_ENABLED,
    provider: env.BILLING_PROVIDER,
    mode: env.STRIPE_MODE,
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    // D3: live arms ONLY with the owner token (env) + the confirmed price
    // table (code). Both are owner actions; neither alone changes anything.
    liveActivation: {
      pricingConfirmed: PRICING_READINESS_STATE === "owner_confirmed",
      token: env.STRIPE_LIVE_ACTIVATION,
    },
  });
}

/**
 * Server-only: the Stripe secret for whichever adapter state is active —
 * sk_test_ under `stripe_test`, sk_live_ under `stripe_live`. Throws in every
 * other state, and refuses a key whose shape disagrees with the state.
 */
export function requireStripeSecret(): string {
  const cfg = getBillingConfig();
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (cfg.state === "stripe_test") {
    if (!isTestSecret(key)) throw new Error("Refusing a non-test Stripe secret key.");
    return key;
  }
  if (cfg.state === "stripe_live") {
    if (!isLiveSecret(key)) {
      throw new Error("Refusing a non-live Stripe secret key in live mode.");
    }
    return key;
  }
  throw new Error(`Stripe not active (${cfg.reason}).`);
}

/** Server-only: the validated test secret, or throw. Never a live key. */
export function requireStripeTestSecret(): string {
  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test") {
    throw new Error(`Stripe test mode not active (${cfg.reason}).`);
  }
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (!isTestSecret(key)) throw new Error("Refusing a non-test Stripe secret key.");
  return key;
}

/** Server-only: the validated webhook secret for either active adapter state. */
export function requireStripeWebhookSecret(): string {
  const cfg = getBillingConfig();
  if (!isStripeActive(cfg)) {
    throw new Error(`Stripe not active (${cfg.reason}).`);
  }
  return env.STRIPE_WEBHOOK_SECRET ?? "";
}
