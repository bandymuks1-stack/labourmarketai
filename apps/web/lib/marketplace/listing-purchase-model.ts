/**
 * Listing purchases — the PURE model of the goods purchase lifecycle
 * (registry 6.13) with its delivery fields (6.14).
 *
 * The owner calls it an "order"; the product vocabulary is a PURCHASE REQUEST
 * on a goods listing, so ONE transaction dictionary survives (service request
 * for services, purchase request for goods — "order" stays out of in-app
 * copy, lib/guards/concept-naming-drift.test.ts).
 *
 * This module mirrors the SQL of migration 20261023160000_listing_purchases_v1
 * exactly (statuses, actions, who may move what, which listings are
 * purchasable, the input bounds) so the client never offers a button the
 * database will refuse. The database stays the authority: every rule here is
 * re-checked by request_listing_purchase_v1 / transition_listing_purchase_v1.
 *
 * NO PAYMENT. `direct_between_parties` is the only payment arrangement: the
 * parties settle payment themselves. A later, owner-armed checkout (MKT-7, two
 * owner acts) adds a member here and widens the SQL CHECK — it never
 * repurposes this one.
 *
 * Pure + deterministic: no IO, no supabase, importable by client and server.
 */

import { domainOfSubject } from "@/lib/marketplace/market-model";

export const PURCHASE_STATUSES = [
  "requested",
  "accepted",
  "fulfilled",
  "declined",
  "cancelled",
] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_ACTIONS = ["accept", "decline", "fulfil", "cancel"] as const;
export type PurchaseAction = (typeof PURCHASE_ACTIONS)[number];

export type PurchaseSide = "buyer" | "seller";

export const FULFILMENT_METHODS = ["pickup", "delivery"] as const;
export type FulfilmentMethod = (typeof FULFILMENT_METHODS)[number];

/** The ONLY payment arrangement today — the honest state, and the extension point. */
export const PAYMENT_ARRANGEMENTS = ["direct_between_parties"] as const;
export type PaymentArrangement = (typeof PAYMENT_ARRANGEMENTS)[number];

export const TERMINAL_PURCHASE_STATUSES: readonly PurchaseStatus[] = [
  "fulfilled",
  "declined",
  "cancelled",
];

export function isPurchaseStatus(v: unknown): v is PurchaseStatus {
  return typeof v === "string" && (PURCHASE_STATUSES as readonly string[]).includes(v);
}

export function isPurchaseAction(v: unknown): v is PurchaseAction {
  return typeof v === "string" && (PURCHASE_ACTIONS as readonly string[]).includes(v);
}

export function isFulfilmentMethod(v: unknown): v is FulfilmentMethod {
  return typeof v === "string" && (FULFILMENT_METHODS as readonly string[]).includes(v);
}

/**
 * The state machine, mirroring transition_listing_purchase_v1:
 *   seller: requested → accept → accepted · requested → decline → declined
 *           accepted → fulfil → fulfilled · accepted → cancel → cancelled
 *   buyer:  requested | accepted → cancel → cancelled
 * Terminal states never move. A person who holds BOTH sides (never true for
 * one purchase: the request RPC refuses a self-purchase) is not modelled.
 */
export function nextPurchaseStatus(
  status: PurchaseStatus,
  action: PurchaseAction,
  side: PurchaseSide,
): PurchaseStatus | null {
  if (TERMINAL_PURCHASE_STATUSES.includes(status)) return null;
  if (side === "seller") {
    if (action === "accept" && status === "requested") return "accepted";
    if (action === "decline" && status === "requested") return "declined";
    if (action === "fulfil" && status === "accepted") return "fulfilled";
    if (action === "cancel" && status === "accepted") return "cancelled";
    return null;
  }
  if (action === "cancel" && (status === "requested" || status === "accepted")) {
    return "cancelled";
  }
  return null;
}

