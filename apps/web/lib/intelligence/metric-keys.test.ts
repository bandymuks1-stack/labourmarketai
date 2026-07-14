import { describe, it, expect } from "vitest";

import {
  INTELLIGENCE_METRIC_KEYS,
  INTELLIGENCE_METRIC_KEY_PATTERN,
  evaluateMetricPermission,
  isKnownMetricKey,
  type SourceMetricImportPolicyV1,
} from "./metric-keys";
import { INTELLIGENCE_SOURCE_PROFILES } from "./source-governance";

const SALARY_POLICY: SourceMetricImportPolicyV1 = {
  metricKeys: ["salary.month.gross", "salary.month.net"],
};

describe("canonical metric-key vocabulary", () => {
  it("every key is deterministic, pattern-conformant and unique — no wildcard", () => {
    const seen = new Set<string>();
    for (const key of INTELLIGENCE_METRIC_KEYS) {
      expect(key).toMatch(INTELLIGENCE_METRIC_KEY_PATTERN);
      expect(key).not.toContain("*");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
    expect(seen.size).toBeGreaterThan(0);
  });

  it("isKnownMetricKey accepts exactly the vocabulary", () => {
    for (const key of INTELLIGENCE_METRIC_KEYS) {
      expect(isKnownMetricKey(key)).toBe(true);
    }
    for (const bad of ["", "*", "salary", "salary.month", "salary.year.gross", "SALARY.MONTH.GROSS"]) {
      expect(isKnownMetricKey(bad), bad).toBe(false);
    }
  });
});

describe("evaluateMetricPermission — fail-closed permission matrix", () => {
  it("explicitly permitted metric → permitted", () => {
    expect(
      evaluateMetricPermission(SALARY_POLICY, "salary.month.gross"),
    ).toBe("permitted");
  });

  it("known but unpermitted metric → metric_not_permitted", () => {
    expect(
      evaluateMetricPermission(SALARY_POLICY, "demand.role_request_count"),
    ).toBe("metric_not_permitted");
  });

  it("missing policy → import_policy_missing (absence is never permission)", () => {
    expect(evaluateMetricPermission(null, "salary.month.gross")).toBe(
      "import_policy_missing",
    );
    expect(evaluateMetricPermission(undefined, "salary.month.gross")).toBe(
      "import_policy_missing",
    );
  });

  it("empty permission set → import_policy_empty", () => {
    expect(
      evaluateMetricPermission({ metricKeys: [] }, "salary.month.gross"),
    ).toBe("import_policy_empty");
  });

  it("malformed policies reject: non-array, non-string, unknown key, duplicate", () => {
    const malformed: unknown[] = [
      { metricKeys: "salary.month.gross" }, // not an array
      { metricKeys: [42] }, // non-string entry
      { metricKeys: ["salary.year.gross"] }, // unknown to the platform
      { metricKeys: ["salary.month.gross", "salary.month.gross"] }, // dup
      { metricKeys: [" salary.month.gross"] }, // pattern violation
    ];
    for (const policy of malformed) {
      expect(
        evaluateMetricPermission(
          policy as SourceMetricImportPolicyV1,
          "salary.month.gross",
        ),
        JSON.stringify(policy),
      ).toBe("import_policy_malformed");
    }
  });

  it('GUARD: "allow all" is unrepresentable — a wildcard policy is malformed, never permissive', () => {
    for (const wildcard of ["*", "salary.*", "**"]) {
      expect(
        evaluateMetricPermission(
          { metricKeys: [wildcard] } as never,
          "salary.month.gross",
        ),
        wildcard,
      ).toBe("import_policy_malformed");
    }
  });
});

describe("real registry policies stay inside the vocabulary (guard)", () => {
  it("every recorded profile policy is a non-empty subset of the canonical keys", () => {
    for (const profile of INTELLIGENCE_SOURCE_PROFILES) {
      if (profile.importPolicy === null) continue;
      expect(profile.importPolicy.metricKeys.length, profile.key).toBeGreaterThan(0);
      for (const key of profile.importPolicy.metricKeys) {
        expect(isKnownMetricKey(key), `${profile.key}:${key}`).toBe(true);
      }
    }
  });

  it("every EXTERNAL source has NO recorded policy today — owner decision pending", () => {
    for (const profile of INTELLIGENCE_SOURCE_PROFILES) {
      if (profile.sourceKind === "internal_aggregated") continue;
      expect(profile.importPolicy, profile.key).toBeNull();
    }
  });
});
