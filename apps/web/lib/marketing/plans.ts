/**
 * REFERENCE ONLY — the canonical commercial source is
 * `docs/product/commercial-system-v1.md` + `lib/commercial/catalogue.ts`.
 *
 * Reference only: reads plan NAMES from public.plans for the marketing page. That table is orphaned (all prices NULL, no shared slug with the runtime contract) — its fate is MOD-02.
 *
 * Guarded by lib/guards/commercial-single-source.test.ts.
 */
import "server-only";

export type PlanRow = {
  slug: string;
  name_lt: string | null;
  name_en: string | null;
};

/** Canonical tier order (matches supabase/reference-data.sql). */
export const PLAN_SLUGS = ["free", "business", "agency", "enterprise"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

/**
 * Pricing cards are "sourced from the plans table" (brief §10.4). We query
 * it via the RLS-public `plans` row read. But M0 previews may not have
 * Supabase keys yet, so this NEVER throws: on any failure it returns null and
 * the pricing page falls back to i18n plan names. The price itself is always
 * a governed placeholder (`pricing.plan.*`), never read from here.
 */
export async function getPlans(): Promise<PlanRow[] | null> {
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("plans")
      .select("slug, name_lt, name_en")
      .eq("active", true);
    if (error || !data) return null;
    return data as PlanRow[];
  } catch {
    return null;
  }
}
