/**
 * Area quantity pack v1 (insulation / area-based construction quantities).
 *
 * PURE, deterministic, versioned. Turns user-entered surface dimensions +
 * material data into quantity outputs that FEED the existing estimate engine
 * fields (`quantity`, `totalHours`, `materials`) — this module never computes
 * a price total itself and never invents a rate. It is a QUANTITY estimate
 * helper, not structural design: it gives no advice about the structure,
 * statics or safety of a building, only material quantities.
 *
 * Rounding policy:
 *  - package count ALWAYS rounds UP (you cannot buy 52.5 packages) — after a
 *    6-decimal float-noise trim so an exact division (300 / 6 = 50) never
 *    rounds up to 51 from binary float drift;
 *  - money and hours round to 2 decimals (same policy as lib/estimate).
 */

/** Schema version for this pack's outputs. */
export const AREA_QUANTITY_PACK_VERSION = 1;

export interface AreaQuantityInputs {
  /** Direct net area in m² — when > 0 it wins over the dimension pair. */
  readonly netAreaM2: number;
  /** Dimension option: surface length (m) × height/width (m). */
  readonly lengthM: number;
  readonly heightM: number;
  /** Total openings (windows / doors) subtracted from the gross area, m². */
  readonly openingsAreaM2: number;
  /** Number of identical material layers (e.g. 3 × 50 mm). Minimum 1. */
  readonly layers: number;
  /** Thickness of ONE layer in millimetres (volume output only). */
  readonly layerThicknessMm: number;
  /** Cutting / fitting waste percentage (0–100). */
  readonly wastePercent: number;
  /** Coverage of ONE package in m². */
  readonly coveragePerPackageM2: number;
  /** User-entered price per package (their own currency). 0 = not entered. */
  readonly pricePerPackage: number;
  /** User-entered labour hours per installed m² (per layer). 0 = not entered. */
  readonly labourHoursPerM2: number;
  /** Crew size used to derive duration. 0 = not entered. */
  readonly crewSize: number;
}

export interface AreaQuantityResult {
  readonly version: number;
  /** Net surface area (gross − openings, floored at 0), m². */
  readonly netAreaM2: number;
  /** Installed coverage area = net × layers, m². */
  readonly coverageAreaM2: number;
  /** Coverage including waste = coverage × (1 + waste%), m². */
  readonly coverageWithWasteM2: number;
  /** Whole packages to buy — ALWAYS rounded up, never down. 0 when the
   *  per-package coverage is not entered (never invented). */
  readonly packageCount: number;
  /** packageCount × pricePerPackage (0 when price not entered). */
  readonly materialCost: number;
  /** coverageArea × labourHoursPerM2 (waste adds material, not labour). */
  readonly labourHours: number;
  /** labourHours / crewSize (0 when crew size not entered). */
  readonly crewDurationHours: number;
  /** Material volume = net area × layers × thickness, m³. */
  readonly insulationVolumeM3: number;
}

/** Empty pack inputs — safe UI starting point. */
export const EMPTY_AREA_QUANTITY_INPUTS: AreaQuantityInputs = {
  netAreaM2: 0,
  lengthM: 0,
  heightM: 0,
  openingsAreaM2: 0,
  layers: 1,
  layerThicknessMm: 0,
  wastePercent: 0,
  coveragePerPackageM2: 0,
  pricePerPackage: 0,
  labourHoursPerM2: 0,
  crewSize: 0,
};

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** Round to 2 decimals — same policy as lib/estimate/estimate.ts. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Trim binary float noise to 6 decimals before a ceil. */
function trim6(n: number): number {
  return Number(n.toFixed(6));
}

export type AreaQuantityProblem =
  | "no_area"
  | "waste_out_of_range"
  | "layers_out_of_range";

/** Validation for the pack (empty list = usable). */
export function validateAreaQuantityInputs(
  inputs: AreaQuantityInputs,
): AreaQuantityProblem[] {
  const problems: AreaQuantityProblem[] = [];
  const direct = num(inputs.netAreaM2);
  const fromDims =
    Math.max(0, num(inputs.lengthM) * num(inputs.heightM) - num(inputs.openingsAreaM2));
  if (direct <= 0 && fromDims <= 0) problems.push("no_area");
  const waste = inputs.wastePercent;
  if (!Number.isFinite(waste) || waste < 0 || waste > 100) {
    problems.push("waste_out_of_range");
  }
  const layers = inputs.layers;
  if (!Number.isFinite(layers) || layers < 1 || layers > 20) {
    problems.push("layers_out_of_range");
  }
  return problems;
}

/**
 * Deterministic quantity derivation. Missing optional inputs (price, labour
 * rate, crew, coverage) produce 0 for their dependent outputs — the UI marks
 * those lines incomplete; nothing is ever invented.
 */
export function computeAreaQuantity(inputs: AreaQuantityInputs): AreaQuantityResult {
  const direct = num(inputs.netAreaM2);
  const gross = num(inputs.lengthM) * num(inputs.heightM);
  const netAreaM2 =
    direct > 0 ? direct : Math.max(0, gross - num(inputs.openingsAreaM2));

  const layers = Math.min(20, Math.max(1, Math.trunc(num(inputs.layers)) || 1));
  const wastePct = Math.min(100, num(inputs.wastePercent)) / 100;

  const coverageAreaM2 = round2(netAreaM2 * layers);
  const coverageWithWasteM2 = round2(coverageAreaM2 * (1 + wastePct));

  const coveragePerPackage = num(inputs.coveragePerPackageM2);
  // ALWAYS up, never down — after float-noise trim so exact divisions stay exact.
  const packageCount =
    coveragePerPackage > 0
      ? Math.ceil(trim6(coverageWithWasteM2 / coveragePerPackage))
      : 0;

  const pricePerPackage = num(inputs.pricePerPackage);
  const materialCost = round2(packageCount * pricePerPackage);

  const labourHours = round2(coverageAreaM2 * num(inputs.labourHoursPerM2));
  const crewSize = num(inputs.crewSize);
  const crewDurationHours = crewSize > 0 ? round2(labourHours / crewSize) : 0;

  const insulationVolumeM3 = round2(
    netAreaM2 * layers * (num(inputs.layerThicknessMm) / 1000),
  );

  return {
    version: AREA_QUANTITY_PACK_VERSION,
    netAreaM2: round2(netAreaM2),
    coverageAreaM2,
    coverageWithWasteM2,
    packageCount,
    materialCost,
    labourHours,
    crewDurationHours,
    insulationVolumeM3,
  };
}

/**
 * Feed the pack outputs into existing engine fields. Overwrites exactly
 * `unitType`, `quantity`, `totalHours` and `materials` on the given estimate
 * inputs — the user sees the applied values in the estimate form and can
 * still edit them (the pack is a helper, not a lock).
 */
export function applyAreaQuantityToEstimate<
  T extends {
    unitType: string;
    quantity: number;
    totalHours: number;
    materials: number;
  },
>(estimate: T, pack: AreaQuantityResult): T {
  return {
    ...estimate,
    unitType: "square_meters",
    quantity: pack.netAreaM2,
    totalHours: pack.labourHours,
    materials: pack.materialCost,
  };
}
