import { describe, it, expect } from "vitest";

import {
  intelligenceObservationSchema,
  type IntelligenceObservationV1,
} from "./observation-contract";
import {
  allExternalSourcesOff,
  getSourceProfile,
  INTELLIGENCE_SOURCE_PROFILES,
  isExternalSourceActive,
} from "./source-governance";
import { deriveSourceLifecycleState } from "./source-lifecycle";
import { detectContradiction } from "./contradiction";
import { computeObservationContentHash } from "./observation-hash";

/**
 * MULTI-SOURCE CONTRACT (Trust Layer v1, §8) — verifies the architecture
 * already supports multiple simultaneous providers WITHOUT integrating any:
 * the registry can name them, the observation contract can carry any of
 * them side by side, hashes keep same-figure/different-source observations
 * distinct, and contradiction detection can compare across providers.
 * Every external provider stays proposed-only and OFF (guard-pinned).
 */

/** The future provider set named in the roadmap. */
const EXPECTED_PROVIDER_KEYS = [
  "internal_platform_aggregates",
  "cvbankas_salary",
  "eurostat",
  "stat_gov_lt",
  "eures",
  "uzt_lt",
] as const;

function observationFor(
  sourceKey: string,
  overrides: Partial<IntelligenceObservationV1> = {},
): IntelligenceObservationV1 {
  const profile = getSourceProfile(sourceKey);
  const internal = profile?.sourceKind === "internal_aggregated";
  return intelligenceObservationSchema.parse({
    subjectKind: "profession",
    subjectId: "electrician",
    metricKey: "salary.month.gross",
    geo: { country: "LT", region: null, city: null },
    window: { start: "2026-06-01", end: "2026-06-30" },
    valueNumeric: 2100,
    unit: "eur_month_gross",
    statMethod: "median",
    sourceKind: profile?.sourceKind ?? "public_official",
    sourceKey,
    sourceUrl: internal ? null : "test://placeholder-not-fetched",
    derivationIds: internal ? ["agg-run-1"] : [],
    capturedAt: "2026-07-10T08:00:00Z",
    validFrom: "2026-07-10T08:00:00Z",
    validTo: null,
    sampleSize: 42,
    confidence: null,
    transformVersion: "v1",
    privacyClass: "public_aggregate",
    freshnessStatus: "fresh",
    provenance: [{ step: "capture", ref: sourceKey }],
    contentHash: "recomputed-below",
    ...overrides,
  });
}

describe("registry names every roadmap provider — all external ones OFF", () => {
  it("each expected provider has a profile", () => {
    for (const key of EXPECTED_PROVIDER_KEYS) {
      expect(getSourceProfile(key), key).not.toBeNull();
    }
  });

  it("≥4 distinct external providers coexist; only eurostat is active, the rest proposed", () => {
    const external = INTELLIGENCE_SOURCE_PROFILES.filter(
      (p) => p.sourceKind !== "internal_aggregated",
    );
    expect(external.length).toBeGreaterThanOrEqual(4);
    expect(new Set(external.map((p) => p.key)).size).toBe(external.length);
    for (const p of external) {
      if (p.key === "eurostat") {
        expect(isExternalSourceActive(p.key), p.key).toBe(true);
        expect(deriveSourceLifecycleState(p), p.key).toBe("active");
      } else {
        // Not active — the invariant. A provider that has confirmed its terms
        // (arbetsformedlingen) sits in `approved`; one that has not answered
        // stays `proposed`. Neither imports anything.
        expect(isExternalSourceActive(p.key), p.key).toBe(false);
        expect(
          ["proposed", "approved"],
          `${p.key} lifecycle`,
        ).toContain(deriveSourceLifecycleState(p));
      }
    }
    // eurostat is active → not all off
    expect(allExternalSourcesOff()).toBe(false);
  });
});

describe("one observation contract carries any provider side by side", () => {
  it("observations from every provider validate against the SAME schema", () => {
    for (const key of EXPECTED_PROVIDER_KEYS) {
      expect(() => observationFor(key), key).not.toThrow();
    }
  });

  it("same figure from two providers stays two distinct observations (hash identity)", () => {
    const internal = observationFor("internal_platform_aggregates");
    const external = observationFor("eurostat");
    const hashOf = (o: IntelligenceObservationV1) =>
      computeObservationContentHash({
        subjectKind: o.subjectKind,
        subjectId: o.subjectId,
        metricKey: o.metricKey,
        geo: o.geo,
        window: o.window,
        valueNumeric: o.valueNumeric,
        unit: o.unit,
        statMethod: o.statMethod,
        sourceKind: o.sourceKind,
        sourceKey: o.sourceKey,
        capturedAt: o.capturedAt,
        transformVersion: o.transformVersion,
      });
    expect(hashOf(internal)).not.toBe(hashOf(external));
    expect(hashOf(internal)).toBe(hashOf(internal)); // idempotent
  });
});

describe("cross-provider comparison works without integration", () => {
  it("two providers' signals for the same subject compare — disagreement is an EXPOSED conflict", () => {
    const a = observationFor("internal_platform_aggregates");
    const b = observationFor("stat_gov_lt", { valueNumeric: 3000 });
    const toSignal = (
      o: IntelligenceObservationV1,
      originKind: "internal" | "external",
    ) => ({
      subjectKind: o.subjectKind,
      subjectId: o.subjectId,
      metricKey: o.metricKey,
      unit: o.unit,
      statMethod: o.statMethod,
      geo: o.geo,
      window: o.window,
      valueNumeric: o.valueNumeric,
      sourceKey: o.sourceKey,
      originKind,
    });
    const result = detectContradiction(
      toSignal(a, "internal"),
      toSignal(b, "external"),
    );
    expect(result.kind).toBe("conflict");
  });
});
