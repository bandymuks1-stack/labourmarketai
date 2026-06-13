import "server-only";

import { env } from "@/lib/env";
import {
  resolveBillingConfig,
  isTestSecret,
  type BillingConfig,
} from "@/lib/billing/config-core";

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
export { resolveBillingConfig, providerKindFor } from "@/lib/billing/config-core";

/** Server-only: the resolved billing config from the validated env. */
export function getBillingConfig(): BillingConfig {
  return resolveBillingConfig({
    paymentsEnabled: env.PAYMENTS_ENABLED,
    provider: env.BILLING_PROVIDER,
    mode: env.STRIPE_MODE,
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  });
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

/** Server-only: the validated test webhook secret. */
export function requireStripeWebhookSecret(): string {
  const cfg = getBillingConfig();
  if (cfg.state !== "stripe_test") {
    throw new Error(`Stripe test mode not active (${cfg.reason}).`);
  }
  return env.STRIPE_WEBHOOK_SECRET ?? "";
}
