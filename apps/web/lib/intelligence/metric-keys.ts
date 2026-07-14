/**
 * Canonical intelligence METRIC-KEY vocabulary + per-source metric
 * import-policy evaluation (Metric Import-Policy Enforcement v1).
 *
 * ONE machine-readable list of every observation metric the platform
 * actually represents today. A metric key outside this list is UNKNOWN to
 * the platform and can never validate — deterministic identifiers only,
 * no free-text matching, no wildcards.
 *
 * Grounding (each key traces to an existing implementation, none is
 * speculative):
 *   - salary.month.gross / salary.month.net / salary.hour.gross /
 *     salary.hour.net — the four benchmark shapes the salary-structure
 *     check already accepts (SALARY_METRIC_UNITS in
 *     observation-validation.ts: eur_month_gross … eur_hour_net);
 *     admin-curated market rates are the internal source of these.
 *   - demand.role_request_count / demand.skill_request_count — the two
 *     demand aggregates the platform actually derives
 *     (skills-demand-model.ts).
 * Supply / skill-gap / trend metrics have NO derivation yet, so they are
 * deliberately absent — the vocabulary grows only when a derivation
 * becomes real.
 *
 * Fail-closed doctrine: source approval and metric approval are SEPARATE
 * gates. An active source with no recorded metric policy imports nothing;
 * a recorded policy permits exactly the keys it lists. Absence is never
 * permission. Pure module: no IO, no Date.now.
 */

export const INTELLIGENCE_METRIC_KEYS = [
  "salary.month.gross",
  "salary.month.net",
  "salary.hour.gross",
  "salary.hour.net",
  "demand.role_request_count",
  "demand.skill_request_count",
] as const;

export type IntelligenceMetricKey = (typeof INTELLIGENCE_METRIC_KEYS)[number];

/** Mirror of the gated migration's CHECK on metric_key (`^[a-z0-9_.]+$`). */
export const INTELLIGENCE_METRIC_KEY_PATTERN = /^[a-z0-9_.]+$/;

const KNOWN = new Set<string>(INTELLIGENCE_METRIC_KEYS);

export function isKnownMetricKey(v: string): v is IntelligenceMetricKey {
  return KNOWN.has(v);
}

/**
 * The 1:1 unit each salary metric key MUST carry — a metric key and a unit
 * that contradict each other (e.g. a monthly-gross key on an hourly-net
 * number) can never validate as one accepted row. Non-salary metrics have
 * no entry (their units are not unit-vocabulary-bound today).
 */
export const SALARY_METRIC_EXPECTED_UNIT: Readonly<
  Partial<Record<IntelligenceMetricKey, string>>
> = {
  "salary.month.gross": "eur_month_gross",
  "salary.month.net": "eur_month_net",
  "salary.hour.gross": "eur_hour_gross",
  "salary.hour.net": "eur_hour_net",
};

/**
 * The RECORDED metric half of a source's import policy: the closed set of
 * metric keys this source may ever produce. Reused by the source registry
 * (source-governance.ts), the activation facts contract
 * (source-activation.ts), validation, reports and sandbox diagnostics.
 */
export interface SourceMetricImportPolicyV1 {
  readonly metricKeys: readonly IntelligenceMetricKey[];
}

/**
 * Deterministic reason codes for the metric-permission decision. Every
 * non-"permitted" state is a validation failure — fail-closed on missing,
 * malformed and empty policies alike.
 */
export type MetricPermissionResult =
  | "permitted"
  | "import_policy_missing"
  | "import_policy_malformed"
  | "import_policy_empty"
  | "metric_not_permitted";

/**
 * Evaluate whether a source's recorded import policy permits a candidate
 * metric key. Deliberately defensive at runtime (not just type-level):
 * a policy read from storage later must pass the same shape rules.
 *
 *  - no policy recorded            → import_policy_missing
 *  - non-array / non-string entry /
 *    wildcard / unknown listed key /
 *    duplicate listed key          → import_policy_malformed
 *  - empty permission set          → import_policy_empty
 *  - key absent from the set       → metric_not_permitted
 *  - key explicitly listed         → permitted
 *
 * There is NO wildcard and NO fallback: "allow all" is unrepresentable —
 * a policy listing "*" (or anything outside the canonical vocabulary) is
 * malformed, not permissive. Pinned by guards.
 */
export function evaluateMetricPermission(
  policy: SourceMetricImportPolicyV1 | null | undefined,
  metricKey: string,
): MetricPermissionResult {
  if (policy === null || policy === undefined) return "import_policy_missing";
  const keys: unknown = policy.metricKeys;
  if (!Array.isArray(keys)) return "import_policy_malformed";
  const seen = new Set<string>();
  for (const entry of keys) {
    if (
      typeof entry !== "string" ||
      !INTELLIGENCE_METRIC_KEY_PATTERN.test(entry) ||
      !isKnownMetricKey(entry) ||
      seen.has(entry)
    ) {
      return "import_policy_malformed";
    }
    seen.add(entry);
  }
  if (seen.size === 0) return "import_policy_empty";
  return seen.has(metricKey) ? "permitted" : "metric_not_permitted";
}
