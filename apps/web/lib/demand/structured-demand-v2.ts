/**
 * Structured demand contract v2 (`payload.structured_v2`) — Marketplace
 * Precision programme PR 2 (docs/launch/marketplace-precision-booking-canonical-contract-v1.md §2).
 *
 * ONE additive, typed cluster set on the CANONICAL demand model
 * (`customer_requests.payload`) — NOT a new table, NOT a second demand store.
 * Everything here is capture-side: the owner structures their own request
 * through the existing owner-scoped RPCs (`submit_demand_request` /
 * `save_demand_draft`), which already accept arbitrary payload jsonb, so this
 * needs NO schema migration.
 *
 * Worker exposure is a SEPARATE, human-gated step: the worker board RPC
 * (`list_open_demand_for_workers`) exposes a closed whitelist that does NOT
 * include structured_v2 yet (decision pack MP-3). Nothing in this module may
 * leak v2 fields onto a worker surface — `projectWorkerBoardView` returns the
 * CURRENT whitelist only.
 *
 * Honesty rules (goal spec Capability A):
 *  - closed enums / bounded numbers only; free text is bounded and owner-only;
 *  - integer cents, explicit currency, explicit gross/net basis;
 *  - a compensation without min / basis / guaranteed hours / deductions is
 *    NOT an error — it renders as a visible "not provided" flag (no
 *    unexplained "up to" amounts);
 *  - `listing_kind: talent_pool` must always disclose itself.
 *
 * Pure module: no IO, no server-only, safe for client + server + tests.
 */
import { z } from "zod";

// ── Closed vocabularies ──────────────────────────────────────────────────────

