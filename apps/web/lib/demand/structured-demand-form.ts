/**
 * Form-state bridge for the structured demand v2 capture (PR 2 of the
 * marketplace precision programme). Pure + client-safe: converts the advanced
 * demand form's string-based input state into the `structured_v2` wire shape
 * (validated server-side by `sanitizeStructuredDemandV2`), and back again for
 * duplicate-and-edit prefill.
 *
 * Honesty conventions:
 *  - empty string / empty list = NOT STATED → the key is omitted entirely
 *    (never a fabricated default);
 *  - checkboxes are "check what applies": only `true` is persisted; an
 *    untouched box stays an honest absence, not a stored "no";
 *  - amounts are parsed to integer cents via the shared parser (reject > 2
 *    decimals) — a non-parseable amount is dropped here and the cluster is
 *    re-validated server-side anyway.
 */
import {
  parseAmountToCents,
  formatCents,
  REQUIREMENT_PRIORITY_KEYS,
  type RequirementPriorityKey,
  type RequirementTier,
  type StructuredDemandV2,
} from "./structured-demand-v2";

/** Wagon 4 tier-picker state: "" = not set (engine default stays). */
export type RequirementPriorityState = Record<
  RequirementPriorityKey,
  "" | RequirementTier
>;

const EMPTY_REQUIREMENT_PRIORITIES: RequirementPriorityState = {
  own_vehicle: "",
  own_tools: "",
  secondary_languages: "",
  licence_categories: "",
  min_experience: "",
  night_shifts: "",
  weekend_shifts: "",
  accommodation: "",
};

export type DeductionRow = {
  kind: "accommodation" | "transport" | "insurance" | "other";
  amount: string;
  period: "" | "day" | "week" | "month" | "once";
};

export type LanguageRow = {
  lang: string;
  level: string;
  onePerTeam: boolean;
};

export type AdvancedDemandFormState = {
  opportunityType: string;
  targetSupply: string;
  engagementForm: string;
  contractCountry: string;
  // time
  startEarliest: string;
  startLatest: string;
  endDate: string;
  hoursPerWeek: string;
  minGuaranteedHours: string;
  shifts: string[];
  overtimeExpected: boolean;
  applicationDeadline: string;
  // compensation
  compMin: string;
  compMax: string;
  currency: string;
  basis: string;
  unit: string;
  guaranteedBase: string;
  perDiem: string;
  paymentFrequency: string;
  deductions: DeductionRow[];
  noDeductions: boolean;
  // accommodation
  accommodationState: string;
  accommodationPayer: string;
  accommodationPrice: string;
  accommodationPricePeriod: string;
  room: string;
  occupancy: string;
  distanceKm: string;
  amenities: string[];
  deposit: string;
  familyPossible: boolean;
  // transport
  internationalTravel: string;
  dailyTransport: string;
  betweenSites: string;
  arrivalPickup: boolean;
  companyVehicle: boolean;
  fuelCard: boolean;
  ownVehicleRequired: boolean;
  licenceCategories: string[];
  returnTravel: boolean;
  // requirements
  minExperienceYears: string;
  languages: LanguageRow[];
  certificates: string[];
  ownTools: boolean;
  ownVehicle: boolean;
  ownWorkwear: boolean;
  drawingsReading: boolean;
  independentWork: boolean;
  leadership: boolean;
  // requirement tiers (Wagon 4) — "" = engine default for that criterion
  requirementPriorities: RequirementPriorityState;
  // process
  applicationMethod: string;
  interviewStages: string;
  practicalTest: boolean;
  documentVerification: boolean;
  responseDeadlineDays: string;
  listingKind: string;
};

export const EMPTY_ADVANCED_DEMAND_STATE: AdvancedDemandFormState = {
  opportunityType: "",
  targetSupply: "",
  engagementForm: "",
  contractCountry: "",
  startEarliest: "",
  startLatest: "",
  endDate: "",
  hoursPerWeek: "",
  minGuaranteedHours: "",
  shifts: [],
  overtimeExpected: false,
  applicationDeadline: "",
  compMin: "",
  compMax: "",
  currency: "EUR",
  basis: "",
  unit: "",
  guaranteedBase: "",
  perDiem: "",
  paymentFrequency: "",
  deductions: [],
  noDeductions: false,
  accommodationState: "",
  accommodationPayer: "",
  accommodationPrice: "",
  accommodationPricePeriod: "",
  room: "",
  occupancy: "",
  distanceKm: "",
  amenities: [],
  deposit: "",
  familyPossible: false,
  internationalTravel: "",
  dailyTransport: "",
  betweenSites: "",
  arrivalPickup: false,
  companyVehicle: false,
  fuelCard: false,
  ownVehicleRequired: false,
  licenceCategories: [],
  returnTravel: false,
  minExperienceYears: "",
  languages: [],
  certificates: [],
  ownTools: false,
  ownVehicle: false,
  ownWorkwear: false,
  drawingsReading: false,
  independentWork: false,
  leadership: false,
  requirementPriorities: { ...EMPTY_REQUIREMENT_PRIORITIES },
  applicationMethod: "",
  interviewStages: "",
  practicalTest: false,
  documentVerification: false,
  responseDeadlineDays: "",
  listingKind: "",
};

