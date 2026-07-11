/**
 * Pure form model for the worker's structured work preferences (the 8
 * availability-pref columns from migration 20260613100000). No DB, no React —
 * extracted so the honesty rules are guard-testable in isolation.
 *
 * Honesty invariants (mirrors the migration's own doctrine):
 *   * every boolean pref is TRI-STATE — null means "the worker did not state
 *     this". The model NEVER collapses null to false: an unset pref must not
 *     fabricate a "no" the worker never said;
 *   * the contract-type vocabulary is the migration CHECK's closed set —
 *     anything else is rejected, never clamped into a different value.
 */

/** UI value for a tri-state boolean pref. "not_stated" is a real first-class
 *  option, not an absence — the segmented control renders all three. */
export type TriState = "not_stated" | "yes" | "no";

export const TRI_STATE_VALUES: readonly TriState[] = ["not_stated", "yes", "no"];

/** Mirrors the migration CHECK on workers.preferred_contract_type EXACTLY. */
export const CONTRACT_TYPES = [
  "employment",
  "subcontract",
  "temporary",
  "any",
] as const;

export type ContractType = (typeof CONTRACT_TYPES)[number];

/** Bounds from the migration CHECK on workers.max_trip_days. */
export const MAX_TRIP_DAYS_MIN = 1;
export const MAX_TRIP_DAYS_MAX = 3650;

/** Migration CHECK on workers.availability_note length. */
export const NOTE_MAX_LENGTH = 2000;

/** DB truth (null = not stated) → UI tri-state. null maps to "not_stated",
 *  NEVER to "no" — that would fabricate an answer. */
export function booleanToTriState(value: boolean | null | undefined): TriState {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "not_stated";
}

/** UI tri-state (or a raw form string) → DB truth. Only an explicit "yes"/"no"
 *  becomes a boolean; everything else — including "not_stated", "", or an
 *  unexpected value — stays null (not stated). */
export function triStateToBoolean(value: string | null | undefined): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}

/** Raw form value → contract type or null (not stated). Values outside the
 *  migration's closed set are rejected to null, never coerced. */
export function parseContractType(raw: string | null | undefined): ContractType | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  return isContractType(s) ? s : null;
}

export type MaxTripDaysResult =
  | { ok: true; value: number | null }
  | { ok: false };

/** Raw form value → max trip days. Empty → null (not stated). A non-integer
 *  or out-of-range value is an explicit INVALID (never silently dropped —
 *  the worker typed something, so silently storing null would lie). */
export function parseMaxTripDays(raw: string | null | undefined): MaxTripDaysResult {
  const s = (raw ?? "").trim();
  if (s === "") return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < MAX_TRIP_DAYS_MIN || n > MAX_TRIP_DAYS_MAX) {
    return { ok: false };
  }
  return { ok: true, value: n };
}

/** Trim + clamp the free-text note to the migration's 2000-char CHECK;
 *  empty → null (not stated). */
export function clampNote(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  return s.slice(0, NOTE_MAX_LENGTH);
}

/**
 * Map a Postgres/PostgREST error code to a result code instead of collapsing
 * every failure into a generic error. Same convention as
 * lib/demand/demand-request.ts / lib/worker/work-card-actions.ts:
 *   42883 = undefined_function, PGRST202 = function not in schema cache,
 *   42P01 = undefined_table, 42703 = undefined_column → migration not applied;
 *   42501 = the RPC's own not-authenticated signal;
 *   P0002 = no worker row for this profile.
 */
export function classifyPrefsError(
  code: string | undefined,
): "needs_migration" | "unauthenticated" | "no_worker" | "error" {
  if (code && ["42883", "PGRST202", "42P01", "42703"].includes(code)) {
    return "needs_migration";
  }
  if (code === "42501") return "unauthenticated";
  if (code === "P0002") return "no_worker";
  return "error";
}

// ── v2 preference pack (draft migration 20260711270000, PR #721) ────────────
// The 7 additive nullable columns + save_worker_availability_prefs_v2 RPC are
// DRAFT and human-gated — NOT applied yet. These literals mirror the draft
// SQL's CHECK constraints EXACTLY so the UI ships repo-safe today and lights
// up unchanged once the owner applies the migration. Until then the read path
// answers 42703 (undefined_column) and the RPC 42883/PGRST202 — both degrade
// to an honest "not enabled" state, never a crash or a fake save.

/** Mirrors the draft CHECK on workers.pay_basis_preference (PR #721). */
export const PAY_BASIS_PREFERENCES = ["gross", "net"] as const;

export type PayBasisPreference = (typeof PAY_BASIS_PREFERENCES)[number];

/** Mirrors the draft CHECK on workers.driving_licence_categories (PR #721) —
 *  the same closed set structured_v2 transport.licence_categories uses. */
export const DRIVING_LICENCE_CATEGORIES = ["B", "BE", "C", "CE", "D"] as const;

export type DrivingLicenceCategory = (typeof DRIVING_LICENCE_CATEGORIES)[number];

/** Raw form value → pay basis or null (not stated). Values outside the draft
 *  CHECK's closed set are rejected to null, never coerced. */
export function parsePayBasis(raw: string | null | undefined): PayBasisPreference | null {
  const s = (raw ?? "").trim();
  if (s === "") return null;
  return (PAY_BASIS_PREFERENCES as readonly string[]).includes(s)
    ? (s as PayBasisPreference)
    : null;
}

/** Raw multi-value form input → licence categories or null (not stated).
 *  Unknown values are dropped (never coerced into a different category);
 *  an empty result is null — the draft RPC treats [] the same way. */
export function parseLicenceCategories(
  raw: readonly string[] | null | undefined,
): DrivingLicenceCategory[] | null {
  const cats = (raw ?? [])
    .map((v) => v.trim())
    .filter((v): v is DrivingLicenceCategory =>
      (DRIVING_LICENCE_CATEGORIES as readonly string[]).includes(v),
    );
  // De-duplicate while preserving the canonical B..D order.
  const unique = DRIVING_LICENCE_CATEGORIES.filter((c) => cats.includes(c));
  return unique.length > 0 ? [...unique] : null;
}

/** The 7 v2 prefs, as read from the workers row (null = not stated). */
export interface WorkerAvailabilityPrefsV2 {
  payBasisPreference: PayBasisPreference | null;
  nightShiftsOk: boolean | null;
  weekendShiftsOk: boolean | null;
  overtimeOk: boolean | null;
  drivingLicenceCategories: DrivingLicenceCategory[] | null;
  ownVehicle: boolean | null;
  ownTools: boolean | null;
}

export const EMPTY_PREFS_V2: WorkerAvailabilityPrefsV2 = {
  payBasisPreference: null,
  nightShiftsOk: null,
  weekendShiftsOk: null,
  overtimeOk: null,
  drivingLicenceCategories: null,
  ownVehicle: null,
  ownTools: null,
};

/** The 8 saved prefs, as read from the workers row (null = not stated). */
export interface WorkerAvailabilityPrefs {
  willingToRelocate: boolean | null;
  needsAccommodation: boolean | null;
  hasTransport: boolean | null;
  maxTripDays: number | null;
  preferredContractType: ContractType | null;
  teamAvailable: boolean | null;
  soloAvailable: boolean | null;
  availabilityNote: string | null;
}

export const EMPTY_PREFS: WorkerAvailabilityPrefs = {
  willingToRelocate: null,
  needsAccommodation: null,
  hasTransport: null,
  maxTripDays: null,
  preferredContractType: null,
  teamAvailable: null,
  soloAvailable: null,
  availabilityNote: null,
};