export const OPPORTUNITY_TYPES = [
  "employment",
  "temporary_assignment",
  "project_work",
  "subcontract",
  "service_request",
  // Canonical learning-to-work opportunities (2026-09-03): the SAME demand
  // object, one more value — never a parallel student job system. Mirrored
  // in the SQL projection demand_structured_v2_public (20260903130000).
  "internship",
  "apprenticeship",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export const TARGET_SUPPLIES = [
  "individual",
  "multiple_workers",
  "team",
  "company",
] as const;
export type TargetSupply = (typeof TARGET_SUPPLIES)[number];

export const SITE_MODES = ["single", "multiple", "mobile"] as const;
export const WORK_MODES = ["onsite", "remote", "hybrid"] as const;

export const ENGAGEMENT_FORMS = [
  "direct_employment",
  "agency_employment",
  "temporary_employment",
  "posted_worker",
  "self_employed_contractor",
  "company_subcontract",
] as const;
export type EngagementForm = (typeof ENGAGEMENT_FORMS)[number];

export const SHIFT_KINDS = ["day", "night", "weekend"] as const;

export const PAY_UNITS = ["hour", "day", "week", "month", "project"] as const;
export const PAY_BASES = ["gross", "net", "unspecified"] as const;
export const PAYMENT_FREQUENCIES = ["weekly", "biweekly", "monthly"] as const;

export const DEDUCTION_KINDS = [
  "accommodation",
  "transport",
  "insurance",
  "other",
] as const;

export const ACCOMMODATION_STATES = [
  "offered",
  "not_offered",
  "not_needed",
] as const;
export const ACCOMMODATION_PAYERS = ["employer", "shared", "worker"] as const;
export const ROOM_TYPES = ["single", "shared"] as const;
export const ACCOMMODATION_AMENITIES = ["kitchen", "laundry", "internet"] as const;

/** Transport provision levels — mirrors the existing worker-board transport
 *  enum semantics (provided / compensated / not_provided / unknown). */
export const TRANSPORT_LEVELS = [
  "provided",
  "compensated",
  "not_provided",
  "unknown",
] as const;

/** EU driving-licence categories relevant to site work — closed set. */
export const LICENCE_CATEGORIES = ["B", "BE", "C", "CE", "D"] as const;

export const LANGUAGE_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
/** Requirement languages — the platform's worker-relevant language set (the
 *  same closed set used by conversation original_language, incl. ru). */
export const REQUIREMENT_LANGUAGES = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;

export const LISTING_KINDS = ["active_vacancy", "talent_pool"] as const;

/** Author-selectable requirement tiers (Explainable Matching v1, Wagon 4).
 *  `mandatory` ⇒ the matching engine treats the stated requirement as HARD
 *  (blocking); `preferred` ⇒ weighted/negotiable. ABSENCE keeps the engine's
 *  existing hardcoded default for that criterion — fully backward compatible
 *  (guard-tested: an absent map produces byte-identical match results). */
export const REQUIREMENT_TIERS = ["mandatory", "preferred"] as const;
export type RequirementTier = (typeof REQUIREMENT_TIERS)[number];

/** The tunable criteria. Each key only has an effect when the corresponding
 *  requirement is actually STATED elsewhere in the cluster (a tier alone
 *  never invents a requirement):
 *   - own_vehicle       → transport.own_vehicle_required / requirements.own_vehicle
 *   - own_tools         → requirements.own_tools
 *   - secondary_languages → requirements.languages beyond the FIRST entry
 *                           (the first stated language keeps its default)
 *   - licence_categories → transport.licence_categories
 *   - min_experience    → requirements.min_experience_years (default: the
 *                          engine does not evaluate it — informational only)
 *   - night_shifts / weekend_shifts → time.shifts entries
 *   - accommodation     → the worker-needs-accommodation vs not-offered check */
export const REQUIREMENT_PRIORITY_KEYS = [
  "own_vehicle",
  "own_tools",
  "secondary_languages",
  "licence_categories",
  "min_experience",
  "night_shifts",
  "weekend_shifts",
  "accommodation",
] as const;
export type RequirementPriorityKey = (typeof REQUIREMENT_PRIORITY_KEYS)[number];

const requirementTierEnum = z.enum(REQUIREMENT_TIERS);
const requirementPrioritiesSchema = z
  .object({
    own_vehicle: requirementTierEnum.optional(),
    own_tools: requirementTierEnum.optional(),
    secondary_languages: requirementTierEnum.optional(),
    licence_categories: requirementTierEnum.optional(),
    min_experience: requirementTierEnum.optional(),
    night_shifts: requirementTierEnum.optional(),
    weekend_shifts: requirementTierEnum.optional(),
    accommodation: requirementTierEnum.optional(),
  })
  .strict();

export type RequirementPriorities = z.infer<typeof requirementPrioritiesSchema>;

export const APPLICATION_METHODS = [
  "interest_signal",
  "conversation",
] as const;

export const STRUCTURED_DEMAND_CONTRACT_VERSION = 2 as const;

// ── Schema ───────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().min(0).max(100_000_000_00); // ≤ €100m — abuse bound
const shortNote = z.string().trim().min(1).max(300);

const deductionSchema = z
  .object({
    kind: z.enum(DEDUCTION_KINDS),
    amount_cents: cents.optional(),
    period: z.enum(["day", "week", "month", "once"]).optional(),
    note: shortNote.optional(),
  })
  .strict();

const timeSchema = z
  .object({
    start_earliest: isoDate.optional(),
    start_latest: isoDate.optional(),
    end_date: isoDate.optional(),
    extension_possible: z.boolean().optional(),
    hours_per_week: z.number().int().min(1).max(80).optional(),
    min_guaranteed_hours: z.number().int().min(0).max(80).optional(),
    shifts: z.array(z.enum(SHIFT_KINDS)).max(3).optional(),
    overtime_expected: z.boolean().optional(),
    schedule_notice_days: z.number().int().min(0).max(90).optional(),
    application_deadline: isoDate.optional(),
    expected_response_days: z.number().int().min(1).max(60).optional(),
  })
  .strict();

const compensationSchema = z
  .object({
    min_cents: cents.optional(),
    max_cents: cents.optional(),
    currency: z.string().regex(/^[A-Z]{3}$/).optional(),
    basis: z.enum(PAY_BASES).optional(),
    unit: z.enum(PAY_UNITS).optional(),
    guaranteed_base_cents: cents.optional(),
    overtime_rate_note: shortNote.optional(),
    bonuses_note: shortNote.optional(),
    per_diem_cents: cents.optional(),
    payment_frequency: z.enum(PAYMENT_FREQUENCIES).optional(),
    first_payment_days: z.number().int().min(1).max(90).optional(),
    deductions: z.array(deductionSchema).max(10).optional(),
    /** Explicit statement that there are NO deductions — distinct from
     *  "deductions not stated" (absence). */
    no_deductions: z.boolean().optional(),
  })
  .strict();

const accommodationSchema = z
  .object({
    state: z.enum(ACCOMMODATION_STATES),
    payer: z.enum(ACCOMMODATION_PAYERS).optional(),
    price_cents: cents.optional(),
    price_period: z.enum(["day", "week", "month"]).optional(),
    room: z.enum(ROOM_TYPES).optional(),
    occupancy_per_room: z.number().int().min(1).max(12).optional(),
    distance_km: z.number().min(0).max(500).optional(),
    travel_minutes: z.number().int().min(0).max(600).optional(),
    amenities: z.array(z.enum(ACCOMMODATION_AMENITIES)).max(3).optional(),
    registration_possible: z.boolean().optional(),
    deposit_cents: cents.optional(),
    family_possible: z.boolean().optional(),
    available_from: isoDate.optional(),
  })
  .strict();

const transportSchema = z
  .object({
    international_travel: z.enum(TRANSPORT_LEVELS).optional(),
    arrival_pickup: z.boolean().optional(),
    daily: z.enum(TRANSPORT_LEVELS).optional(),
    between_sites: z.enum(TRANSPORT_LEVELS).optional(),
    company_vehicle: z.boolean().optional(),
    fuel_card: z.boolean().optional(),
    own_vehicle_required: z.boolean().optional(),
    licence_categories: z.array(z.enum(LICENCE_CATEGORIES)).max(5).optional(),
    driver_supplement: z.boolean().optional(),
    return_travel_contribution: z.boolean().optional(),
  })
  .strict();

const requirementLanguageSchema = z
  .object({
    lang: z.enum(REQUIREMENT_LANGUAGES),
    level: z.enum(LANGUAGE_LEVELS),
    one_per_team_sufficient: z.boolean().optional(),
  })
  .strict();

const requirementsSchema = z
  .object({
    min_experience_years: z.number().int().min(0).max(50).optional(),
    similar_project_experience: z.boolean().optional(),
    independent_work: z.boolean().optional(),
    drawings_reading: z.boolean().optional(),
    leadership: z.boolean().optional(),
    languages: z.array(requirementLanguageSchema).max(5).optional(),
    /** Certificates as bounded owner-side text (no certificate taxonomy exists
     *  yet) — NEVER worker-board exposed as free text. */
    certificates: z.array(shortNote).max(10).optional(),
    own_tools: z.boolean().optional(),
    own_vehicle: z.boolean().optional(),
    own_workwear: z.boolean().optional(),
  })
  .strict();

const processSchema = z
  .object({
    application_method: z.enum(APPLICATION_METHODS).optional(),
    interview_stages: z.number().int().min(0).max(5).optional(),
    practical_test: z.boolean().optional(),
    document_verification: z.boolean().optional(),
    response_deadline_days: z.number().int().min(1).max(60).optional(),
    listing_kind: z.enum(LISTING_KINDS).optional(),
  })
  .strict();

export const structuredDemandV2Schema = z
  .object({
    opportunity_type: z.enum(OPPORTUNITY_TYPES).optional(),
    target_supply: z.enum(TARGET_SUPPLIES).optional(),
    worksite_type: shortNote.optional(),
    site_mode: z.enum(SITE_MODES).optional(),
    work_mode: z.enum(WORK_MODES).optional(),
    engagement_form: z.enum(ENGAGEMENT_FORMS).optional(),
    contract_country: z.string().regex(/^[A-Z]{2}$/).optional(),
    probation_days: z.number().int().min(0).max(365).optional(),
    time: timeSchema.optional(),
    compensation: compensationSchema.optional(),
    accommodation: accommodationSchema.optional(),
    transport: transportSchema.optional(),
    requirements: requirementsSchema.optional(),
    /** Author-selected mandatory/preferred tiers for the tunable criteria.
     *  Optional + additive: absence keeps every engine default untouched. */
    requirement_priorities: requirementPrioritiesSchema.optional(),
    process: processSchema.optional(),
    meta: z
      .object({ contract_version: z.literal(STRUCTURED_DEMAND_CONTRACT_VERSION) })
      .strict(),
  })
  .strict();

export type StructuredDemandV2 = z.infer<typeof structuredDemandV2Schema>;

// ── Sanitizer ────────────────────────────────────────────────────────────────

/** True when the cluster object carries at least one real value beyond meta. */
function hasSubstance(v2: StructuredDemandV2): boolean {
  return Object.entries(v2).some(([k, v]) => {
    if (k === "meta" || v == null) return false;
    if (typeof v === "object") return Object.values(v).some((x) => x != null);
    return true;
  });
}

/**
 * Validate untrusted input into a canonical StructuredDemandV2 — or null.
 *
 * Closed-set discipline: an invalid ANY-field rejects the whole cluster
 * (strict schemas, no partial salvage) so a client can never smuggle
 * near-valid free text into the canonical payload. Empty/valueless input →
 * null (absence is honest; nothing is fabricated). Cross-field sanity:
 * min>max compensation and reversed date ranges reject.
 */
export function sanitizeStructuredDemandV2(input: unknown): StructuredDemandV2 | null {
  if (input == null || typeof input !== "object") return null;
  const parsed = structuredDemandV2Schema.safeParse({
    ...(input as Record<string, unknown>),
    meta: { contract_version: STRUCTURED_DEMAND_CONTRACT_VERSION },
  });
  if (!parsed.success) return null;
  const v2 = parsed.data;
  const c = v2.compensation;
  if (c?.min_cents != null && c?.max_cents != null && c.min_cents > c.max_cents) {
    return null;
  }
  const t = v2.time;
  if (
    t?.start_earliest &&
    t?.start_latest &&
    t.start_earliest > t.start_latest
  ) {
    return null;
  }
  if (t?.start_earliest && t?.end_date && t.end_date < t.start_earliest) {
    return null;
  }
  if (
    c?.min_cents != null &&
    c?.guaranteed_base_cents != null &&
    c.guaranteed_base_cents > c.min_cents
  ) {
    // A guaranteed base above the stated minimum is contradictory input.
    return null;
  }
  return hasSubstance(v2) ? v2 : null;
}

/** Read a stored payload back into a typed v2 cluster (old records without
 *  structured_v2, or with a future/unknown shape, are an honest null — never
 *  a crash, never a fabricated default). */
export function readStructuredDemandV2(payload: unknown): StructuredDemandV2 | null {
  if (payload == null || typeof payload !== "object") return null;
  const raw = (payload as Record<string, unknown>)["structured_v2"];
  if (raw == null || typeof raw !== "object") return null;
  const parsed = structuredDemandV2Schema.safeParse(raw);
  return parsed.success && hasSubstance(parsed.data) ? parsed.data : null;
}

// ── Publish-honesty flags ────────────────────────────────────────────────────

export type CompensationHonestyFlag =
  | "missing_minimum"
  | "missing_basis"
  | "missing_guaranteed_hours"
  | "missing_deductions"
  | "max_without_min";

/**
 * Which compensation facts are missing from a demand the owner is about to
 * publish. These are VISIBLE flags, not validation errors — the spec's "no
 * unexplained 'up to' amount" rule: publishing stays possible, but the gap is
 * always shown (to the owner now; to workers when MP-3 exposes v2).
 * A demand with NO compensation cluster at all returns every flag.
 */
export function deriveCompensationHonestyFlags(
  v2: Pick<StructuredDemandV2, "compensation" | "time"> | null,
): CompensationHonestyFlag[] {
  const flags: CompensationHonestyFlag[] = [];
  const c = v2?.compensation;
  if (c?.min_cents == null) flags.push("missing_minimum");
  if (c?.max_cents != null && c?.min_cents == null) flags.push("max_without_min");
  if (c?.basis == null || c.basis === "unspecified") flags.push("missing_basis");
  if (v2?.time?.min_guaranteed_hours == null) flags.push("missing_guaranteed_hours");
  if ((c?.deductions == null || c.deductions.length === 0) && c?.no_deductions !== true) {
    flags.push("missing_deductions");
  }
  return flags;
}

/** True when the listing must render the talent-pool disclosure chip. */
export function requiresTalentPoolDisclosure(v2: StructuredDemandV2 | null): boolean {
  return v2?.process?.listing_kind === "talent_pool";
}

// ── Worker-board projection (CURRENT whitelist only) ─────────────────────────

/** What the worker board can show for this demand TODAY. Mirrors the
 *  `list_open_demand_for_workers` whitelist exactly (role/work-type, country,
 *  team size, start period, accommodation enum, transport enum, required
 *  tools, location label). structured_v2 clusters are deliberately NOT here —
 *  they stay owner-side until the human-gated MP-3 RPC widening is applied.
 *  `v2Captured` lets the preview say, honestly, that richer details exist but
 *  are not yet worker-visible. */
export type WorkerBoardProjection = {
  workType: string | null;
  country: string | null;
  teamSize: number | null;
  startPeriod: string | null;
  accommodation: string | null;
  transport: string | null;
  requiredTools: readonly string[];
  locationLabel: string | null;
  v2Captured: boolean;
};

export function projectWorkerBoardView(args: {
  workType?: string | null;
  country?: string | null;
  teamSize?: number | null;
  startPeriod?: string | null;
  accommodation?: string | null;
  transport?: string | null;
  requiredTools?: readonly string[] | null;
  locationLabel?: string | null;
  structuredV2?: StructuredDemandV2 | null;
}): WorkerBoardProjection {
  return {
    workType: args.workType ?? null,
    country: args.country ?? null,
    teamSize: args.teamSize ?? null,
    startPeriod: args.startPeriod ?? null,
    accommodation: args.accommodation ?? null,
    transport: args.transport ?? null,
    requiredTools: args.requiredTools ?? [],
    locationLabel: args.locationLabel ?? null,
    v2Captured: args.structuredV2 != null,
  };
}

// ── Display helpers (pure, shared by form + preview) ─────────────────────────

/** Format integer cents as a human amount ("14.50"). No currency symbol —
 *  callers pair it with the explicit currency code (honesty: never imply a
 *  currency that was not stated). */
export function formatCents(centsValue: number): string {
  const euros = Math.floor(centsValue / 100);
  const rem = centsValue % 100;
  return rem === 0 ? String(euros) : `${euros}.${String(rem).padStart(2, "0")}`;
}

/** Parse a user-entered amount string ("14.5", "14,50", "1200") into integer
 *  cents, or null for empty/invalid input. Rejects negatives and >2 decimals. */
export function parseAmountToCents(raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (s.length === 0) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const value = Number(whole) * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(value) ? value : null;
}
