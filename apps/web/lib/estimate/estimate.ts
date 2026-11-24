/**
 * Estimate Builder — deterministic, transparent preliminary work estimate.
 *
 * Pure functions only. NO LLM, NO external call, NO fabricated prices — every
 * number is derived arithmetically from the user's own inputs, and the output
 * is explicitly a PRELIMINARY estimate, never a binding quote.
 *
 * Template-based so the same engine serves construction (the first urgent case)
 * AND logistics / cleaning / hospitality / manufacturing / care / admin / IT —
 * the template only carries metadata + default unit; the math is sector-neutral.
 *
 * Isomorphic (no `server-only`, no IO) so the client renders a live preview and
 * the server recomputes the authoritative result before persisting.
 */

export type EstimateTemplate =
  | "construction"
  | "logistics"
  | "cleaning"
  | "hospitality"
  | "manufacturing"
  | "care"
  | "admin"
  | "it_service"
  | "general";

export const ESTIMATE_TEMPLATES: readonly EstimateTemplate[] = [
  "construction",
  "logistics",
  "cleaning",
  "hospitality",
  "manufacturing",
  "care",
  "admin",
  "it_service",
  "general",
];

export type UnitType =
  | "hours"
  | "days"
  | "square_meters"
  | "cubic_meters"
  | "units"
  | "custom";

export const UNIT_TYPES: readonly UnitType[] = [
  "hours",
  "days",
  "square_meters",
  "cubic_meters",
  "units",
  "custom",
];

/** Schema version stored alongside the estimate so a later engine can migrate. */
export const ESTIMATE_VERSION = 1;

/** Raw user-entered numbers + context. Percentages are whole numbers (0–100). */
export interface EstimateInputs {
  readonly template: EstimateTemplate;
  readonly workType: string;
  readonly unitType: UnitType;
  readonly quantity: number;
  readonly workerCount: number;
  readonly hoursPerWorker: number;
  /** Optional override — when > 0 it replaces workerCount × hoursPerWorker. */
  readonly totalHours: number;
  readonly rate: number;
  readonly country: string;
  readonly urgency: "flexible" | "this_week" | "urgent";
  readonly materials: number;
  readonly equipment: number;
  readonly transportAccommodation: number;
  readonly overheadPercent: number;
  readonly marginPercent: number;
  readonly contingencyPercent: number;
  /** Display-only currency code (e.g. "EUR"). Never used in arithmetic. */
  readonly currency: string;
}

export interface EstimateResult {
  readonly labourHours: number;
  readonly labourSubtotal: number;
  readonly materials: number;
  readonly equipment: number;
  readonly transportAccommodation: number;
  readonly directCosts: number;
  readonly overhead: number;
  readonly margin: number;
  readonly contingency: number;
  readonly estimatedTotal: number;
  /** Transparent range derived from the contingency reserve (only when > 0). */
  readonly low: number;
  readonly base: number;
  readonly high: number;
  readonly hasRange: boolean;
  readonly currency: string;
}

export type EstimateProblem =
  | "negative_quantity"
  | "negative_worker_count"
  | "negative_hours"
  | "negative_rate"
  | "negative_materials"
  | "negative_equipment"
  | "negative_transport"
  | "percent_out_of_range"
  | "not_finite"
  | "empty_labour";

/** Default empty inputs (general template) — a safe starting point for the UI. */
export const EMPTY_ESTIMATE_INPUTS: EstimateInputs = {
  template: "general",
  workType: "",
  unitType: "hours",
  quantity: 0,
  workerCount: 0,
  hoursPerWorker: 0,
  totalHours: 0,
  rate: 0,
  country: "",
  urgency: "flexible",
  materials: 0,
  equipment: 0,
  transportAccommodation: 0,
  overheadPercent: 0,
  marginPercent: 0,
  contingencyPercent: 0,
  currency: "EUR",
};

const MAX_PERCENT = 100;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Round to 2 decimals (cents) without floating-point drift. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Validate inputs. Returns the list of problems (empty = valid). `requireLabour`
 * additionally flags an estimate with no labour subtotal as `empty_labour` — used
 * when the user is trying to SAVE an estimate (an empty estimate is never saved).
 */
export function validateEstimateInputs(
  inputs: EstimateInputs,
  requireLabour = false,
): EstimateProblem[] {
  const problems: EstimateProblem[] = [];
  const numericFields: Array<[keyof EstimateInputs, EstimateProblem]> = [
    ["quantity", "negative_quantity"],
    ["workerCount", "negative_worker_count"],
    ["hoursPerWorker", "negative_hours"],
    ["totalHours", "negative_hours"],
    ["rate", "negative_rate"],
    ["materials", "negative_materials"],
    ["equipment", "negative_equipment"],
    ["transportAccommodation", "negative_transport"],
  ];
  for (const [field, problem] of numericFields) {
    const v = inputs[field] as number;
    if (typeof v !== "number" || !Number.isFinite(v)) {
      if (!problems.includes("not_finite")) problems.push("not_finite");
    } else if (v < 0 && !problems.includes(problem)) {
      problems.push(problem);
    }
  }
  for (const p of [
    inputs.overheadPercent,
    inputs.marginPercent,
    inputs.contingencyPercent,
  ]) {
    if (typeof p !== "number" || !Number.isFinite(p)) {
      if (!problems.includes("not_finite")) problems.push("not_finite");
    } else if (p < 0 || p > MAX_PERCENT) {
      if (!problems.includes("percent_out_of_range"))
        problems.push("percent_out_of_range");
    }
  }
  if (requireLabour) {
    const labourHours =
      num(inputs.totalHours) > 0
        ? num(inputs.totalHours)
        : num(inputs.workerCount) * num(inputs.hoursPerWorker);
    if (labourHours * num(inputs.rate) <= 0) problems.push("empty_labour");
  }
  return problems;
}

