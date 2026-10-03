"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hideQaMarked, isQaViewer } from "@/lib/marketplace/qa-marked";
import { getOrCreateDirectConversation } from "@/lib/communication/direct-conversation";
import {
  isListingCategory,
  isListingKind,
  isListingStatus,
  type ListingStatus,
  type MarketplaceDiscoveryResult,
  type MarketplaceDiscoveryRow,
  type MarketplaceListingInput,
  type MarketplaceListingListResult,
  type MarketplaceListingMutateResult,
  type MarketplaceListingRow,
} from "@/lib/marketplace/listings-model";
import {
  contactActionFor,
  destinationPathFor,
  deriveDirection,
  isKindAllowedForSubject,
  isRegisteredSubject,
  isExpired,
  validateAmounts,
  LISTING_DOMAINS,
} from "@/lib/marketplace/market-model";
import { assessPublish } from "@/lib/marketplace/publish-policy";

/**
 * Marketplace listings — the universal marketplace's write + read module.
 * Work resources, goods, free-standing SERVICE NEEDS, personal and project /
 * contract listings over the existing `marketplace_listings` table, plus ONE
 * shared discovery read (`market_index_v1`, which also carries active
 * `service_offerings`). NO payment, NO held funds, NO fulfilment.
 *
 * Reads go through the caller's RLS-scoped client (active + not-expired rows,
 * plus the caller's own). Writes go ONLY through the owner-gated SECURITY
 * DEFINER RPCs; the v2 RPCs call `market_publish_policy_v1` before writing.
 * Enquiries reuse the canonical conversation bridge — no second messaging path.
 *
 * HONEST DEGRADATION: the migration is owner-applied (RED). Until then:
 *   - reads fall back to the legacy columns / table (`extended: false`, work
 *     resources only) — probing 42703 (undefined column), 42P01 (no relation),
 *     42883 (no function);
 *   - a write that needs only v1 features still works through the v1 RPCs;
 *   - a write that needs the new columns / RPCs returns `needs-migration`.
 * Never an error, never a fake row.
 */

// table / view absent → 42P01 / PGRST205; function absent → 42883 / PGRST202;
// column absent → 42703 / PGRST204.
const ABSENT = new Set(["42P01", "42883", "42703", "PGRST202", "PGRST204", "PGRST205"]);

const MAX_TITLE = 160;
const MAX_DESC = 2000;
const MAX_LABEL = 120;
const MAX_PRICE = 80;
const MAX_UNIT = 24;
const COUNTRY_RE = /^[A-Z]{2}$/;
const LISTINGS_PATH = "/[locale]/dashboard/listings";

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

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
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
    priceAmount: num(r.price_amount),
    currency: r.currency ?? null,
    quantity: num(r.quantity),
    unit: r.unit ?? null,
    expiresAt: r.expires_at ?? null,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const LEGACY_COLS =
  "id, owner_id, organization_id, project_id, listing_kind, category, title, description, location_country, location_label, price_text, status, created_at, updated_at";
const EXTENDED_COLS = `${LEGACY_COLS}, price_amount, currency, quantity, unit, expires_at`;

const INDEX_COLS =
  "origin_table, origin_id, owner_id, organization_id, domain, subject, direction, title, description, location_country, location_label, price_text, price_amount, currency, quantity, unit, expires_at, created_at, updated_at, destination_path, contact_action";

/** The caller's OWN listings (every status), newest first. */
export async function listMyMarketplaceListings(): Promise<MarketplaceListingListResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const run = (cols: string) =>
    asAny(supabase)
      .from("marketplace_listings")
      .select(cols)
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

  let extended = true;
  let { data, error } = await run(EXTENDED_COLS);
  if (error?.code === "42703" || error?.code === "PGRST204") {
    // new columns absent → legacy shape, honestly flagged.
    extended = false;
    ({ data, error } = await run(LEGACY_COLS));
  }
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [], extended };
  }
  return {
    kind: "ok",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rows: (data ?? []).map((r: any) => mapRow(r)),
    extended,
  };
}

/**
 * Discovery: ONE read over `market_index_v1` (active + not-expired listings AND
 * active service offerings, each branch under its own RLS). `isMine` lets the
 * UI hide the enquiry control on the caller's own rows. Optional bounded filters.
 *
 * Before the migration the view is absent: fall back to the legacy table read
 * (work resources only, `extended: false`).
 */
