import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DomainCaller } from "@/lib/domain/caller";
import { readWorkerCoreRow } from "@/lib/data/worker-core";

/**
 * THE work-card save DOMAIN core (G4 tail wagon 2) — the same operation as an
 * explicit caller, so the web form, the chat executor, and the MCP capability
 * run ONE implementation. Extracted from `work-card-actions.ts`; the write
 * stays the SECURITY DEFINER RPC `save_worker_card` (migration 20260608120000),
 * which updates ONLY the whitelisted card fields WHERE profile_id = auth.uid()
 * — the core re-implements no authority, RLS + the RPC decide.
 *
 * Partial saves are the domain rule: `null` for a provided-but-empty field,
 * `undefined`/absent keeps the existing value (the RPC treats null params as
 * "keep"), and the system fields (trust_score, profile_completeness) are never
 * touched — no fake score.
 */

const RPC_NOT_FOUND_CODE = "42883";
const UNDEFINED_COLUMN_CODE = "42703";
const RELATION_NOT_FOUND_CODE = "42P01";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function asAny(supabase: SupabaseClient): any {
  return supabase;
}

function isMigrationMissing(code?: string): boolean {
  return (
    code === RPC_NOT_FOUND_CODE ||
    code === UNDEFINED_COLUMN_CODE ||
    code === RELATION_NOT_FOUND_CODE
  );
}

export const WORK_CARD_AVAILABILITY_STATUSES = [
  "available",
  "busy",
  "unavailable",
] as const;

export type WorkCardCoreInput = {
  availabilityStatus?: string | null;
  /** YYYY-MM-DD */
  availableFrom?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  /** ISO-3166 alpha-2 */
  locationCountry?: string | null;
  preferredCountries?: string[] | null;
};

export type WorkCardCoreResult =
  | { ok: true }
  | { ok: false; code: "needs_migration" | "invalid" | "error"; message?: string };

/**
 * Save one or more card fields as the caller. Only validated values reach the
 * RPC; omitted fields keep their existing values. Stamps the confirmation
 * time (the RPC's own behavior) — which is exactly why the capability
 * fingerprint below moves on every successful save.
 */
export async function saveWorkerCardCore(
  caller: DomainCaller,
  input: WorkCardCoreInput,
): Promise<WorkCardCoreResult> {
  const availability = input.availabilityStatus?.trim() || null;
  if (
    availability !== null &&
    !WORK_CARD_AVAILABILITY_STATUSES.includes(
      availability as (typeof WORK_CARD_AVAILABILITY_STATUSES)[number],
    )
  ) {
    return { ok: false, code: "invalid", message: "availability" };
  }

  const availableFrom = input.availableFrom?.trim() || null;
  const salaryMin = input.salaryMin ?? null;
  const salaryMax = input.salaryMax ?? null;
  if (salaryMin !== null && salaryMax !== null && salaryMin > salaryMax) {
    return { ok: false, code: "invalid", message: "salary_range" };
  }

  const locationCountry =
    input.locationCountry?.trim() === "" || input.locationCountry == null
      ? null
      : input.locationCountry.trim().toUpperCase().slice(0, 2);
  const preferredCountries = normalizeCountryList(input.preferredCountries);

  const { error } = await asAny(caller.supabase).rpc("save_worker_card", {
    p_availability_status: availability,
    p_available_from: availableFrom,
    p_location_country: locationCountry,
    p_preferred_countries: preferredCountries,
    p_salary_min: salaryMin,
    p_salary_max: salaryMax,
  });

  if (error) {
    if (isMigrationMissing(error.code)) return { ok: false, code: "needs_migration" };
    console.error("[work-card] save failed:", error.message);
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true };
}

/** Uppercased two-letter codes only, max 12 — same rule as the web form's
 *  parser; anything else is dropped. `null`/absent is null (= keep, the RPC
 *  coalesces); an EXPLICIT `[]` stays `[]` (= clear, W6) — the one way a
 *  person can empty the list; a list whose every entry is invalid is null
 *  (= keep), never a silent clear. */
export function normalizeCountryList(raw: string[] | null | undefined): string[] | null {
  if (!raw) return null;
  if (raw.length === 0) return [];
  const codes = raw
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .slice(0, 12);
  return codes.length > 0 ? codes : null;
}

/**
 * THE work-card state fingerprint — the current card facts a confirmation
 * token binds to. A successful save re-stamps `work_card_confirmed_at`
 * (RPC behavior), so a token minted before the write dies as stale_state on
 * replay: genuinely one-time, same mechanism as the journal chain head.
 */
export async function workCardStateFingerprint(caller: DomainCaller): Promise<string> {
  const read = await readWorkerCoreRow(caller);
  if (!read.ok) return "work-card:unreadable";
  if (!read.value) return "work-card:no-worker";
  const w = read.value;
  return `work-card:${JSON.stringify([
    w.availability_status ?? null,
    w.available_from ?? null,
    w.current_location_country ?? null,
    w.preferred_countries ?? null,
    w.work_card_confirmed_at ?? null,
  ])}`;
}
