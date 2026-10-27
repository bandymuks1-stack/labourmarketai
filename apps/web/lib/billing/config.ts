import "server-only";

import { env } from "@/lib/env";
import {
  resolveBillingConfig,
  isTestSecret,
  isLiveSecret,
  isStripeActive,
  billingConfigForSubject,
  parsePilotOrganizations,
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
 * Server-only: the billing config for ONE organization, or for a person / a
 * public page (null). Under a pilot list only the listed organizations see an
 * active adapter; everyone else reads billing as off. Webhook, portal and
 * reconciliation keep `getBillingConfig()`: they act on sessions that only a
 * pilot organization could have created.
 */
export function getBillingConfigFor(organizationId: string | null): BillingConfig {
  return billingConfigForSubject(
    getBillingConfig(),
    parsePilotOrganizations(env.BILLING_PILOT_ORGANIZATION_IDS),
    organizationId,
  );
}

/** Server-only: whether a NEW organization subscription starts with the 14-day trial. */
export function billingTrialEnabled(): boolean {
  return env.BILLING_TRIAL_ENABLED !== "false";
}

/** Server-only: whether the organization pilot pass (1 € → the plan for the pilot period) is on. */
export function billingPilotPassEnabled(): boolean {
  return env.BILLING_PILOT_PASS_ENABLED === "true";
}

/**
 * Server-only: whether Stripe Tax is switched on (owner order 2026-10-23,
 * default OFF). Off = the pilot-pass Checkout carries no tax parameters and the
 * webhook records no tax evidence — exactly the behaviour before the switch.
 * The €99 subscription Checkout already asks for automatic tax under the
 * 2026-09-05 launch-pricing decision (checkout-tax-pins.test.ts); the switch
 * does not change it.
 */
export function billingStripeTaxEnabled(): boolean {
  return env.BILLING_STRIPE_TAX_ENABLED === "true";
}

/** Server-only: whether billing is restricted to a pilot list (true unless ALL_ORGANIZATIONS). */
export function billingPilotActive(): boolean {
  return parsePilotOrganizations(env.BILLING_PILOT_ORGANIZATION_IDS) !== null;
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
