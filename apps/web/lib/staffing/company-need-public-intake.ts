import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseClientEnv } from "@/lib/env";

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
 * instead of claiming a false success. No outbound side effects.
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
  | { ok: true }
  | { ok: false; code: "unavailable" | "invalid" | "error" };

/** Postgres SQLSTATEs that mean "backend not applied yet" → degrade honestly. */
const NOT_APPLIED = new Set(["42883", "42P01"]);
/** Validation raised by the RPC (`errcode = '22023'`). */
const RPC_VALIDATION = "22023";

export async function persistPublicCompanyNeed(
  input: PublicIntakeInput,
): Promise<PublicIntakeResult> {
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
    const { error } = await supabase.rpc("submit_company_need_public_v1", {
      p_locale: input.locale,
      p_company_name: input.companyName,
      p_contact_name: input.contactName ?? null,
      p_contact_email: input.contactEmail ?? null,
      p_contact_phone: null,
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

    if (!error) return { ok: true };

    if (NOT_APPLIED.has(error.code ?? "")) {
      // Backend not applied yet — the caller degrades to the prepared state.
      console.log("[company-need-intake] backend not available yet:", error.code);
      return { ok: false, code: "unavailable" };
    }
    if (error.code === RPC_VALIDATION) {
      return { ok: false, code: "invalid" };
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
