"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import {
  isListingCategory,
  isListingKind,
  isListingStatus,
  type MarketplaceDiscoveryResult,
  type MarketplaceDiscoveryRow,
  type MarketplaceListingInput,
  type MarketplaceListingListResult,
  type MarketplaceListingMutateResult,
  type MarketplaceListingRow,
} from "@/lib/marketplace/listings-model";

/**
 * Marketplace listings (Wagon 13, slice 1) — work-resource listings for sale /
 * rent / wanted (accommodation, premises, vehicles, tools, equipment,
 * machinery, safety equipment). Bounded to work & projects, never generic
 * consumer classifieds.
 *
 * Reads go through the caller's RLS-scoped client (the SELECT policy returns
 * `active` rows to any authenticated user, plus the caller's own drafts).
 * Writes go ONLY through the owner-gated SECURITY DEFINER RPCs. Enquiries reuse
 * the canonical conversation bridge — no second messaging path.
 *
 * HONEST DEGRADATION: the migration is owner-applied (RED). Until it is applied
 * the table/RPCs are absent — every function returns `needs-migration` and the
 * UI shows a calm "not available yet" state, never an error and never fake rows.
 */

// table absent → 42P01 / PGRST205; function absent → 42883 / PGRST202.
const ABSENT = new Set(["42P01", "42883", "PGRST202", "PGRST204", "PGRST205"]);

const MAX_TITLE = 160;
const MAX_DESC = 2000;
const MAX_LABEL = 120;
const MAX_PRICE = 80;
const COUNTRY_RE = /^[A-Z]{2}$/;
const LISTINGS_PATH = "/dashboard/listings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function isAbsent(error: { code?: string } | null): boolean {
  return !!error?.code && ABSENT.has(error.code);
}

function clean(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): MarketplaceListingRow {
  return {
    id: r.id,
    ownerId: r.owner_id,
    organizationId: r.organization_id ?? null,
    projectId: r.project_id ?? null,
    listingKind: r.listing_kind,
    category: r.category,
    title: r.title,
    description: r.description ?? null,
    locationCountry: r.location_country ?? null,
    locationLabel: r.location_label ?? null,
    priceText: r.price_text ?? null,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const SELECT_COLS =
  "id, owner_id, organization_id, project_id, listing_kind, category, title, description, location_country, location_label, price_text, status, created_at, updated_at";

/** The caller's OWN listings (every status), newest first. */
export async function listMyMarketplaceListings(): Promise<MarketplaceListingListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase)
    .from("marketplace_listings")
    .select(SELECT_COLS)
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [] };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { kind: "ok", rows: (data ?? []).map((r: any) => mapRow(r)) };
}

/** Discovery: ACTIVE listings (RLS returns active + own). `isMine` lets the UI
 *  hide the enquiry control on the caller's own rows. Optional bounded filters. */
export async function discoverMarketplaceListings(filters?: {
  category?: string;
  listingKind?: string;
}): Promise<MarketplaceDiscoveryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  let q = asAny(supabase)
    .from("marketplace_listings")
    .select(SELECT_COLS)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters?.category && isListingCategory(filters.category)) {
    q = q.eq("category", filters.category);
  }
  if (filters?.listingKind && isListingKind(filters.listingKind)) {
    q = q.eq("listing_kind", filters.listingKind);
  }

  const { data, error } = await q;
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [] };
  }
  const rows: MarketplaceDiscoveryRow[] = (data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => ({ ...mapRow(r), isMine: r.owner_id === user.id }),
  );
  return { kind: "ok", rows };
}

function validate(
  input: MarketplaceListingInput,
): { ok: true } | { ok: false; field: string } {
  if (!isListingKind(input.listingKind)) return { ok: false, field: "listingKind" };
  if (!isListingCategory(input.category)) return { ok: false, field: "category" };
  const title = clean(input.title, MAX_TITLE);
  if (!title || title.length < 3) return { ok: false, field: "title" };
  const country = clean(input.locationCountry, 2)?.toUpperCase() ?? null;
  if (country !== null && !COUNTRY_RE.test(country)) {
    return { ok: false, field: "locationCountry" };
  }
  return { ok: true };
}

