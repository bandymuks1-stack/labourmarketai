import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Market-map SELF-SIGNAL read layer.
 *
 * Every logged-in user must be able to SEE THEMSELVES on the shared market map
 * — a worker/person signal, a company signal, or both — built from REAL profile
 * / worker / company rows the caller already owns (RLS-scoped to auth.uid()).
 *
 * Honesty / safety (PLATFORM_DOCTRINE §7, live-market-map-foundation-v1):
 *   - This is a COUNTRY-LEVEL signal, never a coordinate / marker. No lat/lng is
 *     read or emitted — the shape carries none, so the UI cannot plot a point.
 *   - The country comes from the user's OWN self-declared profile / worker card
 *     / company country. It is labelled "self-declared", never "verified".
 *   - The registration address is deliberately NOT surfaced as a location signal
 *     (mirrors the demand-location rule: the registration address is never a map
 *     point). Only the country is used.
 *   - When no country exists the signal reports `hasLocation: false` so the UI
 *     shows a real location-completion action — never "map is being prepared".
 *
 * Reads go through the caller's authenticated client; any read error degrades to
 * an absent signal rather than throwing, so the map shell stays resilient.
 */

export type SelfSignalKind = "worker" | "company";

export interface SelfSignal {
  readonly kind: SelfSignalKind;
  /** Display name — profile full name (worker) or company display/legal name. */
  readonly name: string | null;
  /** Self-declared country. Normalized to an upper-case ISO-2 code when it looks
   *  like one; otherwise the raw stored value (so a free-text country still
   *  renders honestly). Null when the user has not set a country. */
  readonly countryCode: string | null;
  /** True when a usable country exists — the only gate between "show me on the
   *  map" and "complete your location". */
  readonly hasLocation: boolean;
}

export interface SelfSignalBoard {
  /** The person/worker signal. Always present for an authenticated user — every
   *  account has a profile — but `hasLocation` may be false. */
  readonly worker: SelfSignal;
  /** The company signal — only when the caller owns a company row. */
  readonly company: SelfSignal | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(c: SupabaseClient): any {
  return c;
}

/** Normalize a stored country value: trim, and upper-case when it is a plain
 *  2-letter code. Returns null for empty input. Never invents a value. */
function normalizeCountry(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  return /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : v;
}

function firstNonEmpty(...values: (string | null)[]): string | null {
  for (const v of values) {
    if (v) return v;
  }
  return null;
}

/**
 * Build the caller's own self-signals from real rows. Returns null only when
 * unauthenticated; otherwise always returns a board with a worker signal (whose
 * `hasLocation` may be false → location-completion CTA).
 */
export async function getOwnSelfSignals(): Promise<SelfSignalBoard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // ── Profile (always exists for an authed user) ────────────────────────────
  let profileName: string | null = null;
  let profileCountry: string | null = null;
  {
    const { data } = await asAny(supabase)
      .from("profiles")
      .select("full_name, country")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      profileName = (data.full_name as string | null)?.trim() || null;
      profileCountry = normalizeCountry(data.country);
    }
  }

  // ── Worker card location (richer person signal; optional) ─────────────────
  // Prefer the worker's current location, else their first preferred country,
  // else the profile country. Degrades silently if the worker row is absent.
  let workerCountry: string | null = null;
  {
    const { data } = await asAny(supabase)
      .from("workers")
      .select("current_location_country, preferred_countries")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (data) {
      const current = normalizeCountry(data.current_location_country);
      const preferredList = Array.isArray(data.preferred_countries)
        ? (data.preferred_countries as string[])
        : [];
      const preferred = normalizeCountry(preferredList[0]);
      workerCountry = firstNonEmpty(current, preferred);
    }
  }

  const workerCountryCode = firstNonEmpty(workerCountry, profileCountry);
  const worker: SelfSignal = {
    kind: "worker",
    name: profileName,
    countryCode: workerCountryCode,
    hasLocation: !!workerCountryCode,
  };

  // ── Company signal (only when the caller owns a company) ──────────────────
  let company: SelfSignal | null = null;
  {
    const { data } = await asAny(supabase)
      .from("companies")
      .select("display_name, legal_name, country")
      .eq("profile_id", user.id)
      .maybeSingle();
    if (data) {
      const name = firstNonEmpty(
        (data.display_name as string | null)?.trim() || null,
        (data.legal_name as string | null)?.trim() || null,
      );
      const countryCode = normalizeCountry(data.country);
      company = {
        kind: "company",
        name,
        countryCode,
        hasLocation: !!countryCode,
      };
    }
  }

  return { worker, company };
}
