/**
 * REFERENCE ONLY — the canonical commercial source is
 * `docs/product/commercial-system-v1.md` + `lib/commercial/catalogue.ts`.
 *
 * Reference only: this maps a plan key to the ENV VAR holding a Stripe Price id. It must never contain an amount.
 *
 * Guarded by lib/guards/commercial-single-source.test.ts.
 */
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
