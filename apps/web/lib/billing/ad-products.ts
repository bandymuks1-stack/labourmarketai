/**
 * Job-ad product registry + ad entitlement resolution — PURE core
 * (Pricing & Payments slice, Sprint v2 §10). No IO.
 *
 * ARCHITECTURE ONLY — there is no purchase flow. The DB registry
 * (20260714191000_ad_products_registry_v1.sql, gated draft) seeds the same
 * slugs with price_cents = NULL (owner has NOT confirmed ad prices — an
 * unknown price is honest, an invented one is not) and active = false.
 * The public pricing page lists inactive products under an explicit
 * "in preparation" section — names only, no prices, no buy affordance.
 *
 * Owner rule encoded in resolveActiveAdAllowance(): normal company plans do
 * NOT include unlimited ads — the plan gives a finite allowance and purchased
 * ad credits ADD to it; only an "unlimited" plan (Launch Offer / agency
 * SCALE) short-circuits to unlimited.
 */

import type { PlanV2 } from "@/lib/billing/plans";

export const AD_PRODUCT_SLUGS = [
  "single_ad",
  "ai_promoted_ad",
  "premium_promoted_ad",
  "international_ad",
  "package_5",
  "package_20",
  "agency_package",
  "extra_promotion",
] as const;
export type AdProductSlug = (typeof AD_PRODUCT_SLUGS)[number];

export type AdProductAudience = "company" | "agency" | "any";

export interface AdProductEntitlement {
  /** Job-ad credits the product grants (0 = promotion-only product). */
  readonly adCredits: number;
  /** Promotion level applied to the ad(s), if any. */
  readonly promotion: "none" | "standard" | "ai" | "premium" | "boost";
  /** International (cross-market) reach. */
  readonly international: boolean;
}

export interface AdProduct {
  readonly slug: AdProductSlug;
  readonly audience: AdProductAudience;
  /** null = owner has not confirmed a price (never a fabricated number). */
  readonly priceCents: number | null;
  readonly currency: "EUR";
  /** false everywhere today — activation is an owner gate. */
  readonly active: boolean;
  readonly entitlement: AdProductEntitlement;
}

/** Static mirror of the gated DB seed — the single TS-side source of truth. */
export const AD_PRODUCTS: readonly AdProduct[] = [
  { slug: "single_ad", audience: "company", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 1, promotion: "none", international: false } },
  { slug: "ai_promoted_ad", audience: "company", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 1, promotion: "ai", international: false } },
  { slug: "premium_promoted_ad", audience: "company", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 1, promotion: "premium", international: false } },
  { slug: "international_ad", audience: "company", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 1, promotion: "none", international: true } },
  { slug: "package_5", audience: "company", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 5, promotion: "none", international: false } },
  { slug: "package_20", audience: "company", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 20, promotion: "none", international: false } },
  { slug: "agency_package", audience: "agency", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 20, promotion: "standard", international: false } },
  { slug: "extra_promotion", audience: "any", priceCents: null, currency: "EUR", active: false,
    entitlement: { adCredits: 0, promotion: "boost", international: false } },
] as const;

export function getAdProduct(slug: string): AdProduct | null {
  return AD_PRODUCTS.find((p) => p.slug === slug) ?? null;
}

/** Products honestly presentable only as "in preparation" (all, today). */
export function inactiveAdProducts(): readonly AdProduct[] {
  return AD_PRODUCTS.filter((p) => !p.active);
}

export interface AdAllowance {
  readonly activeAdLimit: number | "unlimited";
  readonly fromPlan: number | "unlimited";
  readonly fromCredits: number;
}

/**
 * Resolve a customer's total ACTIVE-ad allowance: the plan's finite allowance
 * plus purchased ad credits — unless the plan itself is unlimited (Launch
 * Offer exception / agency SCALE), which short-circuits.
 */
export function resolveActiveAdAllowance(
  plan: Pick<PlanV2, "entitlements">,
  purchasedAdCredits: number,
): AdAllowance {
  const fromPlan = plan.entitlements.activeAdLimit;
  const credits =
    Number.isFinite(purchasedAdCredits) && purchasedAdCredits > 0
      ? Math.floor(purchasedAdCredits)
      : 0;
  if (fromPlan === "unlimited") {
    return { activeAdLimit: "unlimited", fromPlan, fromCredits: credits };
  }
  return {
    activeAdLimit: fromPlan + credits,
    fromPlan,
    fromCredits: credits,
  };
}
