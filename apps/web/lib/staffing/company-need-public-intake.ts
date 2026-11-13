import "server-only";

import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseClientEnv } from "@/lib/env";
import { clientKeyFromHeaders } from "@/lib/security/rate-limit";
import {
  publicIntakeRateLimited,
  recordPublicFormRefusal,
  screenIntakeContent,
  type SpamReason,
} from "@/lib/security/public-form-guard";

/**
 * Anonymous structured company-demand persistence (v1).
 *
 * Calls the SECURITY DEFINER RPC `submit_company_need_public_v1` through the
 * ANON client — the RPC is the ONLY anon write path (the dedicated table
 * `company_need_public_intakes` has RLS on and no anon policies). The RPC
 * validates every field server-side (closed enum sets, length caps, the
 * PR #675 10-market country list) and inserts one `status='new'` row.
 *
 * HONEST DEGRADATION: until the owner-gated migration is applied to prod via
 * Supabase MCP, the function does not exist (42883) / the table does not
 * exist (42P01). We surface that as `code: "unavailable"` so the caller can
 * fall back to the honest "prepared — create an account to submit" state
 * instead of claiming a false success. No outbound side effects here: the two
 * callers raise the internal alert (`notifyTeamOfStoredIntake`) for a stored row.
 *
 * The client is intentionally UNTYPED for the RPC call: the generated
 * Database types do not yet include this not-applied function, and typing it
 * would require regenerating types against the prod schema.
 */

export type PublicIntakeInput = {
  readonly locale: string;
  readonly companyName: string;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly country: string;
  readonly cityRegion?: string;
  readonly sector: string;
  readonly headcount: number;
  readonly startWindow?: string;
  readonly expectedDuration?: string;
  readonly urgency: string;
  readonly accommodation: string;
  readonly transportNeeded: boolean;
  readonly languages?: string;
  readonly engagementType: string;
  readonly description: string;
  readonly sourcePath: string;
};

export type PublicIntakeResult =
  /** `advertising` stays in the shape for callers; a new advert is refused, so it is false. */
  | { ok: true; advertising: boolean; intakeId: string | null }
  /** `rejected`: the spam guard refused it. Nothing was stored; the caller tells it
   *  the same generic "could not send" it tells a rate-limited sender. */
  | { ok: false; code: "unavailable" | "invalid" | "error" | "rate_limited" | "rejected" };

/**
 * Audit M-03 + owner spam order 2026-11-09. The throttle (per IP, per e-mail) and
 * the content screen live in `lib/security/public-form-guard.ts`; the database
 * holds the persistent per-e-mail and platform-wide ceilings (P0004 below).
 */
const SURFACE = (sourcePath: string): "request-door" | "company-need" =>
  sourcePath.includes("/request/") ? "request-door" : "company-need";

/** Postgres SQLSTATEs that mean "backend not applied yet" → degrade honestly. */
const NOT_APPLIED = new Set(["42883", "42P01"]);
/** Validation raised by the RPC (`errcode = '22023'`). */
const RPC_VALIDATION = "22023";
/**
 * A DB-enforced ceiling (`errcode = 'P0004'`, anon_write_bounds_v1): the
 * platform-wide or per-address intake bound inside the RPC itself. Unlike the
 * in-memory window above, this one holds for a caller that skips this module
 * and calls PostgREST directly. It maps to the SAME honest state the form
 * already renders for the app-side throttle: prepared, not persisted.
 */
const RPC_RATE_LIMITED = "P0004";

export async function persistPublicCompanyNeed(
  input: PublicIntakeInput,
): Promise<PublicIntakeResult> {
  // Throttle BEFORE touching Supabase, so a flood costs us nothing downstream.
  let ipKey: string | null = null;
  try {
    ipKey = clientKeyFromHeaders(await headers());
  } catch {
    // `headers()` throws outside a request scope (e.g. a unit test importing
    // this module). The e-mail limit and the content screen still run.
  }
  const limited = publicIntakeRateLimited({ ipKey, email: input.contactEmail });
  if (limited) {
    recordPublicFormRefusal(SURFACE(input.sourcePath), limited);
    return { ok: false, code: "rate_limited" };
  }

  // Spam screen: nothing that reads as an advert, or carries a pile of links, is
  // stored. The reason is logged as a counter only, never the content.
  const spam: SpamReason | null = screenIntakeContent({
    freeText: [input.description, input.sector, input.cityRegion, input.expectedDuration, input.languages],
    names: [input.companyName, input.contactName],
  });
  if (spam) {
    recordPublicFormRefusal(SURFACE(input.sourcePath), spam);
    return { ok: false, code: "rejected" };
  }

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = requireSupabaseClientEnv());
  } catch {
    // No client env configured → treat as unavailable, never throw to the UI.
    return { ok: false, code: "unavailable" };
  }

  const supabase = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data, error } = await supabase.rpc("submit_company_need_public_v1", {
      p_locale: input.locale,
      p_company_name: input.companyName,
      p_contact_name: input.contactName ?? null,
      p_contact_email: input.contactEmail ?? null,
      p_contact_phone: input.contactPhone ?? null,
      p_country: input.country,
      p_city_region: input.cityRegion ?? null,
      p_sector: input.sector,
      p_headcount: input.headcount,
      p_start_window: input.startWindow ?? null,
      p_expected_duration: input.expectedDuration ?? null,
      p_urgency: input.urgency,
      p_accommodation: input.accommodation,
      p_transport_needed: input.transportNeeded,
      p_languages: input.languages ?? null,
      p_engagement_type: input.engagementType,
      p_description: input.description,
      p_source_path: input.sourcePath,
    });

    // An advert was refused above, so a stored row is never one.
    // The RPC returns the stored row's id (the SAME id for an exact repeat within
    // 24 h — which is what makes "one request, one alert" hold across a re-send).
    if (!error) return { ok: true, advertising: false, intakeId: typeof data === "string" ? data : null };

    if (NOT_APPLIED.has(error.code ?? "")) {
      // Backend not applied yet — the caller degrades to the prepared state.
      console.log("[company-need-intake] backend not available yet:", error.code);
      return { ok: false, code: "unavailable" };
    }
    if (error.code === RPC_VALIDATION) {
      return { ok: false, code: "invalid" };
    }
    if (error.code === RPC_RATE_LIMITED) {
      return { ok: false, code: "rate_limited" };
    }
    // PRIVACY: never log the payload (it carries employer contact details).
    console.error("[company-need-intake] persist failed", { code: error.code });
    return { ok: false, code: "error" };
  } catch (err) {
    console.error("[company-need-intake] persist threw", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return { ok: false, code: "error" };
  }
}
