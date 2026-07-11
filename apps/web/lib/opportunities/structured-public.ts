/**
 * Worker-safe PUBLIC projection of a demand's `payload.structured_v2`
 * (Marketplace Precision Phase-2 PR 2).
 *
 * The human-gated MP-3 migration (20260711330000, draft PR #730) adds ONE
 * column to `list_open_demand_for_workers()`:
 *
 *   structured jsonb — public.demand_structured_v2_public(payload->'structured_v2')
 *
 * That SQL helper rebuilds ONLY a closed worker-safe subset of the stored
 * cluster, key by key. This module is the app-side twin of that helper:
 * the same whitelist, the same element-by-element tolerance, so the board
 * renders exactly what the RPC projects — and NOTHING the RPC would drop.
 *
 * DELIBERATELY EXCLUDED (mirrors the SQL projection): worksite_type,
 * right_to_work_notes, required_permits, compensation.overtime_rate_note,
 * compensation.bonuses_note, deductions[].note, requirements.certificates,
 * requirements.education / equipment_permissions / physical_conditions /
 * medical_prerequisites, process.decision_owner, meta. The exposed subset is
 * enums, bounded numbers, ISO dates and booleans ONLY — never free text.
 *
 * Tolerance contract: `readStructuredDemandPublic` NEVER throws and NEVER
 * fabricates. A missing `structured` field, a null, a non-object, or a fully
 * invalid shape → null (the board shows today's narrow facts plus one honest
 * "detailed conditions not provided" line). Unknown keys and invalid elements
 * are dropped element-by-element — defence in depth on top of the SQL
 * whitelist, and honest degradation while the migration is NOT yet applied.
 *
 * Honesty (goal spec: "Require or visibly flag missing minimum, guaranteed
 * hours, gross/net basis and deductions"): `derivePublicHonestyGaps` reuses
 * the ONE capture-side derivation so workers SEE the same gaps the company
 * was shown when publishing — never a second, drifting rule set.
 *
 * Pure module: no IO, no server-only, safe for client + server + tests.
 */
import { z } from "zod";
import {
  ACCOMMODATION_AMENITIES,
  ACCOMMODATION_PAYERS,
  ACCOMMODATION_STATES,
  APPLICATION_METHODS,
  DEDUCTION_KINDS,
  ENGAGEMENT_FORMS,
  LANGUAGE_LEVELS,
  LICENCE_CATEGORIES,
  LISTING_KINDS,
  OPPORTUNITY_TYPES,
  PAY_BASES,
  PAY_UNITS,
  PAYMENT_FREQUENCIES,
  REQUIREMENT_LANGUAGES,
  ROOM_TYPES,
  SHIFT_KINDS,
  SITE_MODES,
  TARGET_SUPPLIES,
  TRANSPORT_LEVELS,
  WORK_MODES,
  deriveCompensationHonestyFlags,
  formatCents,
  type CompensationHonestyFlag,
} from "@/lib/demand/structured-demand-v2";

// ── Schema (strict subset — the SQL helper's whitelist, nothing more) ────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const finiteNumber = z.number().finite();
const countryCode = z.string().regex(/^[A-Z]{2}$/);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);

const publicDeductionSchema = z
  .object({
    kind: z.enum(DEDUCTION_KINDS),
    amount_cents: finiteNumber.optional(),
    period: z.enum(["day", "week", "month", "once"]).optional(),
  })
  .strict();

const publicTimeSchema = z
  .object({
    start_earliest: isoDate.optional(),
    start_latest: isoDate.optional(),
    end_date: isoDate.optional(),
    extension_possible: z.boolean().optional(),
    hours_per_week: finiteNumber.optional(),
    min_guaranteed_hours: finiteNumber.optional(),
    shifts: z.array(z.enum(SHIFT_KINDS)).optional(),
    overtime_expected: z.boolean().optional(),
    schedule_notice_days: finiteNumber.optional(),
    application_deadline: isoDate.optional(),
    expected_response_days: finiteNumber.optional(),
  })
  .strict();

