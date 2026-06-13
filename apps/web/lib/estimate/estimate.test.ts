import { describe, it, expect } from "vitest";
import {
  computeEstimate,
  validateEstimateInputs,
  hasMeaningfulEstimate,
  estimateAssumptionKeys,
  estimateMissingInfoKeys,
  EMPTY_ESTIMATE_INPUTS,
  ESTIMATE_VERSION,
  type EstimateInputs,
} from "./estimate";

const base: EstimateInputs = {
  ...EMPTY_ESTIMATE_INPUTS,
  template: "construction",
  workType: "Concrete works",
  unitType: "square_meters",
  quantity: 100,
  workerCount: 3,
  hoursPerWorker: 40,
  totalHours: 0,
  rate: 20,
  country: "LT",
  urgency: "this_week",
  materials: 1000,
  equipment: 500,
  transportAccommodation: 300,
  overheadPercent: 10,
  marginPercent: 15,
  contingencyPercent: 10,
};

describe("computeEstimate — deterministic formulas", () => {
  it("computes the documented cascade exactly", () => {
    const r = computeEstimate(base);
    // labour = 3 * 40 * 20 = 2400
    expect(r.labourSubtotal).toBe(2400);
    // direct = 2400 + 1000 + 500 + 300 = 4200
    expect(r.directCosts).toBe(4200);
    // overhead = 4200 * 0.10 = 420
    expect(r.overhead).toBe(420);
    // margin = (4200 + 420) * 0.15 = 693
    expect(r.margin).toBe(693);
    // contingency = (4200 + 420 + 693) * 0.10 = 531.3
    expect(r.contingency).toBe(531.3);
    // total = 4200 + 420 + 693 + 531.3 = 5844.3
    expect(r.estimatedTotal).toBe(5844.3);
  });

  it("uses totalHours as an override when > 0", () => {
    const r = computeEstimate({ ...base, totalHours: 200, materials: 0, equipment: 0, transportAccommodation: 0, overheadPercent: 0, marginPercent: 0, contingencyPercent: 0 });
    // labour = 200 * 20 = 4000 (ignores workerCount * hoursPerWorker = 120)
    expect(r.labourSubtotal).toBe(4000);
    expect(r.estimatedTotal).toBe(4000);
  });

  it("produces a transparent low/base/high range from contingency", () => {
    const r = computeEstimate(base);
    expect(r.hasRange).toBe(true);
    // low = direct + overhead + margin (no reserve) = 5313
    expect(r.low).toBe(5313);
    expect(r.base).toBe(r.estimatedTotal);
    // high = low + contingency*2 = 5313 + 1062.6 = 6375.6
    expect(r.high).toBe(6375.6);
    expect(r.low).toBeLessThanOrEqual(r.base);
    expect(r.base).toBeLessThanOrEqual(r.high);
  });

  it("shows no range when contingency is 0", () => {
    const r = computeEstimate({ ...base, contingencyPercent: 0 });
    expect(r.hasRange).toBe(false);
    expect(r.contingency).toBe(0);
  });

  it("an all-zero estimate is zero, never NaN", () => {
    const r = computeEstimate(EMPTY_ESTIMATE_INPUTS);
    expect(r.estimatedTotal).toBe(0);
    expect(Number.isFinite(r.estimatedTotal)).toBe(true);
  });

  it("floors negative/garbage inputs to 0 in the preview (no nonsense numbers)", () => {
    const r = computeEstimate({
      ...base,
      rate: -20,
      materials: Number.NaN,
      // @ts-expect-error — exercise a non-number at runtime
      equipment: "oops",
    });
    expect(Number.isFinite(r.estimatedTotal)).toBe(true);
    expect(r.labourSubtotal).toBe(0); // rate floored to 0
    expect(r.materials).toBe(0);
    expect(r.equipment).toBe(0);
  });
});

describe("validateEstimateInputs — blocks invalid input", () => {
  it("accepts valid inputs", () => {
    expect(validateEstimateInputs(base)).toEqual([]);
  });
  it("blocks negative numbers", () => {
    expect(validateEstimateInputs({ ...base, rate: -1 })).toContain("negative_rate");
    expect(validateEstimateInputs({ ...base, quantity: -5 })).toContain("negative_quantity");
    expect(validateEstimateInputs({ ...base, materials: -100 })).toContain("negative_materials");
  });
  it("blocks impossible percentages (>100 or <0)", () => {
    expect(validateEstimateInputs({ ...base, marginPercent: 150 })).toContain("percent_out_of_range");
    expect(validateEstimateInputs({ ...base, overheadPercent: -1 })).toContain("percent_out_of_range");
  });
  it("blocks non-finite values", () => {
    expect(validateEstimateInputs({ ...base, rate: Number.POSITIVE_INFINITY })).toContain("not_finite");
  });
  it("flags an empty labour estimate only when saving is required", () => {
    const empty = { ...EMPTY_ESTIMATE_INPUTS };
    expect(validateEstimateInputs(empty)).toEqual([]); // not required → ok
    expect(validateEstimateInputs(empty, true)).toContain("empty_labour");
    expect(validateEstimateInputs(base, true)).not.toContain("empty_labour");
  });
});

describe("meaningful-input + assumptions + missing-info", () => {
  it("detects whether anything worth saving was entered", () => {
    expect(hasMeaningfulEstimate(EMPTY_ESTIMATE_INPUTS)).toBe(false);
    expect(hasMeaningfulEstimate(base)).toBe(true);
    expect(hasMeaningfulEstimate({ ...EMPTY_ESTIMATE_INPUTS, materials: 50 })).toBe(true);
  });
  it("always includes the preliminary assumption + reflects the inputs", () => {
    const keys = estimateAssumptionKeys(base);
    expect(keys).toContain("preliminary");
    expect(keys).toContain("rangeFromContingency");
    expect(estimateAssumptionKeys({ ...base, totalHours: 100 })).toContain("totalHoursUsed");
  });
  it("lists missing info to improve accuracy", () => {
    expect(estimateMissingInfoKeys(EMPTY_ESTIMATE_INPUTS)).toEqual(
      expect.arrayContaining(["rate", "hours", "materials", "contingency"]),
    );
    expect(estimateMissingInfoKeys(base)).not.toContain("rate");
  });
  it("version is stable", () => {
    expect(ESTIMATE_VERSION).toBe(1);
  });
});
