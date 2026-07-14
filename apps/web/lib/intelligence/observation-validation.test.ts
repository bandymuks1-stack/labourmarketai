import { describe, it, expect } from "vitest";

import {
  validateObservationCandidate,
  type ObservationCandidateV1,
  type ObservationValidationContextV1,
} from "./observation-validation";
import { computeObservationContentHash } from "./observation-hash";
import { INTELLIGENCE_SOURCE_PROFILES } from "./source-governance";

const NOW = Date.parse("2026-07-14T12:00:00Z");

/** A structurally perfect INTERNAL observation (the only kind that can
 *  pass source approval today). */
function validObservation(overrides: Record<string, unknown> = {}) {
  const base = {
    subjectKind: "profession",
    subjectId: "electrician",
    metricKey: "salary.month.gross",
    geo: { country: "LT", region: null, city: null },
    window: { start: "2026-06-01", end: "2026-06-30" },
    valueNumeric: 2100,
    unit: "eur_month_gross",
    statMethod: "median",
    sourceKind: "internal_aggregated",
    sourceKey: "internal_platform_aggregates",
    sourceUrl: null,
    derivationIds: ["agg-run-1"],
    capturedAt: "2026-07-10T08:00:00Z",
    validFrom: "2026-07-10T08:00:00Z",
    validTo: null,
    sampleSize: 42,
    confidence: null,
    transformVersion: "v1",
    privacyClass: "public_aggregate",
    freshnessStatus: "fresh",
    provenance: [{ step: "aggregate", ref: "workers" }],
    ...overrides,
  };
  const contentHash = computeObservationContentHash({
    subjectKind: base.subjectKind as never,
    subjectId: base.subjectId as string,
    metricKey: base.metricKey as string,
    geo: base.geo as never,
    window: base.window as never,
    valueNumeric: base.valueNumeric as number,
    unit: base.unit as string,
    statMethod: base.statMethod as never,
    sourceKind: base.sourceKind as never,
    sourceKey: base.sourceKey as string,
    capturedAt: base.capturedAt as string,
    transformVersion: base.transformVersion as string,
  });
  // An explicit contentHash override WINS (for tamper tests).
  return { ...base, contentHash: (overrides.contentHash as string) ?? contentHash };
}

const CONTEXT: ObservationValidationContextV1 = {
  nowMs: NOW,
  knownContentHashes: new Set(),
  allowedCountries: ["LT"],
  allowedLanguages: ["lt"],
};

function candidate(
  observation: unknown,
  sourceLanguage: string | null = "lt",
): ObservationCandidateV1 {
  return { observation, sourceLanguage };
}

function failuresOf(result: ReturnType<typeof validateObservationCandidate>) {
  return result.ok ? [] : result.failures;
}

