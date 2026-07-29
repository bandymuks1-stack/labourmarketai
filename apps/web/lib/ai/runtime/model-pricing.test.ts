/**
 * Model pricing — real-cost math, honest nulls for unknown models/usage,
 * alias ↔ concrete-id consistency. Pure — no env, no network.
 */
import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING_USD_PER_MTOK,
  computeActualCostUsd,
  pricingForModel,
} from "./model-pricing";
import { AI_MODEL_CANDIDATES } from "./model-candidates";

describe("pricing table", () => {
  it("covers every routing alias and every anthropic candidate id", () => {
    for (const alias of ["haiku", "sonnet", "opus"] as const) {
      expect(pricingForModel(alias), alias).not.toBeNull();
      expect(
        pricingForModel(AI_MODEL_CANDIDATES.anthropic[alias]),
        AI_MODEL_CANDIDATES.anthropic[alias],
      ).not.toBeNull();
    }
  });

  it("alias and concrete id price identically (no drift)", () => {
    for (const alias of ["haiku", "sonnet", "opus"] as const) {
      expect(pricingForModel(AI_MODEL_CANDIDATES.anthropic[alias])).toEqual(
        pricingForModel(alias),
      );
    }
  });

  it("cheapest-sufficient ordering holds: haiku < sonnet < opus", () => {
    const h = MODEL_PRICING_USD_PER_MTOK.haiku;
    const s = MODEL_PRICING_USD_PER_MTOK.sonnet;
    const o = MODEL_PRICING_USD_PER_MTOK.opus;
    expect(h.inputUsdPerMTok).toBeLessThan(s.inputUsdPerMTok);
    expect(s.inputUsdPerMTok).toBeLessThan(o.inputUsdPerMTok);
    expect(h.outputUsdPerMTok).toBeLessThan(s.outputUsdPerMTok);
    expect(s.outputUsdPerMTok).toBeLessThan(o.outputUsdPerMTok);
  });
});

describe("computeActualCostUsd", () => {
  it("computes cost from token usage (1M input + 1M output on sonnet = 3 + 15 USD)", () => {
    expect(computeActualCostUsd("sonnet", 1_000_000, 1_000_000)).toBe(18);
  });

  it("computes fractional costs with micro-dollar rounding", () => {
    // haiku: 1000 in * $1/MTok + 500 out * $5/MTok = 0.001 + 0.0025 = 0.0035
    expect(computeActualCostUsd("haiku", 1000, 500)).toBe(0.0035);
    // concrete id prices identically
    expect(
      computeActualCostUsd(AI_MODEL_CANDIDATES.anthropic.haiku, 1000, 500),
    ).toBe(0.0035);
  });

  it("zero usage costs zero (a real zero, not a fabrication)", () => {
    expect(computeActualCostUsd("opus", 0, 0)).toBe(0);
  });

  it("unknown model → null (never fabricated)", () => {
    expect(computeActualCostUsd("some-unknown-model", 1000, 1000)).toBeNull();
    // Non-anthropic candidates are deliberately unpriced until owner review.
    expect(computeActualCostUsd(AI_MODEL_CANDIDATES.openai.opus, 1000, 1000)).toBeNull();
    expect(computeActualCostUsd("deepl-v2", 1000, 1000)).toBeNull();
  });

  it("missing / invalid usage → null (never fabricated)", () => {
    expect(computeActualCostUsd("sonnet", null, 1000)).toBeNull();
    expect(computeActualCostUsd("sonnet", 1000, undefined)).toBeNull();
    expect(computeActualCostUsd("sonnet", -1, 1000)).toBeNull();
    expect(computeActualCostUsd("sonnet", Number.NaN, 1000)).toBeNull();
  });
});
