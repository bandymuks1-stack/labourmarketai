import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { LaunchOfferEligibilityRow } from "@/lib/billing/offers";

/**
 * Offer eligibility store — SERVER-only writes via the service-role client
 * (same pattern as subscription-store). Degrades honestly to
 * "needs-migration" until 20260714190000_billing_plans_offers_v1.sql is
 * applied. NEVER throws into the webhook chain.
 */

const RELATION_ABSENT = "42P01";
const UNIQUE_VIOLATION = "23505";
const POSTGREST_MISSING = "PGRST205";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient();
}

export type OfferStoreResult = "ok" | "duplicate" | "needs-migration" | "error";

/**
 * Idempotent write of a Launch Offer discount eligibility (the automatic
 * "system remembers" step). Duplicate (profile already earned it) → 'duplicate'.
 */
export async function recordLaunchOfferEligibility(
  row: LaunchOfferEligibilityRow,
): Promise<OfferStoreResult> {
  try {
    const { error } = await admin()
      .from("billing_offer_eligibility")
      .insert(row);
    if (!error) return "ok";
    if (error.code === UNIQUE_VIOLATION) return "duplicate";
    if (error.code === RELATION_ABSENT || error.code === POSTGREST_MISSING) {
      return "needs-migration";
    }
    return "error";
  } catch {
    return "error";
  }
}

export interface OfferEligibilityView {
  readonly profileId: string;
  readonly offerSlug: string;
  readonly activationAt: string;
  readonly applyBefore: string;
  readonly discountPercent: number;
  readonly consumedAt: string | null;
  readonly testMode: boolean;
}

export interface OfferEligibilityListing {
  /** false = migration not applied yet (honest not-available state). */
  readonly available: boolean;
  readonly rows: readonly OfferEligibilityView[];
}

/** Admin read of earned eligibilities; honest unavailable state pre-apply. */
export async function listOfferEligibilityBestEffort(
  limit = 50,
): Promise<OfferEligibilityListing> {
  try {
    const { data, error } = await admin()
      .from("billing_offer_eligibility")
      .select(
        "profile_id, offer_slug, activation_at, apply_before, discount_percent, consumed_at, test_mode",
      )
      .order("earned_at", { ascending: false })
      .limit(limit);
    if (error) return { available: false, rows: [] };
    type Row = {
      profile_id: string;
      offer_slug: string;
      activation_at: string;
      apply_before: string;
      discount_percent: number;
      consumed_at: string | null;
      test_mode: boolean;
    };
    return {
      available: true,
      rows: ((data ?? []) as Row[]).map((r) => ({
        profileId: r.profile_id,
        offerSlug: r.offer_slug,
        activationAt: r.activation_at,
        applyBefore: r.apply_before,
        discountPercent: r.discount_percent,
        consumedAt: r.consumed_at,
        testMode: r.test_mode,
      })),
    };
  } catch {
    return { available: false, rows: [] };
  }
}
