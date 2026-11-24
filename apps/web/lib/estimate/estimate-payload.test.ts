import { describe, it, expect } from "vitest";
import { buildEstimatePayload, parseStoredEstimate } from "./estimate-payload";
import { EMPTY_ESTIMATE_INPUTS, type EstimateInputs } from "./estimate";

const valid: EstimateInputs = {
  ...EMPTY_ESTIMATE_INPUTS,
  template: "construction",
  workerCount: 2,
  hoursPerWorker: 10,
  rate: 25,
  materials: 100,
  overheadPercent: 10,
  marginPercent: 10,
  contingencyPercent: 5,
};

describe("buildEstimatePayload", () => {
  it("builds a stored estimate with a server-recomputed result", () => {
    const stored = buildEstimatePayload(valid)!;
    expect(stored).toBeTruthy();
    expect(stored.version).toBe(1);
    // labour = 2*10*25 = 500; direct = 600; over=60; margin=66; cont=(726)*0.05=36.3
    expect(stored.result.labourSubtotal).toBe(500);
    expect(stored.result.estimatedTotal).toBe(762.3);
    expect(stored.assumptions).toContain("preliminary");
  });
  it("returns null for an empty (un-engaged) estimate", () => {
    expect(buildEstimatePayload(EMPTY_ESTIMATE_INPUTS)).toBeNull();
  });
  it("never builds an invalid estimate (negative input)", () => {
    expect(buildEstimatePayload({ ...valid, rate: -1 })).toBeNull();
  });
});

describe("parseStoredEstimate — tolerant read-back", () => {
  it("round-trips a stored estimate inside a request payload", () => {
    const stored = buildEstimatePayload(valid)!;
    const payload = { source: "dashboard_demand", estimate: stored };
    const parsed = parseStoredEstimate(payload)!;
    expect(parsed).toBeTruthy();
    expect(parsed.result.estimatedTotal).toBe(762.3);
  });
  it("returns null for older rows with no estimate (UI must not break)", () => {
    expect(parseStoredEstimate({ source: "dashboard_demand" })).toBeNull();
    expect(parseStoredEstimate(null)).toBeNull();
    expect(parseStoredEstimate({})).toBeNull();
    expect(parseStoredEstimate("garbage")).toBeNull();
  });
  it("returns null for a malformed estimate (no numeric total)", () => {
    expect(parseStoredEstimate({ estimate: { result: {} } })).toBeNull();
    expect(parseStoredEstimate({ estimate: { result: { estimatedTotal: "x" } } })).toBeNull();
  });
});