export async function discoverMarketplaceListings(filters?: {
  domain?: string;
  category?: string;
  listingKind?: string;
}): Promise<MarketplaceDiscoveryResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const domainFilter =
    filters?.domain && (filters.domain === "service" || (LISTING_DOMAINS as readonly string[]).includes(filters.domain))
      ? filters.domain
      : null;

  let q = asAny(supabase)
    .from("market_index_v1")
    .select(INDEX_COLS)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (domainFilter) q = q.eq("domain", domainFilter);
  if (filters?.category && isRegisteredSubject(filters.category)) {
    q = q.eq("subject", filters.category);
  }
  if (filters?.listingKind && isListingKind(filters.listingKind)) {
    q = q.eq("direction", deriveDirection(filters.listingKind));
  }

  const { data, error } = await q;
  if (!error) {
    const rows: MarketplaceDiscoveryRow[] = (data ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (r: any) => ({
        sourceTable: r.origin_table,
        id: r.origin_id,
        ownerId: r.owner_id,
        organizationId: r.organization_id ?? null,
        domain: r.domain,
        subject: r.subject ?? null,
        direction: r.direction,
        title: r.title,
        description: r.description ?? null,
        locationCountry: r.location_country ?? null,
        locationLabel: r.location_label ?? null,
        priceText: r.price_text ?? null,
        priceAmount: num(r.price_amount),
        currency: r.currency ?? null,
        quantity: num(r.quantity),
        unit: r.unit ?? null,
        expiresAt: r.expires_at ?? null,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        destinationPath: r.destination_path,
        contactAction: r.contact_action,
        isMine: r.owner_id === user.id,
      }),
    );
    return {
      kind: "ok",
      rows: hideQaMarked(rows, isQaViewer(user), (r) => [r.title, r.description]),
      extended: true,
    };
  }
  if (!isAbsent(error)) return { kind: "ok", rows: [], extended: true };

  // Legacy fallback (index view not applied yet): work resources only.
  if (domainFilter && domainFilter !== "work_resource") {
    return { kind: "ok", rows: [], extended: false };
  }
  let lq = asAny(supabase)
    .from("marketplace_listings")
    .select(LEGACY_COLS)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filters?.category && isListingCategory(filters.category)) {
    lq = lq.eq("category", filters.category);
  }
  if (filters?.listingKind && isListingKind(filters.listingKind)) {
    lq = lq.eq("listing_kind", filters.listingKind);
  }
  const legacy = await lq;
  if (legacy.error) {
    if (isAbsent(legacy.error)) return { kind: "needs-migration" };
    return { kind: "ok", rows: [], extended: false };
  }
  const rows: MarketplaceDiscoveryRow[] = (legacy.data ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (r: any) => {
      const m = mapRow(r);
      return {
        sourceTable: "marketplace_listings" as const,
        id: m.id,
        ownerId: m.ownerId,
        organizationId: m.organizationId,
        domain: "work_resource",
        subject: m.category,
        direction: deriveDirection(m.listingKind),
        title: m.title,
        description: m.description,
        locationCountry: m.locationCountry,
        locationLabel: m.locationLabel,
        priceText: m.priceText,
        priceAmount: null,
        currency: null,
        quantity: null,
        unit: null,
        expiresAt: null,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        destinationPath: destinationPathFor("marketplace_listings", m.id),
        contactAction: contactActionFor("marketplace_listings"),
        isMine: m.ownerId === user.id,
      };
    },
  );
  // QA-labelled rows never reach real people (shared rule); a QA viewer
  // still sees them.
  return {
    kind: "ok",
    rows: hideQaMarked(rows, isQaViewer(user), (r) => [r.title, r.description]),
    extended: false,
  };
}

function validate(
  input: MarketplaceListingInput,
): { ok: true } | { ok: false; field: string } {
  if (!isListingKind(input.listingKind)) return { ok: false, field: "listingKind" };
  if (!isRegisteredSubject(input.category)) return { ok: false, field: "category" };
  if (!isKindAllowedForSubject(input.listingKind, input.category)) {
    return { ok: false, field: "listingKind" };
  }
  const title = clean(input.title, MAX_TITLE);
  if (!title || title.length < 3) return { ok: false, field: "title" };
  const country = clean(input.locationCountry, 2)?.toUpperCase() ?? null;
  if (country !== null && !COUNTRY_RE.test(country)) {
    return { ok: false, field: "locationCountry" };
  }
  const amounts = validateAmounts({
    priceAmount: input.priceAmount,
    currency: input.currency,
    quantity: input.quantity,
    expiresAt: input.expiresAt,
  });
  if (!amounts.ok) return { ok: false, field: amounts.field };
  return { ok: true };
}