const publicCompensationSchema = z
  .object({
    min_cents: finiteNumber.optional(),
    max_cents: finiteNumber.optional(),
    currency: currencyCode.optional(),
    basis: z.enum(PAY_BASES).optional(),
    unit: z.enum(PAY_UNITS).optional(),
    guaranteed_base_cents: finiteNumber.optional(),
    per_diem_cents: finiteNumber.optional(),
    payment_frequency: z.enum(PAYMENT_FREQUENCIES).optional(),
    first_payment_days: finiteNumber.optional(),
    no_deductions: z.boolean().optional(),
    deductions: z.array(publicDeductionSchema).optional(),
  })
  .strict();

const publicAccommodationSchema = z
  .object({
    state: z.enum(ACCOMMODATION_STATES).optional(),
    payer: z.enum(ACCOMMODATION_PAYERS).optional(),
    price_cents: finiteNumber.optional(),
    price_period: z.enum(["day", "week", "month"]).optional(),
    room: z.enum(ROOM_TYPES).optional(),
    occupancy_per_room: finiteNumber.optional(),
    distance_km: finiteNumber.optional(),
    travel_minutes: finiteNumber.optional(),
    amenities: z.array(z.enum(ACCOMMODATION_AMENITIES)).optional(),
    registration_possible: z.boolean().optional(),
    deposit_cents: finiteNumber.optional(),
    family_possible: z.boolean().optional(),
    available_from: isoDate.optional(),
  })
  .strict();

const publicTransportSchema = z
  .object({
    international_travel: z.enum(TRANSPORT_LEVELS).optional(),
    arrival_pickup: z.boolean().optional(),
    daily: z.enum(TRANSPORT_LEVELS).optional(),
    between_sites: z.enum(TRANSPORT_LEVELS).optional(),
    company_vehicle: z.boolean().optional(),
    fuel_card: z.boolean().optional(),
    own_vehicle_required: z.boolean().optional(),
    licence_categories: z.array(z.enum(LICENCE_CATEGORIES)).optional(),
    driver_supplement: z.boolean().optional(),
    return_travel_contribution: z.boolean().optional(),
  })
  .strict();

const publicRequirementLanguageSchema = z
  .object({
    lang: z.enum(REQUIREMENT_LANGUAGES),
    level: z.enum(LANGUAGE_LEVELS),
    one_per_team_sufficient: z.boolean().optional(),
  })
  .strict();

const publicRequirementsSchema = z
  .object({
    min_experience_years: finiteNumber.optional(),
    similar_project_experience: z.boolean().optional(),
    independent_work: z.boolean().optional(),
    drawings_reading: z.boolean().optional(),
    leadership: z.boolean().optional(),
    languages: z.array(publicRequirementLanguageSchema).optional(),
    own_tools: z.boolean().optional(),
    own_vehicle: z.boolean().optional(),
    own_workwear: z.boolean().optional(),
  })
  .strict();

const publicProcessSchema = z
  .object({
    application_method: z.enum(APPLICATION_METHODS).optional(),
    interview_stages: finiteNumber.optional(),
    practical_test: z.boolean().optional(),
    document_verification: z.boolean().optional(),
    response_deadline_days: finiteNumber.optional(),
    listing_kind: z.enum(LISTING_KINDS).optional(),
  })
  .strict();

export const structuredDemandPublicSchema = z
  .object({
    opportunity_type: z.enum(OPPORTUNITY_TYPES).optional(),
    target_supply: z.enum(TARGET_SUPPLIES).optional(),
    site_mode: z.enum(SITE_MODES).optional(),
    work_mode: z.enum(WORK_MODES).optional(),
    engagement_form: z.enum(ENGAGEMENT_FORMS).optional(),
    contract_country: countryCode.optional(),
    probation_days: finiteNumber.optional(),
    time: publicTimeSchema.optional(),
    compensation: publicCompensationSchema.optional(),
    accommodation: publicAccommodationSchema.optional(),
    transport: publicTransportSchema.optional(),
    requirements: publicRequirementsSchema.optional(),
    process: publicProcessSchema.optional(),
  })
  .strict();

