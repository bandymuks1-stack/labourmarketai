import "server-only";

import { env } from "@/lib/env";

/**
 * Plan → Stripe TEST price id map (Stripe sprint PR3; extended for the
 * Sprint v2 §9 catalogue). Read from the validated env (test price ids the
 * owner creates in Stripe TEST mode — see
 * scripts/billing/stripe-test-products.md). A missing price means that
 * plan's test checkout is honestly "price_not_configured".
 *
 * Legacy plan keys keep their env vars; their V2 successors have their own
 * — an alias never silently reuses the other tier's price.
 */
export function testPriceIdFor(planKey: string): string | null {
  switch (planKey) {
    // Legacy catalogue (pre-payment sprint)
    case "worker_plus":
      return env.STRIPE_PRICE_WORKER_PLUS ?? null;
    case "company_pilot":
      return env.STRIPE_PRICE_COMPANY_PILOT ?? null;
    case "agency_pilot":
      return env.STRIPE_PRICE_AGENCY_PILOT ?? null;
    // Catalogue V2 (Sprint v2 §9)
    case "ai_plus":
      return env.STRIPE_PRICE_AI_PLUS ?? null;
    case "vip_media":
      return env.STRIPE_PRICE_VIP_MEDIA ?? null;
    case "launch_offer_99":
      return env.STRIPE_PRICE_LAUNCH_OFFER ?? null;
    case "agency_start":
      return env.STRIPE_PRICE_AGENCY_START ?? null;
    case "agency_growth":
      return env.STRIPE_PRICE_AGENCY_GROWTH ?? null;
    case "agency_scale":
      return env.STRIPE_PRICE_AGENCY_SCALE ?? null;
    default:
      return null;
  }
}
