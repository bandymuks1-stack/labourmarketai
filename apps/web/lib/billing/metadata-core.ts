/**
 * Canonical Stripe object metadata — PURE core (Stripe TEST subscriptions v1).
 * No IO. Every Stripe object this platform creates (customer, checkout session,
 * subscription) carries the SAME stable metadata so webhook results can be
 * linked back deterministically and TEST objects are always identifiable:
 *
 *   project            = "labourmarket.ai"   (never another project's objects)
 *   environment        = "test"              (this chain never creates live)
 *   canonical_plan_key = plans.ts slug        (worker_plus / company_pilot / …)
 *   schema_version     = STRIPE_METADATA_SCHEMA_VERSION
 *   owner_id           = our profile id
 *   organization_id    = canonical organizations.id (company/agency plans only)
 *
 * The plan/price mapping stays server-side (lib/billing/prices.ts reads env);
 * nothing here contains a price, currency, or secret.
 */

export const STRIPE_METADATA_PROJECT = "labourmarket.ai";
export const STRIPE_METADATA_ENVIRONMENT = "test";
export const STRIPE_METADATA_SCHEMA_VERSION = "1";

export interface CanonicalStripeMetadata extends Record<string, string> {
  project: string;
  environment: string;
  schema_version: string;
}

/** Metadata for a Stripe TEST customer (plan-agnostic — customer is per-profile). */
export function customerMetadata(ownerId: string): CanonicalStripeMetadata {
  return {
    project: STRIPE_METADATA_PROJECT,
    environment: STRIPE_METADATA_ENVIRONMENT,
    schema_version: STRIPE_METADATA_SCHEMA_VERSION,
    owner_id: ownerId,
  };
}

/**
 * Metadata for a Stripe TEST checkout session AND its resulting subscription
 * (passed as subscription_data.metadata too, so customer.subscription.* events
 * carry the linkage even when they arrive before/without the session event).
 */
export function checkoutMetadata(input: {
  planKey: string;
  ownerId: string;
  organizationId?: string | null;
}): CanonicalStripeMetadata {
  const meta: CanonicalStripeMetadata = {
    project: STRIPE_METADATA_PROJECT,
    environment: STRIPE_METADATA_ENVIRONMENT,
    schema_version: STRIPE_METADATA_SCHEMA_VERSION,
    canonical_plan_key: input.planKey,
    // Kept for backward compatibility with the existing webhook-core parser.
    plan_key: input.planKey,
    owner_id: input.ownerId,
  };
  if (input.organizationId) meta.organization_id = input.organizationId;
  return meta;
}

/**
 * Deterministic idempotency key for checkout-session creation. A retry of the
 * same (owner, plan, organization) request reuses the SAME key, so Stripe
 * replays the original session instead of creating an uncontrolled pile of
 * sessions. Stripe scopes idempotency keys to ~24h; within that window the
 * same request is answered with the same session — an acceptable, documented
 * TEST-mode property (no time source is mixed in on purpose: determinism
 * beats freshness for a retry guard).
 */
export function checkoutIdempotencyKey(input: {
  ownerId: string;
  planKey: string;
  organizationId?: string | null;
}): string {
  const org = input.organizationId ?? "self";
  // Stripe allows up to 255 chars; uuid+slug+uuid stays well under.
  return `co1_${input.ownerId}_${input.planKey}_${org}`;
}