export async function createMarketplaceListingAction(
  input: MarketplaceListingInput,
): Promise<MarketplaceListingMutateResult> {
  const v = validate(input);
  if (!v.ok) return { kind: "invalid", field: v.field };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { data, error } = await asAny(supabase).rpc("create_marketplace_listing_v1", {
    p_listing_kind: input.listingKind,
    p_category: input.category,
    p_title: clean(input.title, MAX_TITLE),
    p_description: clean(input.description, MAX_DESC),
    p_location_country: clean(input.locationCountry, 2)?.toUpperCase() ?? null,
    p_location_label: clean(input.locationLabel, MAX_LABEL),
    p_price_text: clean(input.priceText, MAX_PRICE),
    p_organization_id: input.organizationId ?? null,
    p_project_id: input.projectId ?? null,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: "create_failed" };
  }
  revalidatePath(LISTINGS_PATH);
  return { kind: "ok", id: typeof data === "string" ? data : undefined };
}

export async function updateMarketplaceListingAction(
  id: string,
  input: MarketplaceListingInput,
): Promise<MarketplaceListingMutateResult> {
  const v = validate(input);
  if (!v.ok) return { kind: "invalid", field: v.field };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { error } = await asAny(supabase).rpc("update_marketplace_listing_v1", {
    p_id: id,
    p_title: clean(input.title, MAX_TITLE),
    p_category: input.category,
    p_listing_kind: input.listingKind,
    p_description: clean(input.description, MAX_DESC),
    p_location_country: clean(input.locationCountry, 2)?.toUpperCase() ?? null,
    p_location_label: clean(input.locationLabel, MAX_LABEL),
    p_price_text: clean(input.priceText, MAX_PRICE),
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: "update_failed" };
  }
  revalidatePath(LISTINGS_PATH);
  return { kind: "ok", id };
}

export async function setMarketplaceListingStatusAction(
  id: string,
  status: string,
): Promise<MarketplaceListingMutateResult> {
  if (!isListingStatus(status)) return { kind: "invalid", field: "status" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { error } = await asAny(supabase).rpc("set_marketplace_listing_status_v1", {
    p_id: id,
    p_status: status,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: "status_failed" };
  }
  revalidatePath(LISTINGS_PATH);
  return { kind: "ok", id };
}

export async function deleteMarketplaceListingAction(
  id: string,
): Promise<MarketplaceListingMutateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { error } = await asAny(supabase).rpc("delete_marketplace_listing_v1", {
    p_id: id,
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "error", message: "delete_failed" };
  }
  revalidatePath(LISTINGS_PATH);
  return { kind: "ok", id };
}

/**
 * Enquire about an ACTIVE listing — the marketplace's contact step, reusing the
 * canonical conversation bridge (no second messaging path). §8.1 discipline,
 * mirroring openServiceRequestConversationAction: the granting fact is verified
 * SERVER-SIDE (listing exists, is `active`, caller is not the owner); only then
 * is the explicit `allowed_marketplace_enquiry` grant passed to
 * getOrCreateDirectConversation. No source stamp is passed (the closed source
 * vocabulary mirrors a DB CHECK constraint — an enquiry needs none). The
 * owner's id never reaches the client.
 */
export async function enquireAboutListingAction(formData: FormData): Promise<void> {
  const listingId = String(formData.get("listingId") ?? "");
  const locale = String(formData.get("locale") ?? "lt");
  const cannotOpen = `/${locale}/dashboard/communication?notice=cannot_open`;
  if (!listingId) redirect(cannotOpen);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(cannotOpen);

  const { data: row } = await asAny(supabase)
    .from("marketplace_listings")
    .select("owner_id, status, title")
    .eq("id", listingId)
    .maybeSingle();

  const listing = row as
    | { owner_id: string; status: string; title: string | null }
    | null;
  if (!listing || listing.status !== "active") redirect(cannotOpen);
  if (listing.owner_id === user!.id) redirect(cannotOpen); // never enquire to self

  const subject = listing.title?.slice(0, 120) ?? null;
  // The grant alone opens the thread. No source stamp is passed: the closed
  // conversation-source vocabulary mirrors a DB CHECK constraint, and a
  // marketplace enquiry needs no second DB change to have a real conversation.
  const result = await getOrCreateDirectConversation(
    listing.owner_id,
    locale,
    subject,
    "allowed_marketplace_enquiry",
    null,
  );
  if (!result.ok) redirect(cannotOpen);
  redirect(`/${locale}/dashboard/communication/${result.data.id}`);
}
