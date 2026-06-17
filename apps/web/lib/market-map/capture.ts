import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Market Map capture v1 — OWNER-SCOPED writes for the three signal sources:
 *   - preferred_locations (where the user WANTS to act)
 *   - consented_login_location_signals (approximate, consent-gated; NO exact)
 *   - company_demand_locations (edit / disable; create stays in the demand flow)
 *
 * Every write goes through the caller's RLS-scoped client and pins
 * profile_id / owner_id = auth.uid(), so RLS authorises it and a user can only
 * ever write their OWN rows. Uses only the user-scoped client (no privileged
 * key), no cross-user read, no coordinates, no fake data. All functions return
 * a tagged result and never throw.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

export type CaptureResult =
  | { kind: "ok"; id?: string }
  | { kind: "unauthenticated" }
  | { kind: "invalid"; message: string }
  | { kind: "not-owner" }
  | { kind: "error"; message: string };

const COUNTRY_RE = /^[A-Z]{2}$/;
const GRANS = ["country", "region", "city"] as const;
const VIS = [
  "private",
  "self_only",
  "aggregated",
  "region_visible",
  "city_visible",
  "plan_gated",
  "company_only",
  "admin_only",
] as const;
const INTENTS = [
  "work",
  "find_job",
  "sell_services",
  "buy_services",
  "join_team",
  "hire_team",
  "project_interest",
  "relocate",
  "remote_if_possible",
] as const;
const PRIORITIES = ["primary", "secondary", "optional"] as const;
const CONSENT = ["not_requested", "consented", "revoked"] as const;

function clampStr(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

// ── preferred_locations ─────────────────────────────────────────────────────
export interface PreferredLocationRow {
  id: string;
  countryCode: string;
  region: string | null;
  city: string | null;
  granularity: string;
  intents: string[];
  priority: string;
  visibilityLevel: string;
  active: boolean;
}

export interface PreferredLocationInput {
  countryCode: string;
  region?: string;
  city?: string;
  granularity?: string;
  intents?: string[];
  priority?: string;
  shortNote?: string;
  visibilityLevel?: string;
}

export async function listOwnPreferredLocations(): Promise<PreferredLocationRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await asAny(supabase)
    .from("preferred_locations")
    .select("id, country_code, region, city, granularity, intents, priority, visibility_level, active")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: true });
  return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    countryCode: String(r.country_code),
    region: (r.region as string | null) ?? null,
    city: (r.city as string | null) ?? null,
    granularity: String(r.granularity),
    intents: Array.isArray(r.intents) ? (r.intents as string[]) : [],
    priority: String(r.priority),
    visibilityLevel: String(r.visibility_level),
    active: r.active !== false,
  }));
}

export async function addPreferredLocation(input: PreferredLocationInput): Promise<CaptureResult> {
  const country = (clampStr(input.countryCode, 2) ?? "").toUpperCase();
  if (!COUNTRY_RE.test(country)) return { kind: "invalid", message: "invalid_country" };
  const granularity = GRANS.includes(input.granularity as never) ? input.granularity! : "country";
  const priority = PRIORITIES.includes(input.priority as never) ? input.priority! : "secondary";
  const visibility = VIS.includes(input.visibilityLevel as never) ? input.visibilityLevel! : "self_only";
  const intents = (input.intents ?? []).filter((i) => INTENTS.includes(i as never));

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const { data, error } = await asAny(supabase)
    .from("preferred_locations")
    .insert({
      profile_id: user.id,
      country_code: country,
      region: clampStr(input.region, 160),
      city: clampStr(input.city, 160),
      granularity,
      intents,
      priority,
      short_note: clampStr(input.shortNote, 280),
      visibility_level: visibility,
    })
    .select("id")
    .maybeSingle();
  if (error) return { kind: "error", message: "save_failed" };
  return { kind: "ok", id: (data?.id as string) ?? "" };
}

export async function updatePreferredLocation(
  id: string,
  patch: Partial<PreferredLocationInput>,
): Promise<CaptureResult> {
  const rowId = clampStr(id, 64);
  if (!rowId) return { kind: "invalid", message: "missing_id" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.region !== undefined) update.region = clampStr(patch.region, 160);
  if (patch.city !== undefined) update.city = clampStr(patch.city, 160);
  if (patch.granularity && GRANS.includes(patch.granularity as never)) update.granularity = patch.granularity;
  if (patch.priority && PRIORITIES.includes(patch.priority as never)) update.priority = patch.priority;
  if (patch.visibilityLevel && VIS.includes(patch.visibilityLevel as never)) update.visibility_level = patch.visibilityLevel;
  if (patch.intents) update.intents = patch.intents.filter((i) => INTENTS.includes(i as never));

  // RLS restricts the row to the owner; the explicit profile_id eq is belt+braces.
  const { error } = await asAny(supabase)
    .from("preferred_locations")
    .update(update)
    .eq("id", rowId)
    .eq("profile_id", user.id);
  if (error) return { kind: "error", message: "update_failed" };
  return { kind: "ok", id: rowId };
}