export type StructuredDemandPublic = z.infer<typeof structuredDemandPublicSchema>;
export type PublicCompensation = NonNullable<StructuredDemandPublic["compensation"]>;
export type PublicTime = NonNullable<StructuredDemandPublic["time"]>;

// ── Tolerant element-by-element reader (the SQL helper's app twin) ───────────

/** Validate one field; invalid/missing → undefined (dropped, never a throw). */
function pick<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | undefined {
  if (value === undefined || value === null) return undefined;
  const r = schema.safeParse(value);
  return r.success ? r.data : undefined;
}

/** Filter an array field element-by-element (the SQL `jsonb_agg … where`
 *  semantics: bad elements drop, good elements survive); empty → undefined. */
function pickArray<S extends z.ZodType>(
  schema: S,
  value: unknown,
): Array<z.infer<S>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<z.infer<S>> = [];
  for (const el of value) {
    const v = pick(schema, el);
    if (v !== undefined) out.push(v);
  }
  return out.length > 0 ? out : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T | undefined {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as T) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickDeduction(value: unknown): z.infer<typeof publicDeductionSchema> | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  // The SQL keeps an element only when its `kind` is in the closed set; the
  // free-text `note` is NEVER copied.
  const kind = pick(z.enum(DEDUCTION_KINDS), o.kind);
  if (kind === undefined) return undefined;
  return stripUndefined({
    kind,
    amount_cents: pick(finiteNumber, o.amount_cents),
    period: pick(z.enum(["day", "week", "month", "once"]), o.period),
  });
}

function pickLanguage(
  value: unknown,
): z.infer<typeof publicRequirementLanguageSchema> | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  // SQL keeps an element only when BOTH lang and level are in the closed sets.
  const lang = pick(z.enum(REQUIREMENT_LANGUAGES), o.lang);
  const level = pick(z.enum(LANGUAGE_LEVELS), o.level);
  if (lang === undefined || level === undefined) return undefined;
  return stripUndefined({
    lang,
    level,
    one_per_team_sufficient: pick(z.boolean(), o.one_per_team_sufficient),
  });
}

function pickTime(value: unknown): PublicTime | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  return stripUndefined({
    start_earliest: pick(isoDate, o.start_earliest),
    start_latest: pick(isoDate, o.start_latest),
    end_date: pick(isoDate, o.end_date),
    extension_possible: pick(z.boolean(), o.extension_possible),
    hours_per_week: pick(finiteNumber, o.hours_per_week),
    min_guaranteed_hours: pick(finiteNumber, o.min_guaranteed_hours),
    shifts: pickArray(z.enum(SHIFT_KINDS), o.shifts),
    overtime_expected: pick(z.boolean(), o.overtime_expected),
    schedule_notice_days: pick(finiteNumber, o.schedule_notice_days),
    application_deadline: pick(isoDate, o.application_deadline),
    expected_response_days: pick(finiteNumber, o.expected_response_days),
  });
}

function pickCompensation(value: unknown): PublicCompensation | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  const deductions = Array.isArray(o.deductions)
    ? o.deductions.map(pickDeduction).filter((d) => d !== undefined)
    : undefined;
  return stripUndefined({
    min_cents: pick(finiteNumber, o.min_cents),
    max_cents: pick(finiteNumber, o.max_cents),
    currency: pick(currencyCode, o.currency),
    basis: pick(z.enum(PAY_BASES), o.basis),
    unit: pick(z.enum(PAY_UNITS), o.unit),
    guaranteed_base_cents: pick(finiteNumber, o.guaranteed_base_cents),
    per_diem_cents: pick(finiteNumber, o.per_diem_cents),
    payment_frequency: pick(z.enum(PAYMENT_FREQUENCIES), o.payment_frequency),
    first_payment_days: pick(finiteNumber, o.first_payment_days),
    no_deductions: pick(z.boolean(), o.no_deductions),
    deductions: deductions && deductions.length > 0 ? deductions : undefined,
  });
}