/** Does this input need anything the v1 RPCs cannot carry? */
function needsV2(input: MarketplaceListingInput): boolean {
  return (
    !isListingCategory(input.category) ||
    input.priceAmount != null ||
    input.currency != null ||
    input.quantity != null ||
    !!clean(input.unit, MAX_UNIT) ||
    !!input.expiresAt
  );
}

function amountParams(input: MarketplaceListingInput) {
  const hasPrice = input.priceAmount != null;
  return {
    p_price_amount: hasPrice ? input.priceAmount : null,
    p_currency: hasPrice ? (clean(input.currency, 3)?.toUpperCase() ?? null) : null,
    p_quantity: input.quantity ?? null,
    p_unit: clean(input.unit, MAX_UNIT),
    p_expires_at: input.expiresAt ? new Date(input.expiresAt).toISOString() : null,
  };
}

/** The v2 RPC / backstop trigger raises `publish not allowed: <reason>`. */
function policyReason(error: { message?: string } | null): string | null {
  const m = /publish not allowed: (\w+)/.exec(error?.message ?? "");
  return m ? m[1] : null;
}

export async function createMarketplaceListingAction(
  input: MarketplaceListingInput,
): Promise<MarketplaceListingMutateResult> {
  const v = validate(input);
  if (!v.ok) return { kind: "invalid", field: v.field };

  // Policy (TypeScript half). A restricted subject is refused outright; a
  // LEGAL_CHECK_REQUIRED listing may be DRAFTED — publishing asks for the
  // person's confirmation (see setMarketplaceListingStatusAction).
  const verdict = assessPublish({
    subject: input.category,
    listingKind: input.listingKind,
    title: input.title,
    description: input.description,
  });
  if (verdict.kind === "CHANNEL_RESTRICTED") {
    return { kind: "restricted", reasonKey: verdict.reasonKey ?? "category_not_supported" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const base = {
    p_listing_kind: input.listingKind,
    p_category: input.category,
    p_title: clean(input.title, MAX_TITLE),
    p_description: clean(input.description, MAX_DESC),
    p_location_country: clean(input.locationCountry, 2)?.toUpperCase() ?? null,
    p_location_label: clean(input.locationLabel, MAX_LABEL),
    p_price_text: clean(input.priceText, MAX_PRICE),
    p_organization_id: input.organizationId ?? null,
    p_project_id: input.projectId ?? null,
  };

  let { data, error } = await asAny(supabase).rpc("create_marketplace_listing_v2", {
    ...base,
    ...amountParams(input),
  });
  if (error && isAbsent(error) && !needsV2(input)) {
    // v2 not applied yet and nothing here needs it → the frozen v1 path.
    ({ data, error } = await asAny(supabase).rpc("create_marketplace_listing_v1", base));
  }
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    const reason = policyReason(error);
    if (reason) return { kind: "restricted", reasonKey: reason };
    return { kind: "error", message: "create_failed" };
  }
  revalidatePath(LISTINGS_PATH, "page");
  return { kind: "ok", id: typeof data === "string" ? data : undefined };
}

export async function updateMarketplaceListingAction(
  id: string,
  input: MarketplaceListingInput,
  legalCheckAcknowledged = false,
): Promise<MarketplaceListingMutateResult> {
  const v = validate(input);
  if (!v.ok) return { kind: "invalid", field: v.field };

  const verdict = assessPublish({
    subject: input.category,
    listingKind: input.listingKind,
    title: input.title,
    description: input.description,
  });
  if (verdict.kind === "CHANNEL_RESTRICTED") {
    return { kind: "restricted", reasonKey: verdict.reasonKey ?? "category_not_supported" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  // An edit must not slip a food listing past the check while it is LIVE.
  if (verdict.kind === "LEGAL_CHECK_REQUIRED" && !legalCheckAcknowledged) {
    const { data: cur } = await asAny(supabase)
      .from("marketplace_listings")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (cur?.status === "active") {
      return { kind: "legal-check-required", legalCheckKey: verdict.legalCheckKey ?? "food_sale_rules" };
    }
  }

  const base = {
    p_id: id,
    p_title: clean(input.title, MAX_TITLE),
    p_category: input.category,
    p_listing_kind: input.listingKind,
    p_description: clean(input.description, MAX_DESC),
    p_location_country: clean(input.locationCountry, 2)?.toUpperCase() ?? null,
    p_location_label: clean(input.locationLabel, MAX_LABEL),
    p_price_text: clean(input.priceText, MAX_PRICE),
  };

  let { error } = await asAny(supabase).rpc("update_marketplace_listing_v2", {
    ...base,
    ...amountParams(input),
  });
  if (error && isAbsent(error) && !needsV2(input)) {
    ({ error } = await asAny(supabase).rpc("update_marketplace_listing_v1", base));
  }
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    const reason = policyReason(error);
    if (reason) return { kind: "restricted", reasonKey: reason };
    return { kind: "error", message: "update_failed" };
  }
  revalidatePath(LISTINGS_PATH, "page");
  return { kind: "ok", id };
}

export async function setMarketplaceListingStatusAction(
  id: string,
  status: string,
  legalCheckAcknowledged = false,
): Promise<MarketplaceListingMutateResult> {
  if (!isListingStatus(status)) return { kind: "invalid", field: "status" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  if (status === "active") {
    // Publishing is where the policy bites (the RPC and the DB trigger apply
    // the registry half; the text-aware half is here).
    const { data: row } = await asAny(supabase)
      .from("marketplace_listings")
      .select("category, listing_kind, title, description, owner_id")
      .eq("id", id)
      .maybeSingle();
    if (row && row.owner_id === user.id) {
      const verdict = assessPublish({
        subject: row.category,
        listingKind: row.listing_kind,
        title: row.title,
        description: row.description,
      });
      if (verdict.kind === "CHANNEL_RESTRICTED") {
        return { kind: "restricted", reasonKey: verdict.reasonKey ?? "category_not_supported" };
      }
      if (verdict.kind === "LEGAL_CHECK_REQUIRED" && !legalCheckAcknowledged) {
        return {
          kind: "legal-check-required",
          legalCheckKey: verdict.legalCheckKey ?? "food_sale_rules",
        };
      }
    }
  }

  let { error } = await asAny(supabase).rpc("set_marketplace_listing_status_v2", {
    p_id: id,
    p_status: status,
  });
  if (error && isAbsent(error) && status !== "paused") {
    ({ error } = await asAny(supabase).rpc("set_marketplace_listing_status_v1", {
      p_id: id,
      p_status: status as ListingStatus,
    }));
  }
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    const reason = policyReason(error);
    if (reason) return { kind: "restricted", reasonKey: reason };
    return { kind: "error", message: "status_failed" };
  }
  revalidatePath(LISTINGS_PATH, "page");
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
  revalidatePath(LISTINGS_PATH, "page");
  return { kind: "ok", id };
}

/**
 * Enquire about an ACTIVE, not-expired listing — the marketplace's contact
 * step, reusing the canonical conversation bridge (no second messaging path).
 * §8.1 discipline, mirroring openServiceRequestConversationAction: the granting
 * fact is verified SERVER-SIDE (listing exists, is `active` and not expired,
 * caller is not the owner); only then is the explicit
 * `allowed_marketplace_enquiry` grant passed to getOrCreateDirectConversation.
 * No source stamp is passed (the closed source vocabulary mirrors a DB CHECK
 * constraint — an enquiry needs none). The owner's id never reaches the client.
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

  const first = await asAny(supabase)
    .from("marketplace_listings")
    .select("owner_id, status, title, expires_at")
    .eq("id", listingId)
    .maybeSingle();
  // expires_at absent (pre-migration): read without it.
  const row = first.error
    ? (
        await asAny(supabase)
          .from("marketplace_listings")
          .select("owner_id, status, title")
          .eq("id", listingId)
          .maybeSingle()
      ).data
    : first.data;

  const listing = row as
    | { owner_id: string; status: string; title: string | null; expires_at?: string | null }
    | null;
  if (!listing || listing.status !== "active") redirect(cannotOpen);
  if (isExpired(listing.expires_at)) redirect(cannotOpen);
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
