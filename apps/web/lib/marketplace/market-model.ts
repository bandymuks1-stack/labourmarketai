/**
 * Universal Marketplace — the PURE model (no server-only, no Supabase client).
 *
 * ONE discovery layer over the EXISTING domain tables (owner decision,
 * "Option C"): `marketplace_listings` and `service_offerings` are reused as-is;
 * `market_index_v1` is the single read view over them; `market_subject_types`
 * is the registry that maps a listing's `category` (its SUBJECT) to a DOMAIN;
 * `market_publish_policy_v1` is the policy hook.
 *
 * What this file mirrors (and `lib/guards/marketplace-listings.test.ts` pins
 * against the migration `20261003150300_marketplace_index_v1.sql`):
 *   - the registry (domain -> subjects),
 *   - the direction rule.
 *
 * OWNER DECISION: there is no age / birth / adult field in this model, and no
 * adult-only domain. The model is PERSON + a separate POLICY layer
 * (`publish-policy.ts`, and `market_publish_policy_v1` in the database).
 *
 * NO payment, NO held funds, NO fulfilment: price / quantity are descriptive facts.
 */

import type { ListingKind } from "@/lib/marketplace/listings-model";

/** Domains a LISTING (`marketplace_listings`) can belong to — from the registry. */
export const LISTING_DOMAINS = [
  "work_resource",
  "goods",
  "service_need",
  "personal",
  "project_work",
] as const;
export type ListingDomain = (typeof LISTING_DOMAINS)[number];

/** `service` is the index-only domain of `service_offerings`; `other` is the
 *  honest bucket for a category the registry does not know. */
export type MarketIndexDomain = ListingDomain | "service" | "other";

/** Mirror of the `market_subject_types` seed. One subject, one domain. */
export const SUBJECTS_BY_DOMAIN: Readonly<Record<ListingDomain, readonly string[]>> = {
  work_resource: [
    "accommodation",
    "premises",
    "vehicle",
    "tools",
    "equipment",
    "machinery",
    "safety_equipment",
  ],
  goods: ["goods_food_homegrown", "goods_handmade", "goods_household", "goods_other"],
  service_need: ["service_general", "service_trade", "service_creative", "service_other"],
  personal: ["personal"],
  project_work: ["project_work"],
};

export type MarketSubject = string;

export const ALL_SUBJECTS: readonly string[] = LISTING_DOMAINS.flatMap(
  (d) => SUBJECTS_BY_DOMAIN[d],
);

/** Registry lookup, mirroring the database join. Unknown -> null (never guessed). */
export function domainOfSubject(subject: string | null | undefined): ListingDomain | null {
  if (!subject) return null;
  for (const d of LISTING_DOMAINS) {
    if (SUBJECTS_BY_DOMAIN[d].includes(subject)) return d;
  }
  return null;
}

export function isRegisteredSubject(subject: unknown): subject is string {
  return typeof subject === "string" && domainOfSubject(subject) !== null;
}

/** Same FORMAT rule as the migration's category CHECK. */
export const SUBJECT_FORMAT = /^[a-z][a-z0-9_]{1,40}$/;

export type MarketDirection = "offer" | "need" | "other";

/**
 * Direction of a listing, DERIVED from `listing_kind` — a closed allow-list,
 * mirroring `lib/demand/market-direction.ts`: an unrecognised kind is `other`,
 * NEVER guessed into either side.
 *   wanted        -> need
 *   sale | rental -> offer
 * (`listing_kind` is intentionally NOT widened: no use case needs a fourth kind.)
 */
export function deriveDirection(kind: string | null | undefined): MarketDirection {
  if (kind === "wanted") return "need";
  if (kind === "sale" || kind === "rental") return "offer";
  return "other";
}

/** A free-standing SERVICE NEED is a need by definition; offers of services
 *  live on `service_offerings`. Mirrors `market_publish_policy_v1`. */
export function allowedKindsForDomain(domain: ListingDomain | null): readonly ListingKind[] {
  if (domain === "service_need") return ["wanted"];
  return ["sale", "rental", "wanted"];
}

export function isKindAllowedForSubject(kind: string, subject: string): boolean {
  const allowed = allowedKindsForDomain(domainOfSubject(subject));
  return (allowed as readonly string[]).includes(kind);
}

export type MarketSourceTable = "marketplace_listings" | "service_offerings";

/** Where a domain's rows live in the index. `null` = not in the index. */
export function sourceTableForDomain(domain: MarketIndexDomain): MarketSourceTable | null {
  if (domain === "service") return "service_offerings";
  if (domain === "other") return null;
  return "marketplace_listings";
}

/**
 * Demand stays on its own SECURITY DEFINER RPCs: `customer_requests` and
 * `public_vacancies` are deliberately NOT unioned into the marketplace index.
 */
export const DEMAND_DOMAIN_NOT_INDEXED = "demand domain — not in the marketplace index";
/** Worker supply (people/roster/availability) keeps its own visibility and
 *  contact-permission rules; it is not a listing. */
export const WORKERS_DOMAIN_NOT_INDEXED = "workers domain — not in the marketplace index";

/** What a person can DO with an index row — derived from the source, never stored. */
export type MarketContactAction = "enquire" | "request_service";

export function contactActionFor(source: MarketSourceTable): MarketContactAction {
  return source === "service_offerings" ? "request_service" : "enquire";
}

/**
 * Canonical destination of an index row, using ONLY routes that exist today.
 * Listings have no per-item route: the destination is the listings surface
 * with a `focus` anchor. Service offerings have no per-offering route: the
 * destination is the services surface. Mirrors the view expression.
 */
export function destinationPathFor(source: MarketSourceTable, id: string): string {
  return source === "service_offerings"
    ? "/dashboard/services"
    : `/dashboard/listings?focus=${id}`;
}

// ── Descriptive price / quantity (a stated fact, never a ledger) ────────────

export const CURRENCY_RE = /^[A-Z]{3}$/;

export interface MarketAmountInput {
  priceAmount?: number | null;
  currency?: string | null;
  quantity?: number | null;
  unit?: string | null;
  /** ISO timestamp. */
  expiresAt?: string | null;
}

export type MarketAmountField = "price" | "quantity" | "expiry";

/** Pure validation mirroring the RPC's rules (the RPC remains the authority). */
export function validateAmounts(
  input: MarketAmountInput,
  now: Date = new Date(),
): { ok: true } | { ok: false; field: MarketAmountField } {
  const { priceAmount, currency, quantity, expiresAt } = input;
  if (priceAmount !== null && priceAmount !== undefined) {
    if (!Number.isFinite(priceAmount) || priceAmount < 0 || priceAmount >= 1e12) {
      return { ok: false, field: "price" };
    }
    if (!currency || !CURRENCY_RE.test(currency.trim().toUpperCase())) {
      return { ok: false, field: "price" };
    }
  }
  if (quantity !== null && quantity !== undefined) {
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= 1e11) {
      return { ok: false, field: "quantity" };
    }
  }
  if (expiresAt) {
    const t = Date.parse(expiresAt);
    if (!Number.isFinite(t) || t <= now.getTime()) return { ok: false, field: "expiry" };
  }
  return { ok: true };
}

/** True while a listing is past its `expires_at` (null = never expires). */
export function isExpired(expiresAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  return Number.isFinite(t) && t <= now.getTime();
}