describe("validateObservationCandidate — deterministic gate", () => {
  it("a perfect internal candidate passes every check", () => {
    const result = validateObservationCandidate(
      candidate(validObservation()),
      CONTEXT,
    );
    expect(result.ok).toBe(true);
  });

  it("FAIL-CLOSED: every external source is rejected today (none active)", () => {
    for (const profile of INTELLIGENCE_SOURCE_PROFILES) {
      if (profile.sourceKind === "internal_aggregated") continue;
      const obs = validObservation({
        sourceKind: profile.sourceKind,
        sourceKey: profile.key,
        sourceUrl: "test://recorded-not-fetched",
        derivationIds: [],
      });
      const result = validateObservationCandidate(candidate(obs), CONTEXT);
      expect(result.ok, profile.key).toBe(false);
      expect(failuresOf(result)).toContainEqual({
        checkId: "source_approved",
        reasonCode: "source_not_active",
      });
    }
  });

  it("a claimed sourceKind that contradicts the registry is a hard failure", () => {
    // An external kind riding on an internal key must NOT be judged by the
    // internal branch (and vice versa) — the registry is the truth.
    const mislabelled = validObservation({
      sourceKind: "approved_public_web",
      sourceKey: "internal_platform_aggregates",
      sourceUrl: "test://claimed-external",
      derivationIds: [],
    });
    const result = validateObservationCandidate(candidate(mislabelled), CONTEXT);
    expect(result.ok).toBe(false);
    expect(failuresOf(result)).toContainEqual({
      checkId: "source_approved",
      reasonCode: "source_kind_mismatch",
    });
  });

  it("schema vs required_fields are classified separately", () => {
    const result = validateObservationCandidate(
      candidate({ subjectKind: "profession", valueNumeric: "NaN-ish" }),
      CONTEXT,
    );
    expect(result.ok).toBe(false);
    const checks = new Set(failuresOf(result).map((f) => f.checkId));
    expect(checks.has("required_fields")).toBe(true);
    expect(checks.has("schema")).toBe(true);
  });

  it("date validity: future capture, window after capture, bad validity range", () => {
    const future = validateObservationCandidate(
      candidate(validObservation({ capturedAt: "2027-01-01T00:00:00Z", validFrom: "2027-01-01T00:00:00Z" })),
      CONTEXT,
    );
    expect(failuresOf(future)).toContainEqual({
      checkId: "date_validity",
      reasonCode: "captured_in_future",
    });
    const windowAfter = validateObservationCandidate(
      candidate(
        validObservation({
          window: { start: "2026-07-01", end: "2026-07-12" },
          capturedAt: "2026-07-11T00:00:00Z",
          validFrom: "2026-07-11T00:00:00Z",
        }),
      ),
      CONTEXT,
    );
    expect(failuresOf(windowAfter)).toContainEqual({
      checkId: "date_validity",
      reasonCode: "window_ends_after_capture",
    });
    const badRange = validateObservationCandidate(
      candidate(
        validObservation({
          validTo: "2026-07-10T08:00:00Z", // == validFrom → refused
        }),
      ),
      CONTEXT,
    );
    expect(failuresOf(badRange)).toContainEqual({
      checkId: "date_validity",
      reasonCode: "valid_to_not_after_valid_from",
    });
  });

  it("country allowlist is fail-closed (empty policy rejects geo-tagged rows)", () => {
    const wrongCountry = validateObservationCandidate(
      candidate(validObservation({ geo: { country: "PL", region: null, city: null } })),
      CONTEXT,
    );
    expect(failuresOf(wrongCountry)).toContainEqual({
      checkId: "country",
      reasonCode: "country_not_in_import_policy",
    });
    const emptyPolicy = validateObservationCandidate(
      candidate(validObservation()),
      { ...CONTEXT, allowedCountries: [] },
    );
    expect(failuresOf(emptyPolicy)).toContainEqual({
      checkId: "country",
      reasonCode: "country_not_in_import_policy",
    });
  });

  it("language: undeclared or out-of-policy language is rejected", () => {
    expect(
      failuresOf(
        validateObservationCandidate(candidate(validObservation(), null), CONTEXT),
      ),
    ).toContainEqual({ checkId: "language", reasonCode: "language_undeclared" });
    expect(
      failuresOf(
        validateObservationCandidate(candidate(validObservation(), "en"), CONTEXT),
      ),
    ).toContainEqual({
      checkId: "language",
      reasonCode: "language_not_in_import_policy",
    });
  });

  it("salary structure: unknown unit and non-positive value are rejected", () => {
    expect(
      failuresOf(
        validateObservationCandidate(
          candidate(validObservation({ unit: "usd_year" })),
          CONTEXT,
        ),
      ),
    ).toContainEqual({
      checkId: "salary_structure",
      reasonCode: "salary_unit_unknown",
    });
    expect(
      failuresOf(
        validateObservationCandidate(
          candidate(validObservation({ valueNumeric: 0 })),
          CONTEXT,
        ),
      ),
    ).toContainEqual({
      checkId: "salary_structure",
      reasonCode: "salary_value_not_positive",
    });
    // Non-salary metrics skip the salary checks.
    const count = validateObservationCandidate(
      candidate(
        validObservation({ metricKey: "demand.role.count", unit: "count", valueNumeric: 0 }),
      ),
      CONTEXT,
    );
    expect(
      failuresOf(count).filter((f) => f.checkId === "salary_structure"),
    ).toEqual([]);
  });

  it("hash integrity: a claimed hash is never trusted, always recomputed", () => {
    const tampered = validateObservationCandidate(
      candidate(validObservation({ contentHash: "a".repeat(64) })),
      CONTEXT,
    );
    expect(failuresOf(tampered)).toContainEqual({
      checkId: "hash_integrity",
      reasonCode: "content_hash_mismatch",
    });
  });

  it("duplicate detection uses the RECOMPUTED hash", () => {
    const obs = validObservation();
    const recomputed = obs.contentHash;
    const result = validateObservationCandidate(candidate(obs), {
      ...CONTEXT,
      knownContentHashes: new Set([recomputed]),
    });
    expect(failuresOf(result)).toContainEqual({
      checkId: "duplicate",
      reasonCode: "duplicate",
    });
  });

  it("ALL failures are reported together, not just the first", () => {
    const obs = validObservation({
      geo: { country: "PL", region: null, city: null },
      unit: "usd_year",
    });
    const result = validateObservationCandidate(candidate(obs, "en"), CONTEXT);
    expect(result.ok).toBe(false);
    const checks = failuresOf(result).map((f) => f.checkId);
    expect(checks).toContain("country");
    expect(checks).toContain("language");
    expect(checks).toContain("salary_structure");
    // (No hash failure: the fixture recomputes a consistent hash — the
    //  failures above prove multi-check reporting on their own.)
    expect(checks).not.toContain("hash_integrity");
  });
});
