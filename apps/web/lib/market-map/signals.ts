import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  NormalizedSignal,
  Granularity,
  VisibilityLevel,
} from "./signal-model";

/**
 * Market Map read layer — OWNER-SCOPED fetcher ("my signals" / self view).
 *
 * Reads ONLY the caller's own rows via the RLS-scoped Supabase client and
 * normalizes profile / company / preferred / login / company-need / project
 * locations into the common NormalizedSignal shape. RLS guarantees no other
 * user's rows are returned, so every signal here is owned by the caller.
 *
 * This does NOT aggregate across users and ships NO public/market output — a
 * cross-user aggregate needs a future owner-gated privileged source (see
 * docs/audits/market-map-read-layer-v1-audit.md). The pure engine in
 * ./signal-model.ts performs visibility filtering + min-bucket aggregation.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

function norm(country: unknown): string | null {
  if (typeof country !== "string") return null;
  const v = country.trim();
  if (!v) return null;
  return /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : v;
}

const GRAN = new Set(["country", "region", "city"]);
function granularity(v: unknown): Granularity {
  return typeof v === "string" && GRAN.has(v) ? (v as Granularity) : "country";
}

const VIS = new Set([
  "private",
  "self_only",
  "aggregated",
  "region_visible",
  "city_visible",
  "plan_gated",
  "company_only",
  "admin_only",
]);
function visibility(v: unknown, fallback: VisibilityLevel): VisibilityLevel {
  return typeof v === "string" && VIS.has(v) ? (v as VisibilityLevel) : fallback;
}

/**
 * Returns the caller's own normalized market signals, or null when
 * unauthenticated. Never throws; a failing source degrades to fewer signals.
 */
export async function getOwnMarketSignals(): Promise<NormalizedSignal[] | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const uid = user.id;
  const out: NormalizedSignal[] = [];

  // profile_location ─ self_only
  {
    const { data } = await asAny(supabase)
      .from("profiles")
      .select("country, updated_at")
      .eq("id", uid)
      .maybeSingle();
    const country = norm(data?.country);
    if (country) {
      out.push({
        signalId: `profile:${uid}`,
        signalType: "profile_location",
        ownerType: "profile",
        ownerId: uid,
        country,
        region: null,
        city: null,
        granularity: "country",
        visibilityLevel: "self_only",
        count: 1,
        aggregatedCount: null,
        canShowExact: false,
        sourceStatus: "self_declared",
        updatedAt: (data?.updated_at as string | null) ?? null,
      });
    }
  }

  // company_location ─ company_only
  {
    const { data } = await asAny(supabase)
      .from("companies")
      .select("id, country, updated_at")
      .eq("profile_id", uid)
      .maybeSingle();
    const country = norm(data?.country);
    if (country) {
      out.push({
        signalId: `company:${data.id}`,
        signalType: "company_location",
        ownerType: "company",
        ownerId: uid,
        country,
        region: null,
        city: null,
        granularity: "country",
        visibilityLevel: "company_only",
        count: 1,
        aggregatedCount: null,
        canShowExact: false,
        sourceStatus: "registration",
        updatedAt: (data?.updated_at as string | null) ?? null,
      });
    }
  }

  // preferred_location ─ visibility per row
  {
    const { data } = await asAny(supabase)
      .from("preferred_locations")
      .select(
        "id, country_code, region, city, granularity, visibility_level, confirmed_by_user, active, updated_at",
      )
      .eq("profile_id", uid);
    for (const r of Array.isArray(data) ? data : []) {
      if (r.active === false) continue;
      const g = granularity(r.granularity);
      out.push({
        signalId: `preferred:${r.id}`,
        signalType: "preferred_location",
        ownerType: "profile",
        ownerId: uid,
        country: norm(r.country_code),
        region: (r.region as string | null) ?? null,
        city: (r.city as string | null) ?? null,
        granularity: g,
        visibilityLevel: visibility(r.visibility_level, "self_only"),
        count: 1,
        aggregatedCount: null,
        canShowExact: g === "city" && r.confirmed_by_user === true,
        sourceStatus: "self_declared",
        updatedAt: (r.updated_at as string | null) ?? null,
      });
    }
  }

  // login_location ─ approximate, consent-gated, NEVER exact
  {
    const { data } = await asAny(supabase)
      .from("consented_login_location_signals")
      .select(
        "id, country_code, region, city, granularity, precision_level, consent_status, last_seen_at, updated_at",
      )
      .eq("profile_id", uid)
      .maybeSingle();
    const country = norm(data?.country_code);
    if (data && country) {
      const consented = data.consent_status === "consented";
      out.push({
        signalId: `login:${data.id}`,
        signalType: "login_location",
        ownerType: "login",
        ownerId: uid,
        country,
        region: (data.region as string | null) ?? null,
        city: (data.city as string | null) ?? null,
        granularity: granularity(data.granularity),
        // Consented → eligible for aggregated shared output; else self-only.
        visibilityLevel: consented ? "aggregated" : "self_only",
        count: 1,
        aggregatedCount: null,
        canShowExact: false, // login is never an exact point
        sourceStatus: (data.consent_status as string) ?? "not_requested",
        updatedAt:
          (data.updated_at as string | null) ??
          (data.last_seen_at as string | null) ??
          null,
      });
    }
  }

  // company_need_location ─ demand, visibility per row
  {
    const { data } = await asAny(supabase)
      .from("company_demand_locations")
      .select(
        "id, country_code, region, city, granularity, visibility_level, geocode_status, active, updated_at",
      )
      .eq("owner_id", uid);
    for (const r of Array.isArray(data) ? data : []) {
      if (r.active === false) continue;
      const country = norm(r.country_code);
      if (!country) continue;
      const g = granularity(r.granularity);
      out.push({
        signalId: `demand:${r.id}`,
        signalType: "company_need_location",
        ownerType: "demand",
        ownerId: uid,
        country,
        region: (r.region as string | null) ?? null,
        city: (r.city as string | null) ?? null,
        granularity: g,
        visibilityLevel: visibility(r.visibility_level, "company_only"),
        count: 1,
        aggregatedCount: null,
        canShowExact: g === "city" && r.geocode_status === "verified",
        sourceStatus: (r.geocode_status as string) ?? "unknown",
        updatedAt: (r.updated_at as string | null) ?? null,
      });
    }
  }

  // project_location ─ owned via the caller's company
  {
    const { data: company } = await asAny(supabase)
      .from("companies")
      .select("id")
      .eq("profile_id", uid)
      .maybeSingle();
    if (company?.id) {
      const { data } = await asAny(supabase)
        .from("projects")
        .select(
          "id, country, city, granularity, visibility_level, location_confirmed, status, updated_at",
        )
        .eq("company_id", company.id);
      for (const r of Array.isArray(data) ? data : []) {
        const country = norm(r.country);
        if (!country) continue;
        const g = granularity(r.granularity);
        out.push({
          signalId: `project:${r.id}`,
          signalType: "project_location",
          ownerType: "project",
          ownerId: uid,
          country,
          region: null,
          city: (r.city as string | null) ?? null,
          granularity: g,
          visibilityLevel: visibility(r.visibility_level, "company_only"),
          count: 1,
          aggregatedCount: null,
          canShowExact: g === "city" && r.location_confirmed === true,
          sourceStatus: (r.status as string) ?? "unknown",
          updatedAt: (r.updated_at as string | null) ?? null,
        });
      }
    }
  }

  return out;
}
