import "server-only";

export type PlanRow = {
  slug: string;
  name_lt: string | null;
  name_en: string | null;
  /** The ONE home a price has (owner launch pricing 2026-09-05); null = unpriced. */
  price_eur_monthly: number | null;
};

/** Canonical tier order (matches supabase/reference-data.sql). */
// Owner launch pricing 2026-09-05: two public tiers (€0 / €99) + the individual
// plan card; `agency` and `enterprise` rows are retired (inactive), not tiers.
export const PLAN_SLUGS = ["free", "business"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

/**
 * Pricing cards are "sourced from the plans table" (brief §10.4). We query
 * it via the RLS-public `plans` row read. But M0 previews may not have
 * Supabase keys yet, so this NEVER throws: on any failure it returns null and
 * the pricing page falls back to i18n plan names.
 *
 * THIS REGISTRY CARRIES NAMES ONLY — never a price. `/pricing` shows three
 * plan registries at once, and M8 of the beta foundation audit (2026-08-08)
 * flagged the overlap. They are NOT duplicates; each answers a different
 * question, and the split is deliberate:
 *
 *   1. THIS FILE + PLAN_SLUGS → the four MARKETING tiers (free / business /
 *      agency / enterprise) and their display names, read from the `plans`
 *      table. Names only; the tier's price is not modelled anywhere in code.
 *   2. lib/billing/plans.ts → PRE_PAYMENT_PLANS, the ENTITLEMENT boundary
 *      (worker/company/agency/admin audiences, feature limits, accessState).
 *      Different slugs on purpose — it models what a plan DOES, not what a
 *      marketing card is called.
 *   3. lib/billing/readiness.ts → PRICING_READINESS_STATE, the single owner
 *      -editable answer to "is a price sayable yet?". Since M6 this is the
 *      ONLY thing the price slot renders.
 *
 * The invariant that keeps them from drifting into a lie: a price figure has
 * exactly one future home — `plans.price_eur_monthly`, surfaced only after the
 * owner flips PRICING_READINESS_STATE. Never a placeholder, never hard-coded
 * copy. Pinned by lib/guards/pricing-page-beta-honesty.test.ts.
 */
export async function getPlans(): Promise<PlanRow[] | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select("slug, name_lt, name_en, price_eur_monthly")
      .eq("active", true);
    if (error || !data) return null;
    return data as PlanRow[];
  } catch {
    return null;
  }
}