function pickAccommodation(
  value: unknown,
): NonNullable<StructuredDemandPublic["accommodation"]> | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  return stripUndefined({
    state: pick(z.enum(ACCOMMODATION_STATES), o.state),
    payer: pick(z.enum(ACCOMMODATION_PAYERS), o.payer),
    price_cents: pick(finiteNumber, o.price_cents),
    price_period: pick(z.enum(["day", "week", "month"]), o.price_period),
    room: pick(z.enum(ROOM_TYPES), o.room),
    occupancy_per_room: pick(finiteNumber, o.occupancy_per_room),
    distance_km: pick(finiteNumber, o.distance_km),
    travel_minutes: pick(finiteNumber, o.travel_minutes),
    amenities: pickArray(z.enum(ACCOMMODATION_AMENITIES), o.amenities),
    registration_possible: pick(z.boolean(), o.registration_possible),
    deposit_cents: pick(finiteNumber, o.deposit_cents),
    family_possible: pick(z.boolean(), o.family_possible),
    available_from: pick(isoDate, o.available_from),
  });
}

function pickTransport(
  value: unknown,
): NonNullable<StructuredDemandPublic["transport"]> | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  return stripUndefined({
    international_travel: pick(z.enum(TRANSPORT_LEVELS), o.international_travel),
    arrival_pickup: pick(z.boolean(), o.arrival_pickup),
    daily: pick(z.enum(TRANSPORT_LEVELS), o.daily),
    between_sites: pick(z.enum(TRANSPORT_LEVELS), o.between_sites),
    company_vehicle: pick(z.boolean(), o.company_vehicle),
    fuel_card: pick(z.boolean(), o.fuel_card),
    own_vehicle_required: pick(z.boolean(), o.own_vehicle_required),
    licence_categories: pickArray(z.enum(LICENCE_CATEGORIES), o.licence_categories),
    driver_supplement: pick(z.boolean(), o.driver_supplement),
    return_travel_contribution: pick(z.boolean(), o.return_travel_contribution),
  });
}

function pickRequirements(
  value: unknown,
): NonNullable<StructuredDemandPublic["requirements"]> | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  const languages = Array.isArray(o.languages)
    ? o.languages.map(pickLanguage).filter((l) => l !== undefined)
    : undefined;
  // requirements.certificates (bounded free text) is DELIBERATELY not read —
  // the SQL projection excludes it until a certificate taxonomy exists.
  return stripUndefined({
    min_experience_years: pick(finiteNumber, o.min_experience_years),
    similar_project_experience: pick(z.boolean(), o.similar_project_experience),
    independent_work: pick(z.boolean(), o.independent_work),
    drawings_reading: pick(z.boolean(), o.drawings_reading),
    leadership: pick(z.boolean(), o.leadership),
    languages: languages && languages.length > 0 ? languages : undefined,
    own_tools: pick(z.boolean(), o.own_tools),
    own_vehicle: pick(z.boolean(), o.own_vehicle),
    own_workwear: pick(z.boolean(), o.own_workwear),
  });
}

function pickProcess(
  value: unknown,
): NonNullable<StructuredDemandPublic["process"]> | undefined {
  const o = asRecord(value);
  if (!o) return undefined;
  return stripUndefined({
    application_method: pick(z.enum(APPLICATION_METHODS), o.application_method),
    interview_stages: pick(finiteNumber, o.interview_stages),
    practical_test: pick(z.boolean(), o.practical_test),
    document_verification: pick(z.boolean(), o.document_verification),
    response_deadline_days: pick(finiteNumber, o.response_deadline_days),
    listing_kind: pick(z.enum(LISTING_KINDS), o.listing_kind),
  });
}

/**
 * Read the worker-safe public projection out of one RPC row.
 *
 * `row` is the raw `list_open_demand_for_workers()` row. Until the owner
 * applies the MP-3 migration the row has NO `structured` field → null (the
 * board degrades honestly). After apply, `row.structured` carries the SQL
 * projection; this reader re-validates it key by key (defence in depth) and
 * NEVER lets a free-text field (notes, worksite_type, certificates) through.
 * Never throws, never fabricates: garbage in → null out.
 */