/** The actions a side may take on a purchase in this status (UI buttons). */
export function availablePurchaseActions(
  status: PurchaseStatus,
  side: PurchaseSide,
): PurchaseAction[] {
  return PURCHASE_ACTIONS.filter((a) => nextPurchaseStatus(status, a, side) !== null);
}

/** Work-resource subjects that are movable goods (property is not a goods purchase). */
const PURCHASABLE_WORK_RESOURCES = [
  "vehicle",
  "tools",
  "equipment",
  "machinery",
  "safety_equipment",
] as const;

/**
 * Mirrors the request RPC: a SALE of goods, or of a movable work resource.
 * Rentals and wanted listings, property (accommodation / premises), personal
 * and project-work listings are not goods purchases.
 */
export function isPurchasableListing(input: {
  listingKind: string | null | undefined;
  subject: string | null | undefined;
}): boolean {
  if (input.listingKind !== "sale") return false;
  const domain = domainOfSubject(input.subject);
  if (domain === "goods") return true;
  if (domain === "work_resource") {
    return (PURCHASABLE_WORK_RESOURCES as readonly string[]).includes(input.subject ?? "");
  }
  return false;
}

/**
 * The in-app conversation of a purchase may open while the purchase is live
 * or done (requested / accepted / fulfilled) — never for a declined or
 * cancelled one, which closed the relationship. Mirrors the grant the server
 * action passes (`allowed_listing_purchase`).
 */
export function canOpenPurchaseConversation(status: PurchaseStatus): boolean {
  return status === "requested" || status === "accepted" || status === "fulfilled";
}

export const PURCHASE_LIMITS = {
  note: 2000,
  deliveryLabel: 200,
  carrierNote: 500,
  maxQuantity: 100_000_000_000,
} as const;

export interface ListingPurchaseInput {
  listingId: string;
  quantity: number;
  fulfilmentMethod: FulfilmentMethod;
  note?: string | null;
  deliveryLocationLabel?: string | null;
  deliveryCountry?: string | null;
  /** YYYY-MM-DD, optional. */
  requestedDate?: string | null;
  /** Buy as the governed active organization (the RPC re-checks manages_organization). */
  buyerOrganizationId?: string | null;
}

export type PurchaseInputField =
  | "listingId"
  | "quantity"
  | "fulfilmentMethod"
  | "deliveryLocationLabel"
  | "deliveryCountry"
  | "requestedDate";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Client + server pre-check, mirroring the RPC bounds. `today` is YYYY-MM-DD. */
export function validatePurchaseInput(
  input: ListingPurchaseInput,
  opts: { stock?: number | null; today: string },
): { ok: true } | { ok: false; field: PurchaseInputField } {
  if (!UUID_RE.test(input.listingId ?? "")) return { ok: false, field: "listingId" };
  const q = input.quantity;
  if (typeof q !== "number" || !Number.isFinite(q) || q <= 0 || q >= PURCHASE_LIMITS.maxQuantity) {
    return { ok: false, field: "quantity" };
  }
  if (opts.stock != null && q > opts.stock) return { ok: false, field: "quantity" };
  if (!isFulfilmentMethod(input.fulfilmentMethod)) return { ok: false, field: "fulfilmentMethod" };
  if (input.fulfilmentMethod === "delivery" && !(input.deliveryLocationLabel ?? "").trim()) {
    return { ok: false, field: "deliveryLocationLabel" };
  }
  const country = (input.deliveryCountry ?? "").trim();
  if (country && !/^[A-Za-z]{2}$/.test(country)) return { ok: false, field: "deliveryCountry" };
  const date = (input.requestedDate ?? "").trim();
  if (date) {
    if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) return { ok: false, field: "requestedDate" };
    if (date < opts.today) return { ok: false, field: "requestedDate" };
  }
  return { ok: true };
}