const str = (s: string) => (s.trim().length > 0 ? s.trim() : undefined);
const int = (s: string) => {
  const t = s.trim();
  if (!/^\d{1,7}$/.test(t)) return undefined;
  return Number(t);
};
const amount = (s: string) => parseAmountToCents(s) ?? undefined;
const flag = (b: boolean) => (b ? true : undefined);
const num = (s: string) => {
  const t = s.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return undefined;
  return Number(t);
};

/** Drop undefined values; return undefined when nothing real remains. */
function compact<T extends Record<string, unknown>>(obj: T): T | undefined {
  const entries = Object.entries(obj).filter(([, v]) => {
    if (v == null) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  });
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

/**
 * Build the `structured_v2` wire object from the form state. Returns undefined
 * when the user filled nothing (the demand stays a valid v1-style request).
 * The result is UNVALIDATED wire input — the server re-validates with
 * `sanitizeStructuredDemandV2` (closed sets, cross-field sanity, bounds).
 */
export function buildStructuredV2Input(
  s: AdvancedDemandFormState,
): Record<string, unknown> | undefined {
  const deductions = s.deductions
    .map((d) =>
      compact({
        kind: d.kind,
        amount_cents: amount(d.amount),
        period: str(d.period),
      }),
    )
    .filter((d): d is NonNullable<typeof d> => d != null && "kind" in d);

  const wire = compact({
    opportunity_type: str(s.opportunityType),
    target_supply: str(s.targetSupply),
    engagement_form: str(s.engagementForm),
    contract_country: str(s.contractCountry.toUpperCase()),
    time: compact({
      start_earliest: str(s.startEarliest),
      start_latest: str(s.startLatest),
      end_date: str(s.endDate),
      hours_per_week: int(s.hoursPerWeek),
      min_guaranteed_hours: int(s.minGuaranteedHours),
      shifts: s.shifts.length > 0 ? [...s.shifts].sort() : undefined,
      overtime_expected: flag(s.overtimeExpected),
      application_deadline: str(s.applicationDeadline),
    }),
    compensation: compact({
      min_cents: amount(s.compMin),
      max_cents: amount(s.compMax),
      currency:
        amount(s.compMin) != null ||
        amount(s.compMax) != null ||
        amount(s.guaranteedBase) != null ||
        amount(s.perDiem) != null
          ? str(s.currency.toUpperCase())
          : undefined,
      basis: str(s.basis),
      unit: str(s.unit),
      guaranteed_base_cents: amount(s.guaranteedBase),
      per_diem_cents: amount(s.perDiem),
      payment_frequency: str(s.paymentFrequency),
      deductions: deductions.length > 0 ? deductions : undefined,
      no_deductions: flag(s.noDeductions),
    }),
    accommodation:
      s.accommodationState.trim().length > 0
        ? compact({
            state: str(s.accommodationState),
            payer: str(s.accommodationPayer),
            price_cents: amount(s.accommodationPrice),
            price_period: str(s.accommodationPricePeriod),
            room: str(s.room),
            occupancy_per_room: int(s.occupancy),
            distance_km: num(s.distanceKm),
            amenities: s.amenities.length > 0 ? [...s.amenities].sort() : undefined,
            deposit_cents: amount(s.deposit),
            family_possible: flag(s.familyPossible),
          })
        : undefined,
    transport: compact({
      international_travel: str(s.internationalTravel),
      arrival_pickup: flag(s.arrivalPickup),
      daily: str(s.dailyTransport),
      between_sites: str(s.betweenSites),
      company_vehicle: flag(s.companyVehicle),
      fuel_card: flag(s.fuelCard),
      own_vehicle_required: flag(s.ownVehicleRequired),
      licence_categories:
        s.licenceCategories.length > 0 ? [...s.licenceCategories].sort() : undefined,
      return_travel_contribution: flag(s.returnTravel),
    }),
    requirements: compact({
      min_experience_years: int(s.minExperienceYears),
      languages:
        s.languages.length > 0
          ? s.languages
              .filter((l) => l.lang && l.level)
              .map((l) =>
                compact({
                  lang: l.lang,
                  level: l.level,
                  one_per_team_sufficient: flag(l.onePerTeam),
                }),
              )
          : undefined,
      certificates:
        s.certificates.map((c) => c.trim()).filter((c) => c.length > 0).length > 0
          ? s.certificates.map((c) => c.trim()).filter((c) => c.length > 0)
          : undefined,
      own_tools: flag(s.ownTools),
      own_vehicle: flag(s.ownVehicle),
      own_workwear: flag(s.ownWorkwear),
      drawings_reading: flag(s.drawingsReading),
      independent_work: flag(s.independentWork),
      leadership: flag(s.leadership),
    }),
    // Wagon 4 tiers — only explicitly picked values ship; "" (default) is
    // omitted so the engine's hardcoded behaviour stays untouched.
    requirement_priorities: compact(
      Object.fromEntries(
        REQUIREMENT_PRIORITY_KEYS.map((k) => [k, str(s.requirementPriorities[k])]),
      ),
    ),
    process: compact({
      application_method: str(s.applicationMethod),
      interview_stages: int(s.interviewStages),
      practical_test: flag(s.practicalTest),
      document_verification: flag(s.documentVerification),
      response_deadline_days: int(s.responseDeadlineDays),
      listing_kind: str(s.listingKind),
    }),
  });
  return wire;
}

/** Map a stored v2 cluster back into form state (duplicate-and-edit prefill).
 *  Unknown/absent values stay empty strings — the form never invents. */
export function storedV2ToFormState(
  v2: StructuredDemandV2 | null,
): AdvancedDemandFormState {
  if (!v2) return { ...EMPTY_ADVANCED_DEMAND_STATE };
  const c = v2.compensation;
  const a = v2.accommodation;
  const tr = v2.transport;
  const t = v2.time;
  const r = v2.requirements;
  const p = v2.process;
  const centsStr = (n: number | undefined) => (n == null ? "" : formatCents(n));
  return {
    ...EMPTY_ADVANCED_DEMAND_STATE,
    opportunityType: v2.opportunity_type ?? "",
    targetSupply: v2.target_supply ?? "",
    engagementForm: v2.engagement_form ?? "",
    contractCountry: v2.contract_country ?? "",
    startEarliest: t?.start_earliest ?? "",
    startLatest: t?.start_latest ?? "",
    endDate: t?.end_date ?? "",
    hoursPerWeek: t?.hours_per_week != null ? String(t.hours_per_week) : "",
    minGuaranteedHours:
      t?.min_guaranteed_hours != null ? String(t.min_guaranteed_hours) : "",
    shifts: [...(t?.shifts ?? [])],
    overtimeExpected: t?.overtime_expected === true,
    applicationDeadline: t?.application_deadline ?? "",
    compMin: centsStr(c?.min_cents),
    compMax: centsStr(c?.max_cents),
    currency: c?.currency ?? "EUR",
    basis: c?.basis ?? "",
    unit: c?.unit ?? "",
    guaranteedBase: centsStr(c?.guaranteed_base_cents),
    perDiem: centsStr(c?.per_diem_cents),
    paymentFrequency: c?.payment_frequency ?? "",
    deductions: (c?.deductions ?? []).map((d) => ({
      kind: d.kind,
      amount: centsStr(d.amount_cents),
      period: d.period ?? "",
    })),
    noDeductions: c?.no_deductions === true,
    accommodationState: a?.state ?? "",
    accommodationPayer: a?.payer ?? "",
    accommodationPrice: centsStr(a?.price_cents),
    accommodationPricePeriod: a?.price_period ?? "",
    room: a?.room ?? "",
    occupancy: a?.occupancy_per_room != null ? String(a.occupancy_per_room) : "",
    distanceKm: a?.distance_km != null ? String(a.distance_km) : "",
    amenities: [...(a?.amenities ?? [])],
    deposit: centsStr(a?.deposit_cents),
    familyPossible: a?.family_possible === true,
    internationalTravel: tr?.international_travel ?? "",
    dailyTransport: tr?.daily ?? "",
    betweenSites: tr?.between_sites ?? "",
    arrivalPickup: tr?.arrival_pickup === true,
    companyVehicle: tr?.company_vehicle === true,
    fuelCard: tr?.fuel_card === true,
    ownVehicleRequired: tr?.own_vehicle_required === true,
    licenceCategories: [...(tr?.licence_categories ?? [])],
    returnTravel: tr?.return_travel_contribution === true,
    minExperienceYears:
      r?.min_experience_years != null ? String(r.min_experience_years) : "",
    languages: (r?.languages ?? []).map((l) => ({
      lang: l.lang,
      level: l.level,
      onePerTeam: l.one_per_team_sufficient === true,
    })),
    certificates: [...(r?.certificates ?? [])],
    ownTools: r?.own_tools === true,
    ownVehicle: r?.own_vehicle === true,
    ownWorkwear: r?.own_workwear === true,
    drawingsReading: r?.drawings_reading === true,
    independentWork: r?.independent_work === true,
    leadership: r?.leadership === true,
    requirementPriorities: Object.fromEntries(
      REQUIREMENT_PRIORITY_KEYS.map((k) => [
        k,
        v2.requirement_priorities?.[k] ?? "",
      ]),
    ) as RequirementPriorityState,
    applicationMethod: p?.application_method ?? "",
    interviewStages: p?.interview_stages != null ? String(p.interview_stages) : "",
    practicalTest: p?.practical_test === true,
    documentVerification: p?.document_verification === true,
    responseDeadlineDays:
      p?.response_deadline_days != null ? String(p.response_deadline_days) : "",
    listingKind: p?.listing_kind ?? "",
  };
}
