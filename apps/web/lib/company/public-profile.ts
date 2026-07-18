"use server";

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  isValidBusinessSlug,
  type BusinessPublicSettings,
  type BusinessPublishInput,
  type BusinessPublishResult,
  type PublicBusinessListing,
  type PublicBusinessProfileView,
  type PublicBusinessService,
} from "@/lib/company/public-profile-model";

/**
 * Public business profile (Wagon 13 slice 2) — a read-composition over canonical
 * entities. The PUBLIC reads call SECURITY DEFINER functions that return ONLY an
 * allowlisted set of fields and ONLY for opted-in organizations (default
 * private). Publication is owner/manager-gated inside the write RPC.
 *
 * HONEST DEGRADATION: until the owner applies the business_public_profile
 * migration, the functions/columns are absent — the public page 404s (no
 * profile) and the management panel returns `needs-migration`; nothing is faked.
 */

const ABSENT = new Set(["42P01", "42883", "PGRST202", "PGRST204", "PGRST205", "42703"]);

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

/**
 * Public read (anon-safe): the composed public profile for a slug, or null when
 * no opted-in business owns that slug (→ the page renders a 404). Services and
 * listings come from their own canonical stores, active-only.
 */
export async function getPublicBusinessProfile(
  slug: string,
): Promise<PublicBusinessProfileView | null> {
  const supabase = await createClient();
  const { data: profileRows, error } = await asAny(supabase).rpc(
    "get_public_business_profile_v1",
    { p_slug: slug },
  );
  if (error || !Array.isArray(profileRows) || profileRows.length === 0) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = profileRows[0];
  const orgId: string = p.id;

  const [{ data: svc }, { data: lst }] = await Promise.all([
    asAny(supabase).rpc("get_public_business_services_v1", { p_org_id: orgId }),
    asAny(supabase).rpc("get_public_business_listings_v1", { p_org_id: orgId }),
  ]);

  const services: PublicBusinessService[] = Array.isArray(svc)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      svc.map((s: any) => ({
        id: s.id,
        title: s.title,
        description: s.description ?? null,
        categorySlug: s.category_slug ?? null,
        locationCountry: s.location_country ?? null,
        remote: s.remote === true,
        rateText: s.rate_text ?? null,
      }))
    : [];
  const listings: PublicBusinessListing[] = Array.isArray(lst)
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lst.map((m: any) => ({
        id: m.id,
        listingKind: m.listing_kind,
        category: m.category,
        title: m.title,
        description: m.description ?? null,
        locationCountry: m.location_country ?? null,
        locationLabel: m.location_label ?? null,
        priceText: m.price_text ?? null,
      }))
    : [];

  return {
    profile: {
      id: orgId,
      displayName: p.display_name,
      tagline: p.tagline ?? null,
      description: p.description ?? null,
      country: p.country ?? null,
      website: p.website ?? null,
      contactEmail: p.contact_email ?? null,
      contactPhone: p.contact_phone ?? null,
    },
    services,
    listings,
  };
}

/**
 * Owner/manager read of their OWN org's publication settings (management panel).
 * Reads the org row through the caller's RLS-scoped client (owner-scoped SELECT
 * on organizations), so a caller only ever sees their own org's settings.
 */
export async function getBusinessPublicSettings(
  orgId: string,
): Promise<{ kind: "ok"; settings: BusinessPublicSettings } | { kind: "needs-migration" } | { kind: "not-found" }> {
  const supabase = await createClient();
  const { data, error } = await asAny(supabase)
    .from("organizations")
    .select("public_profile_enabled, public_slug, public_tagline, public_contact_email, public_contact_phone")
    .eq("id", orgId)
    .maybeSingle();
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    return { kind: "not-found" };
  }
  if (!data) return { kind: "not-found" };
  return {
    kind: "ok",
    settings: {
      enabled: data.public_profile_enabled === true,
      slug: data.public_slug ?? null,
      tagline: data.public_tagline ?? null,
      contactEmail: data.public_contact_email ?? null,
      contactPhone: data.public_contact_phone ?? null,
    },
  };
}

/** Publish / update / unpublish the public business profile (owner/manager
 *  gated server-side inside the RPC). */
export async function setBusinessPublicProfileAction(
  input: BusinessPublishInput,
): Promise<BusinessPublishResult> {
  if (input.enabled) {
    const slug = clean(input.slug, 50)?.toLowerCase() ?? "";
    if (!isValidBusinessSlug(slug)) return { kind: "invalid", field: "slug" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "not-authed" };

  const { error } = await asAny(supabase).rpc("set_business_public_profile_v1", {
    p_org_id: input.orgId,
    p_enabled: input.enabled,
    p_slug: clean(input.slug, 50)?.toLowerCase() ?? null,
    p_tagline: clean(input.tagline, 160),
    p_contact_email: clean(input.contactEmail, 200),
    p_contact_phone: clean(input.contactPhone, 40),
  });
  if (error) {
    if (isAbsent(error)) return { kind: "needs-migration" };
    const msg = String(error.message ?? "");
    if (msg.includes("slug taken")) return { kind: "slug-taken" };
    if (msg.includes("invalid slug")) return { kind: "invalid", field: "slug" };
    if (msg.includes("not authorized")) return { kind: "not-authorized" };
    return { kind: "error", message: "publish_failed" };
  }
  revalidatePath("/dashboard/company");
  if (input.slug) revalidatePath(`/business/${input.slug.toLowerCase()}`);
  return { kind: "ok" };
}
