import { describe, expect, it } from "vitest";
import {
  AREA_QUANTITY_PACK_VERSION,
  EMPTY_AREA_QUANTITY_INPUTS,
  applyAreaQuantityToEstimate,
  computeAreaQuantity,
  validateAreaQuantityInputs,
  type AreaQuantityInputs,
} from "./area-quantity-v1";
import { EMPTY_ESTIMATE_INPUTS, computeEstimate } from "../estimate";

/** The mandated acceptance fixture: 100 m² net, 3 × 50 mm layers, 5 % waste,
 *  6 m²/package. */
const ACCEPTANCE: AreaQuantityInputs = {
  ...EMPTY_AREA_QUANTITY_INPUTS,
  netAreaM2: 100,
  layers: 3,
  layerThicknessMm: 50,
  wastePercent: 5,
  coveragePerPackageM2: 6,
};

describe("area quantity pack v1 — acceptance fixtures", () => {
  it("100 m² × 3 layers → 300 m² coverage, 315 m² with 5 % waste", () => {
    const r = computeAreaQuantity(ACCEPTANCE);
    expect(r.version).toBe(AREA_QUANTITY_PACK_VERSION);
    expect(r.netAreaM2).toBe(100);
    expect(r.coverageAreaM2).toBe(300);
    expect(r.coverageWithWasteM2).toBe(315);
  });
  it("315 m² at 6 m²/package → 53 packages (52.5 rounds UP)", () => {
    expect(computeAreaQuantity(ACCEPTANCE).packageCount).toBe(53);
  });
  it("3 × 50 mm over 100 m² → 15 m³ volume", () => {
    expect(computeAreaQuantity(ACCEPTANCE).insulationVolumeM3).toBe(15);
  });
});

describe("package rounding never rounds down", () => {
  it("exact division stays exact (300 / 6 = 50, no float-drift ceil to 51)", () => {
    const r = computeAreaQuantity({ ...ACCEPTANCE, wastePercent: 0 });
    expect(r.coverageWithWasteM2).toBe(300);
    expect(r.packageCount).toBe(50);
  });
  it("any fractional remainder buys a whole extra package", () => {
    const fixtures: Array<[number, number, number]> = [
      // [coverage needed via netArea (1 layer, 0 waste), per-package, expected]
      [10.1, 5, 3],
      [0.1, 6, 1],
      [99.999, 10, 10], // rounds to 100.00 m² coverage (2-decimal area policy)
      [100.01, 10, 11],
    ];
    for (const [net, per, expected] of fixtures) {
      const r = computeAreaQuantity({
        ...EMPTY_AREA_QUANTITY_INPUTS,
        netAreaM2: net,
        coveragePerPackageM2: per,
      });
      expect(r.packageCount, `${net} m² / ${per} m²`).toBe(expected);
      // Invariant: bought coverage is never below the required coverage.
      expect(r.packageCount * per).toBeGreaterThanOrEqual(r.coverageWithWasteM2 - 1e-9);
    }
  });
  it("float-noise fractions (0.1 + 0.2 style) still round up, not down", () => {
    const r = computeAreaQuantity({
      ...EMPTY_AREA_QUANTITY_INPUTS,
      netAreaM2: 0.30000000000000004,
      coveragePerPackageM2: 0.3,
    });
    expect(r.packageCount).toBe(1);
  });
});

describe("honest zero — never invented values", () => {
  it("no per-package coverage → 0 packages and 0 material cost", () => {
    const r = computeAreaQuantity({ ...ACCEPTANCE, coveragePerPackageM2: 0 });
    expect(r.packageCount).toBe(0);
    expect(r.materialCost).toBe(0);
  });
  it("no crew size → no duration claim", () => {
    const r = computeAreaQuantity({ ...ACCEPTANCE, labourHoursPerM2: 0.5, crewSize: 0 });
    expect(r.labourHours).toBe(150);
    expect(r.crewDurationHours).toBe(0);
  });
  it("dimension mode subtracts openings, floors at zero", () => {
    const r = computeAreaQuantity({
      ...EMPTY_AREA_QUANTITY_INPUTS,
      lengthM: 10,
      heightM: 3,
      openingsAreaM2: 4,
    });
    expect(r.netAreaM2).toBe(26);
    const floored = computeAreaQuantity({
      ...EMPTY_AREA_QUANTITY_INPUTS,
      lengthM: 2,
      heightM: 1,
      openingsAreaM2: 10,
    });
    expect(floored.netAreaM2).toBe(0);
  });
  it("validation flags missing area and out-of-range waste/layers", () => {
    expect(validateAreaQuantityInputs(EMPTY_AREA_QUANTITY_INPUTS)).toContain("no_area");
    expect(
      validateAreaQuantityInputs({ ...ACCEPTANCE, wastePercent: 150 }),
    ).toContain("waste_out_of_range");
    expect(validateAreaQuantityInputs({ ...ACCEPTANCE, layers: 0 })).toContain(
      "layers_out_of_range",
    );
  });
});

describe("pack feeds the EXISTING engine (no second engine)", () => {
  it("apply maps net area / labour hours / material cost onto engine fields", () => {
    const pack = computeAreaQuantity({
      ...ACCEPTANCE,
      pricePerPackage: 10,
      labourHoursPerM2: 0.5,
      crewSize: 3,
    });
    const applied = applyAreaQuantityToEstimate(EMPTY_ESTIMATE_INPUTS, pack);
    expect(applied.unitType).toBe("square_meters");
    expect(applied.quantity).toBe(100);
    expect(applied.totalHours).toBe(150);
    expect(applied.materials).toBe(530); // 53 packages × 10
    // The shared engine consumes the applied fields deterministically.
    const result = computeEstimate({ ...applied, rate: 20 });
    expect(result.labourSubtotal).toBe(3000);
    expect(result.materials).toBe(530);
    expect(result.estimatedTotal).toBe(3530);
  });
});
