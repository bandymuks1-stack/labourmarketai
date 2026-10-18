/**
 * Derived ADAPTERS of the canonical plan catalogue (`plan-catalogue.ts`).
 *
 * Each adapter is a pure projection of the catalogue. None of them decides an
 * entitlement (that is `lib/billing/entitlements-v1.ts`, the shared resolver),
 * none holds a figure, none calls a provider. They exist so that DB rows,
 * Stripe slots and, later, mobile store products are all generated from ONE
 * place instead of being maintained as parallel catalogues.
 *
 * Nothing imports this yet: it is an additive seam. No behaviour change.
 */
import { PLAN_CATALOGUE, RETIRED_DB_ROWS, type PlanCatalogueEntry, type PlanCommercial, type RetiredDbRow } from "./plan-catalogue";

// ---------------------------------------------------------------------------
// DB / display adapter
// ---------------------------------------------------------------------------

export interface DbDisplayRow {
  readonly planKey: string;
  readonly dbSlug: string;
  readonly labelKey: string;
  /** Reference to the one home of the figure; the number is never copied. */
  readonly price: PlanCommercial["price"];
  /** Whether the row is expected to be active. Free and sellable rows only. */
  readonly expectActive: boolean;
}

export interface DbDisplayAdapter {
  rows(): readonly DbDisplayRow[];
  retiredRows(): readonly RetiredDbRow[];
}

export const dbDisplayAdapter: DbDisplayAdapter = {
  rows() {
    return PLAN_CATALOGUE.filter((p): p is PlanCatalogueEntry => p.commercial.dbSlug !== null).map((p) => ({
      planKey: p.slug,
      dbSlug: p.commercial.dbSlug as string,
      labelKey: p.labelKey,
      price: p.commercial.price,
      expectActive: p.accessState === "free" || p.launch === "sellable",
    }));
  },
  retiredRows() {
    return RETIRED_DB_ROWS;
  },
};

// ---------------------------------------------------------------------------
// Stripe / payment adapter (slot per plan key)
// ---------------------------------------------------------------------------

export interface PaymentSlot {
  readonly planKey: string;
  /** Slot id; the env var name is resolved only in lib/billing/prices.ts. */
  readonly slotId: string;
  /** Only `sellable` plans may reach checkout; deferred slots stay unset. */
  readonly sellable: boolean;
  readonly currency: PlanCommercial["currency"];
  readonly interval: PlanCommercial["interval"];
  readonly taxBasis: PlanCommercial["taxBasis"];
}

export interface StripePaymentAdapter {
  slots(): readonly PaymentSlot[];
  slotFor(planKey: string): PaymentSlot | null;
}

export const stripePaymentAdapter: StripePaymentAdapter = {
  slots() {
    return PLAN_CATALOGUE.filter((p) => p.commercial.stripeSlot !== null).map((p) => ({
      planKey: p.slug,
      slotId: p.commercial.stripeSlot as string,
      sellable: p.launch === "sellable",
      currency: p.commercial.currency,
      interval: p.commercial.interval,
      taxBasis: p.commercial.taxBasis,
    }));
  },
  slotFor(planKey) {
    return this.slots().find((s) => s.planKey === planKey) ?? null;
  },
};

// ---------------------------------------------------------------------------
// Future mobile-payment adapter: SEAM ONLY (documented, not implemented)
// ---------------------------------------------------------------------------

/**
 * A mobile store (App Store / Play) product for a plan. NOT IMPLEMENTED and not
 * enabled. Contract a future implementation must honour:
 *   1. Product ids are derived from the catalogue plan key, never typed by hand.
 *   2. A store purchase resolves to the SAME `planKey` and therefore the SAME
 *      entitlement via `entitlements-v1`; the store never decides an entitlement.
 *   3. The store transports payment only: it never mints, holds or spends LMC.
 *   4. The amount is the store's own tier; it is never inferred from the DB figure.
 *   5. Receipts are verified server-side and recorded through the same
 *      subscription state machine (`subscription-store.ts`) as Stripe events.
 */
export interface MobilePaymentAdapter {
  productFor(planKey: string): { readonly store: "apple" | "google"; readonly productId: string } | null;
}

/** Deliberately empty: no mobile payment exists. */
export const mobilePaymentAdapter: MobilePaymentAdapter = {
  productFor() {
    return null;
  },
};
