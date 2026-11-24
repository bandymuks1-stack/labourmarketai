import { describe, it, expect } from "vitest";

import {
  CONFIDENCE_HIGH_MIN_SAMPLE,
  CONFIDENCE_LEVELS,
  CONFIDENCE_MEDIUM_MIN_SAMPLE,
  confidenceLabelCode,
  confidenceRank,
  deriveConfidence,
  weakestConfidence,
  type ConfidenceInputsV1,
} from "./confidence";
import { INTELLIGENCE_MIN_COHORT_N } from "./privacy";

const COMPLETE: ConfidenceInputsV1 = {
  sampleSize: 100,
  freshness: "fresh",
  sourceLegalStatus: "confirmed",
  provenanceStepCount: 2,
};

describe("deriveConfidence — deterministic, never guessed", () => {
  it("any missing required input → unknown (never an optimistic default)", () => {
    expect(deriveConfidence({ ...COMPLETE, sampleSize: null })).toBe("unknown");
    expect(deriveConfidence({ ...COMPLETE, freshness: null })).toBe("unknown");
    expect(
      deriveConfidence({ ...COMPLETE, sourceLegalStatus: null }),
    ).toBe("unknown");
    expect(
      deriveConfidence({ ...COMPLETE, provenanceStepCount: null }),
    ).toBe("unknown");
  });

  it("unverified freshness → unknown", () => {
    expect(deriveConfidence({ ...COMPLETE, freshness: "unverified" })).toBe(
      "unknown",
    );
  });

  it("refused source → low, expired freshness → low", () => {
    expect(
      deriveConfidence({ ...COMPLETE, sourceLegalStatus: "refused" }),
    ).toBe("low");
    expect(deriveConfidence({ ...COMPLETE, freshness: "expired" })).toBe("low");
  });

  it("high requires fresh + confirmed + sample ≥ 30 + provenance ≥ 1", () => {
    expect(deriveConfidence(COMPLETE)).toBe("high");
    expect(
      deriveConfidence({ ...COMPLETE, sampleSize: CONFIDENCE_HIGH_MIN_SAMPLE }),
    ).toBe("high");
    // Each weakened leg individually drops the level below high.
    expect(deriveConfidence({ ...COMPLETE, freshness: "stale" })).toBe(
      "medium",
    );
    expect(
      deriveConfidence({
        ...COMPLETE,
        sampleSize: CONFIDENCE_HIGH_MIN_SAMPLE - 1,
      }),
    ).toBe("medium");
    expect(
      deriveConfidence({ ...COMPLETE, provenanceStepCount: 0 }),
    ).toBe("medium");
    expect(
      deriveConfidence({ ...COMPLETE, sourceLegalStatus: "unconfirmed" }),
    ).toBe("low");
  });

  it("medium floor is the platform cohort floor (§20 one privacy base)", () => {
    expect(CONFIDENCE_MEDIUM_MIN_SAMPLE).toBe(INTELLIGENCE_MIN_COHORT_N);
    expect(
      deriveConfidence({
        ...COMPLETE,
        freshness: "stale",
        sampleSize: CONFIDENCE_MEDIUM_MIN_SAMPLE,
      }),
    ).toBe("medium");
    expect(
      deriveConfidence({
        ...COMPLETE,
        freshness: "stale",
        sampleSize: CONFIDENCE_MEDIUM_MIN_SAMPLE - 1,
      }),
    ).toBe("low");
  });

  it("same inputs always yield the same level (deterministic)", () => {
    for (let i = 0; i < 3; i++) {
      expect(deriveConfidence(COMPLETE)).toBe("high");
    }
  });
});

describe("confidence helpers", () => {
  it("label codes are stable intelligence.confidence.* codes", () => {
    for (const level of CONFIDENCE_LEVELS) {
      expect(confidenceLabelCode(level)).toBe(
        `intelligence.confidence.${level}`,
      );
    }
  });

  it("rank orders unknown < low < medium < high", () => {
    expect(confidenceRank("unknown")).toBeLessThan(confidenceRank("low"));
    expect(confidenceRank("low")).toBeLessThan(confidenceRank("medium"));
    expect(confidenceRank("medium")).toBeLessThan(confidenceRank("high"));
  });

  it("weakestConfidence never upgrades — a blend is as weak as its weakest input", () => {
    expect(weakestConfidence(["high", "medium", "high"])).toBe("medium");
    expect(weakestConfidence(["high", "unknown"])).toBe("unknown");
    expect(weakestConfidence([])).toBe("unknown");
  });
});