export async function setPreferredLocationActive(id: string, active: boolean): Promise<CaptureResult> {
  const rowId = clampStr(id, 64);
  if (!rowId) return { kind: "invalid", message: "missing_id" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };
  const { error } = await asAny(supabase)
    .from("preferred_locations")
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .eq("profile_id", user.id);
  if (error) return { kind: "error", message: "update_failed" };
  return { kind: "ok", id: rowId };
}

// ── consented_login_location_signals (approximate, consent-gated) ───────────
export interface LoginConsentRow {
  countryCode: string | null;
  region: string | null;
  city: string | null;
  granularity: string;
  precisionLevel: string;
  consentStatus: string;
}

export async function getOwnLoginConsent(): Promise<LoginConsentRow | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await asAny(supabase)
    .from("consented_login_location_signals")
    .select("country_code, region, city, granularity, precision_level, consent_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    countryCode: (data.country_code as string | null) ?? null,
    region: (data.region as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    granularity: String(data.granularity ?? "country"),
    precisionLevel: String(data.precision_level ?? "country"),
    consentStatus: String(data.consent_status ?? "not_requested"),
  };
}

export interface LoginConsentInput {
  consentStatus: string; // not_requested | consented | revoked
  countryCode?: string;
  region?: string;
  city?: string;
  granularity?: string; // country | region | city — NEVER finer
}

/**
 * Upsert the caller's single login-location signal. Stores ONLY an approximate
 * country/region/city + a consent status. There is no coordinate/address field
 * in the table, so an exact point can never be written here.
 */
export async function setLoginLocationConsent(input: LoginConsentInput): Promise<CaptureResult> {
  const consent = CONSENT.includes(input.consentStatus as never) ? input.consentStatus : null;
  if (!consent) return { kind: "invalid", message: "invalid_consent" };
  const granularity = GRANS.includes(input.granularity as never) ? input.granularity! : "country";
  const country = input.countryCode ? (clampStr(input.countryCode, 2) ?? "").toUpperCase() : null;
  if (country && !COUNTRY_RE.test(country)) return { kind: "invalid", message: "invalid_country" };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };

  const { error } = await asAny(supabase)
    .from("consented_login_location_signals")
    .upsert(
      {
        profile_id: user.id,
        country_code: country ?? "LT",
        region: clampStr(input.region, 160),
        city: clampStr(input.city, 160),
        granularity,
        precision_level: granularity,
        source: "user_confirmed",
        consent_status: consent,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "profile_id" },
    );
  if (error) return { kind: "error", message: "save_failed" };
  return { kind: "ok" };
}

// ── company_demand_locations (edit / disable; create stays in demand flow) ──
export interface OwnDemandRow {
  id: string;
  countryCode: string;
  locationLabel: string;
  needType: string | null;
  visibilityLevel: string;
  active: boolean;
}

export async function listOwnDemandLocations(): Promise<OwnDemandRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await asAny(supabase)
    .from("company_demand_locations")
    .select("id, country_code, location_label, need_type, visibility_level, active")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: true });
  return (Array.isArray(data) ? data : []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    countryCode: String(r.country_code),
    locationLabel: String(r.location_label ?? ""),
    needType: (r.need_type as string | null) ?? null,
    visibilityLevel: String(r.visibility_level ?? "company_only"),
    active: r.active !== false,
  }));
}

export async function setDemandLocationActive(id: string, active: boolean): Promise<CaptureResult> {
  const rowId = clampStr(id, 64);
  if (!rowId) return { kind: "invalid", message: "missing_id" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };
  const { error } = await asAny(supabase)
    .from("company_demand_locations")
    .update({ active: !!active, updated_at: new Date().toISOString() })
    .eq("id", rowId)
    .eq("owner_id", user.id);
  if (error) return { kind: "error", message: "update_failed" };
  return { kind: "ok", id: rowId };
}

const NEED_TYPES = [
  "workers",
  "team",
  "subcontractors",
  "freelancers",
  "service_provider",
  "project_capacity",
  "accommodation_support",
  "transport_support",
] as const;

export async function updateDemandLocation(
  id: string,
  patch: { needType?: string; visibilityLevel?: string },
): Promise<CaptureResult> {
  const rowId = clampStr(id, 64);
  if (!rowId) return { kind: "invalid", message: "missing_id" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { kind: "unauthenticated" };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.needType && NEED_TYPES.includes(patch.needType as never)) update.need_type = patch.needType;
  if (patch.visibilityLevel && VIS.includes(patch.visibilityLevel as never)) update.visibility_level = patch.visibilityLevel;
  const { error } = await asAny(supabase)
    .from("company_demand_locations")
    .update(update)
    .eq("id", rowId)
    .eq("owner_id", user.id);
  if (error) return { kind: "error", message: "update_failed" };
  return { kind: "ok", id: rowId };
}
