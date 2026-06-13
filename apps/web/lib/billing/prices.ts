import "server-only";

import { env } from "@/lib/env";

/**
 * Plan → Stripe TEST price id map (Stripe sprint PR3). Read from the validated
 * env (test price ids the owner creates in Stripe test mode). A missing price
 * means that plan's test checkout is honestly "price_not_configured".
 */
export function testPriceIdFor(planKey: string): string | null {
  switch (planKey) {
    case "worker_plus":
      return env.STRIPE_PRICE_WORKER_PLUS ?? null;
    case "company_pilot":
      return env.STRIPE_PRICE_COMPANY_PILOT ?? null;
    case "agency_pilot":
      return env.STRIPE_PRICE_AGENCY_PILOT ?? null;
    default:
      return null;
  }
}