export function readStructuredDemandPublic(row: unknown): StructuredDemandPublic | null {
  const rowObj = asRecord(row);
  if (!rowObj) return null;
  const raw = asRecord(rowObj.structured);
  if (!raw) return null;

  const candidate = stripUndefined({
    opportunity_type: pick(z.enum(OPPORTUNITY_TYPES), raw.opportunity_type),
    target_supply: pick(z.enum(TARGET_SUPPLIES), raw.target_supply),
    site_mode: pick(z.enum(SITE_MODES), raw.site_mode),
    work_mode: pick(z.enum(WORK_MODES), raw.work_mode),
    engagement_form: pick(z.enum(ENGAGEMENT_FORMS), raw.engagement_form),
    contract_country: pick(countryCode, raw.contract_country),
    probation_days: pick(finiteNumber, raw.probation_days),
    time: pickTime(raw.time),
    compensation: pickCompensation(raw.compensation),
    accommodation: pickAccommodation(raw.accommodation),
    transport: pickTransport(raw.transport),
    requirements: pickRequirements(raw.requirements),
    process: pickProcess(raw.process),
  });
  if (!candidate) return null;

  // Belt + braces: the assembled candidate must satisfy the strict public
  // schema (it does by construction; a failure means a bug, not user data —
  // degrade to null rather than render anything unvalidated).
  const parsed = structuredDemandPublicSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// ── Worker-facing honesty gaps (THE capture-side derivation, reused) ─────────

export type { CompensationHonestyFlag };

/**
 * The pay facts this demand does NOT state — workers must SEE what the
 * company left out (missing minimum / gross-net basis / guaranteed hours /
 * deductions, plus a lone "up to" amount). Reuses the ONE capture-side
 * derivation (`deriveCompensationHonestyFlags`), so the worker board and the
 * company publish preview can never disagree about the same cluster.
 */
export function derivePublicHonestyGaps(
  pub: StructuredDemandPublic | null,
): CompensationHonestyFlag[] {
  return deriveCompensationHonestyFlags(
    pub ? { compensation: pub.compensation, time: pub.time } : null,
  );
}

/** True when the board MUST render the talent-pool disclosure chip — the
 *  listing collects candidates for future needs, not an active vacancy. */
export function publicRequiresTalentPoolDisclosure(
  pub: StructuredDemandPublic | null,
): boolean {
  return pub?.process?.listing_kind === "talent_pool";
}

// ── Display helpers (pure; amounts via the shared formatCents) ───────────────

/** A pay range as display data — the UI supplies localized "from"/"up to"
 *  phrasing; amounts always come from the shared `formatCents` (integer
 *  cents, no invented precision, no implied currency). */
export type PublicPayRange =
  | { readonly kind: "range"; readonly min: string; readonly max: string }
  | { readonly kind: "from"; readonly min: string }
  | { readonly kind: "up_to"; readonly max: string };

export function publicPayRange(
  compensation: PublicCompensation | undefined,
): PublicPayRange | null {
  const min = compensation?.min_cents;
  const max = compensation?.max_cents;
  if (min != null && max != null) {
    return { kind: "range", min: formatCents(min), max: formatCents(max) };
  }
  if (min != null) return { kind: "from", min: formatCents(min) };
  if (max != null) return { kind: "up_to", max: formatCents(max) };
  return null;
}

/** Format an ISO date (YYYY-MM-DD) for the given locale — UTC-pinned so the
 *  server render never shifts the stated day. Invalid input echoes back
 *  unchanged (it already passed the ISO regex; this is a last-resort guard). */
export function formatPublicIsoDate(iso: string, locale: string): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "UTC",
    }).format(ms);
  } catch {
    return iso;
  }
}

/** Language display names in their own language — locale-independent by
 *  design (same convention as the capture form's picker), so the closed
 *  REQUIREMENT_LANGUAGES set needs no 11-locale key fan-out. */
export const PUBLIC_LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  lt: "Lietuvių",
  lv: "Latviešu",
  et: "Eesti",
  nl: "Nederlands",
  de: "Deutsch",
  da: "Dansk",
  no: "Norsk",
  sv: "Svenska",
  pl: "Polski",
  ru: "Русский",
};

export function publicLanguageName(code: string): string {
  return PUBLIC_LANGUAGE_NAMES[code] ?? code.toUpperCase();
}

export { formatCents };
