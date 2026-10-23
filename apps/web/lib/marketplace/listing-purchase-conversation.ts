"use server";

import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { toActiveLocale } from "@/lib/i18n/config";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import { getWorkspaceContext } from "@/lib/company/active-organization";
import {
  canOpenPurchaseConversation,
  isPurchaseStatus,
  sideOf,
} from "@/lib/marketplace/listing-purchase-model";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

/**
 * Open (or reopen) the buyer ↔ seller conversation of a goods PURCHASE
 * (registry 6.13) — the message thread of the purchase, through the ONE
 * conversation system (no second messaging path).
 *
 * §8.1 discipline, mirroring openServiceRequestConversationAction: the
 * granting fact is verified SERVER-SIDE here — the purchase row is read under
 * the caller's own RLS (only the two parties and the managers of either
 * side's organization can read it), the caller's side is resolved from that
 * row, and the status must still be live or done (requested / accepted /
 * fulfilled). Only then is the explicit `allowed_listing_purchase` grant
 * passed. The counterpart is the OTHER side's person (seller_id or buyer_id);
 * no profile id ever reaches the client.
 *
 * No source stamp: the closed conversation-source set mirrors a DB CHECK and
 * has no purchase member; widening it is owner-gated SQL (residue, named in
 * docs/plans/not-implemented-architecture-2026-10-23.md).
 *
 * Failure never bounces silently: it lands on the messages list with the
 * existing honest `?notice=cannot_open` restricted state.
 */
export async function openListingPurchaseConversationAction(
  formData: FormData,
): Promise<void> {
  const purchaseId = String(formData.get("purchaseId") ?? "");
  // Clamped to the active set: a form-supplied "/evil.com" must never
  // become the protocol-relative redirect "//evil.com/…".
  const locale = toActiveLocale(String(formData.get("locale") ?? ""));
  const cannotOpen = `/${locale}/dashboard/communication?notice=cannot_open`;
  if (!purchaseId) redirect(cannotOpen);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(cannotOpen);

  const { data: row } = await asAny(supabase)
    .from("listing_purchases")
    .select("buyer_id, seller_id, buyer_organization_id, seller_organization_id, status, listing_title")
    .eq("id", purchaseId)
    .maybeSingle();

  const purchase = row as {
    buyer_id: string;
    seller_id: string;
    buyer_organization_id: string | null;
    seller_organization_id: string | null;
    status: string;
    listing_title: string | null;
  } | null;
  const status = purchase?.status;
  if (!purchase || !isPurchaseStatus(status) || !canOpenPurchaseConversation(status)) {
    redirect(cannotOpen);
  }

  const needsOrgs = purchase!.buyer_id !== user!.id && purchase!.seller_id !== user!.id;
  const governed = needsOrgs
    ? new Set(
        (await getWorkspaceContext()).workspaces
          .filter((w) => w.kind === "organization" && (w.relationship === "owner" || w.relationship === "manager"))
          .map((w) => w.id),
      )
    : new Set<string>();
  const who = sideOf(purchase!, user!.id, governed);
  if (!who) redirect(cannotOpen);
  const counterpart = who!.side === "buyer" ? purchase!.seller_id : purchase!.buyer_id;
  if (!counterpart || counterpart === user!.id) redirect(cannotOpen);

  const subject = purchase!.listing_title?.slice(0, 120) ?? null;
  // Passed only AFTER the gate above held.
  const result = await getOrCreateDirectConversation(
    counterpart,
    locale,
    subject,
    "allowed_listing_purchase",
    null,
  );
  if (!result.ok) redirect(cannotOpen);
  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
