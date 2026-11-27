import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * THE SECOND OWNER ACT FOR LIVE CHARGING (audit 2026-10-16, B-1; owner
 * decision MKT-7 "two independent owner acts arm real charging").
 *
 * Until now the two acts were a code constant (`PRICING_READINESS_STATE`)
 * and an env value equal to a public literal (`STRIPE_LIVE_ACTIVATION`).
 * The database flag `lmc_settings.live_payments_enabled` — owner-only by
 * policy class, seeded false, settable by no agent path — was read by
 * nothing. It now gates the ONE consequential live action: creating a new
 * live Checkout Session. Reading it fails CLOSED: an unreadable flag is
 * "not enabled", never "enabled".
 *
 * Lives in lib/commercial, not lib/billing: the Stripe ⟂ LMC-ledger guard
 * (stripe-lmc-separation.test.ts) forbids any billing module from naming an
 * lmc_* table, and this reader touches only the settings row, never the
 * ledger. The separation of MONEY stays literal; the FLAG is shared on purpose.
 *
 * Scope is deliberately narrow: the webhook keeps recording and applying
 * what Stripe already did (a paid subscription must grant its entitlement
 * whatever the flag says), and the portal keeps working for existing
 * customers. Only NEW live checkouts need both acts.
 */
export type LivePaymentsFlagRead =
  | { readonly kind: "enabled" }
  | { readonly kind: "disabled" }
  | { readonly kind: "unavailable" };

export async function readLivePaymentsEnabled(): Promise<LivePaymentsFlagRead> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("lmc_settings")
      .select("enabled")
      .eq("key", "live_payments_enabled")
      .maybeSingle();
    if (error) return { kind: "unavailable" };
    return data?.enabled === true ? { kind: "enabled" } : { kind: "disabled" };
  } catch {
    return { kind: "unavailable" };
  }
}