/** Reason tokens the request RPC raises, mapped to copy keys (closed set). */
export const REQUEST_REFUSALS = [
  "listing_not_found",
  "listing_not_active",
  "listing_not_purchasable",
  "cannot_purchase_own_listing",
  "not_authorized_for_organization",
  "invalid_quantity",
  "quantity_exceeds_listing",
  "invalid_fulfilment_method",
  "delivery_place_required",
  "invalid_country",
  "requested_date_in_past",
  "already_requested",
] as const;
export type RequestRefusal = (typeof REQUEST_REFUSALS)[number];

/** Map a database error to a refusal token; unknown → null (generic error copy). */
export function requestRefusalFrom(error: { message?: string; code?: string } | null): RequestRefusal | null {
  if (!error) return null;
  if (error.code === "23505" || /listing_purchases_one_open_idx/.test(error.message ?? "")) {
    return "already_requested";
  }
  const m = (error.message ?? "").trim();
  return (REQUEST_REFUSALS as readonly string[]).includes(m) ? (m as RequestRefusal) : null;
}

/** Tokens the transition RPC returns (never raised). */
export const TRANSITION_RESULTS = [
  "ok",
  "not_found",
  "not_party",
  "not_seller",
  "bad_action",
  "invalid_transition",
] as const;
export type TransitionResult = (typeof TRANSITION_RESULTS)[number];

export function isTransitionResult(v: unknown): v is TransitionResult {
  return typeof v === "string" && (TRANSITION_RESULTS as readonly string[]).includes(v);
}

/** One purchase as a party sees it. Never carries the counterpart's profile id. */
export interface ListingPurchaseRow {
  readonly id: string;
  /** Null when the listing was deleted afterwards (the purchase survives). */
  readonly listingId: string | null;
  readonly side: PurchaseSide;
  /** True when the caller acts for an organization on this side. */
  readonly viaOrganization: boolean;
  readonly listingTitle: string;
  readonly unit: string | null;
  readonly priceAmount: number | null;
  readonly currency: string | null;
  readonly priceText: string | null;
  readonly quantity: number;
  readonly buyerNote: string | null;
  readonly fulfilmentMethod: FulfilmentMethod;
  readonly deliveryLocationLabel: string | null;
  readonly deliveryCountry: string | null;
  readonly requestedDate: string | null;
  readonly carrierNote: string | null;
  readonly paymentArrangement: PaymentArrangement;
  readonly status: PurchaseStatus;
  readonly sellerNote: string | null;
  readonly cancelledBy: PurchaseSide | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * `needs-migration` = the RED migration is not applied yet: the purchase door
 * stays hidden and nothing pretends to work. `unavailable` = a read failed —
 * never rendered as "no purchases" (SEP-7).
 */
export type ListingPurchaseListResult =
  | { kind: "ok"; buying: ListingPurchaseRow[]; selling: ListingPurchaseRow[] }
  | { kind: "needs-migration" }
  | { kind: "unavailable" }
  | { kind: "not-authed" };

export type ListingPurchaseMutateResult =
  | { kind: "ok"; id?: string }
  | { kind: "invalid"; field: PurchaseInputField }
  | { kind: "refused"; reason: RequestRefusal | Exclude<TransitionResult, "ok"> }
  | { kind: "needs-migration" }
  | { kind: "not-authed" }
  | { kind: "error" };

/** Which side the caller is on, from facts the RLS-scoped read already proved. */
export function sideOf(
  row: { buyer_id: string; seller_id: string; buyer_organization_id: string | null; seller_organization_id: string | null },
  userId: string,
  governedOrganizationIds: ReadonlySet<string>,
): { side: PurchaseSide; viaOrganization: boolean } | null {
  if (row.seller_id === userId) return { side: "seller", viaOrganization: false };
  if (row.buyer_id === userId) return { side: "buyer", viaOrganization: false };
  if (row.seller_organization_id && governedOrganizationIds.has(row.seller_organization_id)) {
    return { side: "seller", viaOrganization: true };
  }
  if (row.buyer_organization_id && governedOrganizationIds.has(row.buyer_organization_id)) {
    return { side: "buyer", viaOrganization: true };
  }
  return null;
}
