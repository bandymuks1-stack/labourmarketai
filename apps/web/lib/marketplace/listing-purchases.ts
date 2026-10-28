"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import {
  PURCHASE_LIMITS,
  isFulfilmentMethod,
  isPurchaseAction,
  isPurchaseStatus,
  isTransitionResult,
  requestRefusalFrom,
  sideOf,
  validatePurchaseInput,
  type ListingPurchaseInput,
  type ListingPurchaseListResult,
  type ListingPurchaseMutateResult,
  type ListingPurchaseRow,
  type PurchaseAction,
} from "@/lib/marketplace/listing-purchase-model";

/**
 * Listing purchases — the goods purchase lifecycle (registry 6.13) with its
 * delivery fields (6.14), over ONE table (`listing_purchases`, migration
 * 20261023161500, RED, owner-applied).
 *
 * Reads go through the caller's RLS-scoped client (the two parties and the
 * managers of either side's organization). Writes go ONLY through the two
 * SECURITY DEFINER RPCs — never an insert/update from here. NO payment: the
 * only payment arrangement is `direct_between_parties`.
 *
 * HONEST DEGRADATION: until the owner applies the migration the table and the
 * RPCs are absent; the list returns `needs-migration`, the pages keep the
 * purchase door hidden, and a write returns `needs-migration`. Never an error
 * page, never a fake row.
 */

// table absent → 42P01 / PGRST205; function absent → 42883 / PGRST202.
const ABSENT = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);
const LISTINGS_PATH = "/[locale]/dashboard/listings";
const BUYER_PATH = "/[locale]/dashboard/buyer";

const COLS =
  "id, listing_id, seller_id, seller_organization_id, buyer_id, buyer_organization_id, listing_title, unit, price_amount, currency, price_text, quantity, buyer_note, fulfilment_method, delivery_location_label, delivery_country, requested_date, carrier_note, payment_arrangement, status, seller_note, cancelled_by, created_at, updated_at";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isAbsent(error: { code?: string } | null): boolean {
  return !!error?.code && ABSENT.has(error.code);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Organizations the caller governs, for labelling the side of a row the RLS
 *  read already admitted. Display only — every write is re-checked in SQL. */
async function governedOrganizationIds(): Promise<Set<string>> {
  const ctx = await getWorkspaceContext();
  return new Set(
    ctx.workspaces
      .filter((w) => w.kind === "organization" && (w.relationship === "owner" || w.relationship === "manager"))
      .map((w) => w.id),
  );
}

/** Every purchase the caller is a party to, split by side, newest first. */
export async function listMyListingPurchases(): Promise<ListingPurchaseListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase)
    .from("listing_purchases")
    .select(COLS)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "unavailable" };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const needsOrgs = rows.some((r) => r.buyer_id !== user.id && r.seller_id !== user.id);
  const governed = needsOrgs ? await governedOrganizationIds() : new Set<string>();

  const buying: ListingPurchaseRow[] = [];
  const selling: ListingPurchaseRow[] = [];
  for (const r of rows) {
    const who = sideOf(
      {
        buyer_id: String(r.buyer_id),
        seller_id: String(r.seller_id),
        buyer_organization_id: (r.buyer_organization_id as string | null) ?? null,
        seller_organization_id: (r.seller_organization_id as string | null) ?? null,
      },
      user.id,
      governed,
    );
    // An admin read (or an org link the workspace list cannot name) is not a
    // party view: it is left out, never guessed into a side.
    if (!who || !isPurchaseStatus(r.status) || !isFulfilmentMethod(r.fulfilment_method)) continue;
    const row: ListingPurchaseRow = {
      id: String(r.id),
      listingId: (r.listing_id as string | null) ?? null,
      side: who.side,
      viaOrganization: who.viaOrganization,
      listingTitle: String(r.listing_title ?? ""),
      unit: (r.unit as string | null) ?? null,
      priceAmount: num(r.price_amount),
      currency: (r.currency as string | null) ?? null,
      priceText: (r.price_text as string | null) ?? null,
      quantity: num(r.quantity) ?? 0,
      buyerNote: (r.buyer_note as string | null) ?? null,
      fulfilmentMethod: r.fulfilment_method,
      deliveryLocationLabel: (r.delivery_location_label as string | null) ?? null,
      deliveryCountry: (r.delivery_country as string | null) ?? null,
      requestedDate: (r.requested_date as string | null) ?? null,
      carrierNote: (r.carrier_note as string | null) ?? null,
      paymentArrangement: "direct_between_parties",
      status: r.status,
      sellerNote: (r.seller_note as string | null) ?? null,
      cancelledBy: r.cancelled_by === "buyer" || r.cancelled_by === "seller" ? r.cancelled_by : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
    (who.side === "buyer" ? buying : selling).push(row);
  }
  return { kind: "ok", buying, selling };
}

/** The buyer's door: request to buy an active goods listing. */
export async function requestListingPurchaseAction(
  input: ListingPurchaseInput,
): Promise<ListingPurchaseMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const today = new Date().toISOString().slice(0, 10);
  const valid = validatePurchaseInput(input, { today });
  if (!valid.ok) return { kind: "invalid", field: valid.field };

  const delivery = input.fulfilmentMethod === "delivery";
  const { data, error } = await asAny(supabase).rpc("request_listing_purchase_v1", {
    p_listing_id: input.listingId,
    p_quantity: input.quantity,
    p_fulfilment_method: input.fulfilmentMethod,
    p_note: clean(input.note, PURCHASE_LIMITS.note),
    p_delivery_location_label: delivery ? clean(input.deliveryLocationLabel, PURCHASE_LIMITS.deliveryLabel) : null,
    p_delivery_country: delivery ? (clean(input.deliveryCountry, 2)?.toUpperCase() ?? null) : null,
    p_requested_date: clean(input.requestedDate, 10),
    p_buyer_organization_id: input.buyerOrganizationId || null,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    const reason = requestRefusalFrom(error);
    return reason ? { kind: "refused", reason } : { kind: "error" };
  }
  revalidatePath(LISTINGS_PATH, "page");
  revalidatePath(BUYER_PATH, "page");
  return { kind: "ok", id: typeof data === "string" ? data : undefined };
}

/** Accept / decline / fulfil (seller side) or cancel (either side, per state). */
export async function transitionListingPurchaseAction(
  id: string,
  action: PurchaseAction,
  note?: string | null,
  carrierNote?: string | null,
): Promise<ListingPurchaseMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };
  if (!isPurchaseAction(action)) return { kind: "refused", reason: "bad_action" };

  const { data, error } = await asAny(supabase).rpc("transition_listing_purchase_v1", {
    p_id: id,
    p_action: action,
    p_note: clean(note, PURCHASE_LIMITS.note),
    p_carrier_note: clean(carrierNote, PURCHASE_LIMITS.carrierNote),
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error" };
  }
  if (!isTransitionResult(data)) return { kind: "error" };
  if (data !== "ok") return { kind: "refused", reason: data };
  revalidatePath(LISTINGS_PATH, "page");
  revalidatePath(BUYER_PATH, "page");
  return { kind: "ok", id };
}