/** True when the user entered something worth saving (labour or any cost). */
export function hasMeaningfulEstimate(inputs: EstimateInputs): boolean {
  const labourHours =
    num(inputs.totalHours) > 0
      ? num(inputs.totalHours)
      : num(inputs.workerCount) * num(inputs.hoursPerWorker);
  const labour = labourHours * num(inputs.rate);
  return (
    labour > 0 ||
    num(inputs.materials) > 0 ||
    num(inputs.equipment) > 0 ||
    num(inputs.transportAccommodation) > 0
  );
}

/**
 * Deterministic estimate. Invalid/negative inputs are floored to 0 here so the
 * preview never shows a nonsense number — callers use validateEstimateInputs to
 * surface problems and block saving.
 *
 * Formulas (per the product spec):
 *   labourSubtotal = effectiveHours × rate
 *   directCosts    = labourSubtotal + materials + equipment + transport
 *   overhead       = directCosts × overhead%
 *   margin         = (directCosts + overhead) × margin%
 *   contingency    = (directCosts + overhead + margin) × contingency%
 *   estimatedTotal = directCosts + overhead + margin + contingency
 *
 * Range (only when contingency% > 0):
 *   low  = directCosts + overhead + margin                (no risk reserve)
 *   base = estimatedTotal                                 (one reserve)
 *   high = directCosts + overhead + margin + contingency×2 (doubled reserve)
 */
export function computeEstimate(inputs: EstimateInputs): EstimateResult {
  const clampNonNeg = (v: unknown) => Math.max(0, num(v));
  const pct = (v: unknown) => Math.min(MAX_PERCENT, Math.max(0, num(v))) / 100;

  const totalHours = clampNonNeg(inputs.totalHours);
  const workerCount = clampNonNeg(inputs.workerCount);
  const hoursPerWorker = clampNonNeg(inputs.hoursPerWorker);
  const rate = clampNonNeg(inputs.rate);
  const materials = clampNonNeg(inputs.materials);
  const equipment = clampNonNeg(inputs.equipment);
  const transport = clampNonNeg(inputs.transportAccommodation);

  const labourHours = totalHours > 0 ? totalHours : workerCount * hoursPerWorker;
  const labourSubtotal = round2(labourHours * rate);
  const directCosts = round2(labourSubtotal + materials + equipment + transport);
  const overhead = round2(directCosts * pct(inputs.overheadPercent));
  const margin = round2((directCosts + overhead) * pct(inputs.marginPercent));
  const contingency = round2(
    (directCosts + overhead + margin) * pct(inputs.contingencyPercent),
  );
  const estimatedTotal = round2(directCosts + overhead + margin + contingency);

  const hasRange = pct(inputs.contingencyPercent) > 0 && estimatedTotal > 0;
  const low = round2(directCosts + overhead + margin);
  const base = estimatedTotal;
  const high = round2(directCosts + overhead + margin + contingency * 2);

  return {
    labourHours: round2(labourHours),
    labourSubtotal,
    materials: round2(materials),
    equipment: round2(equipment),
    transportAccommodation: round2(transport),
    directCosts,
    overhead,
    margin,
    contingency,
    estimatedTotal,
    low,
    base,
    high,
    hasRange,
    currency: typeof inputs.currency === "string" && inputs.currency ? inputs.currency : "EUR",
  };
}

/** Stable list of assumption KEYS (UI maps to localized text). Pure. */
export function estimateAssumptionKeys(inputs: EstimateInputs): string[] {
  const keys: string[] = ["preliminary"];
  if (num(inputs.totalHours) > 0) keys.push("totalHoursUsed");
  else keys.push("labourFromWorkersHours");
  if (num(inputs.overheadPercent) === 0) keys.push("noOverhead");
  if (num(inputs.marginPercent) === 0) keys.push("noMargin");
  if (computeEstimate(inputs).hasRange) keys.push("rangeFromContingency");
  return keys;
}

/** Stable list of MISSING-INFO keys to improve accuracy (UI maps to text). */
export function estimateMissingInfoKeys(inputs: EstimateInputs): string[] {
  const keys: string[] = [];
  if (num(inputs.rate) <= 0) keys.push("rate");
  const labourHours =
    num(inputs.totalHours) > 0
      ? num(inputs.totalHours)
      : num(inputs.workerCount) * num(inputs.hoursPerWorker);
  if (labourHours <= 0) keys.push("hours");
  if (num(inputs.materials) === 0) keys.push("materials");
  if (num(inputs.contingencyPercent) === 0) keys.push("contingency");
  return keys;
}
