/**
 * OBSERVATION VALIDATION pipeline (Source Readiness v1).
 *
 * The deterministic gate every candidate observation must pass BEFORE it
 * could ever be written to the (still gated, unapplied) observations
 * store. No import runtime exists yet — this module validates candidates
 * handed to it and never reads or writes anything itself.
 *
 * Checks (ALL run — a rejection report lists every failure, not just the
 * first): schema · required fields · source approval · metric key
 * (canonical vocabulary) · metric import policy (source must explicitly
 * permit the metric) · date validity · country allowlist · language
 * allowlist · salary structure · content-hash integrity · duplicate
 * detection.
 *
 * Fail-closed by construction: with today's registry every external
 * source fails "source_approved", so NO external observation can validate
 * until the owner completes the activation checklist — pinned by tests.
 *
 * Pure logic (node:crypto via observation-hash for hash recomputation —
 * server/test side only, like observation-hash itself). No IO, no
 * Date.now (caller supplies nowMs).
 */
import {
  intelligenceObservationSchema,
  type IntelligenceObservationV1,
} from "./observation-contract";
import { computeObservationContentHash } from "./observation-hash";
import {
  evaluateMetricPermission,
  isKnownMetricKey,
  SALARY_METRIC_EXPECTED_UNIT,
} from "./metric-keys";
import { getSourceProfile, isExternalSourceActive } from "./source-governance";

export const OBSERVATION_VALIDATION_CHECKS = [
  "schema",
  "required_fields",
  "source_approved",
  "metric_key",
  "metric_policy",
  "date_validity",
  "country",
  "language",
  "salary_structure",
  "hash_integrity",
  "duplicate",
] as const;
export type ObservationValidationCheckId =
  (typeof OBSERVATION_VALIDATION_CHECKS)[number];

export interface ObservationValidationFailure {
  readonly checkId: ObservationValidationCheckId;
  /** Stable machine reason code (feeds import-report reason tallies). */
  readonly reasonCode: string;
}

export type ObservationValidationResult =
  | { readonly ok: true; readonly observation: IntelligenceObservationV1 }
  | { readonly ok: false; readonly failures: readonly ObservationValidationFailure[] };

export interface ObservationValidationContextV1 {
  /** Validation clock — supplied by the caller, never Date.now here. */
  readonly nowMs: number;
  /** Content hashes already stored — duplicate detection input. */
  readonly knownContentHashes: ReadonlySet<string>;
  /** Countries the source's import policy allows (empty = policy missing
   *  → every geo-tagged candidate fails the country check: fail-closed). */
  readonly allowedCountries: readonly string[];
  /** Languages the import policy allows (lowercase ISO-639-1). */
  readonly allowedLanguages: readonly string[];
}

/** A candidate as a future importer would hand it over: the raw mapped
 *  observation plus the source-text language it was derived from. */
export interface ObservationCandidateV1 {
  readonly observation: unknown;
  /** Language of the source material, or null when the source did not
   *  declare one — with a language allowlist in force, null FAILS. */
  readonly sourceLanguage: string | null;
}

/** Salary metrics must use one of these units — nothing else. */
export const SALARY_METRIC_UNITS: ReadonlySet<string> = new Set([
  "eur_month_gross",
  "eur_month_net",
  "eur_hour_gross",
  "eur_hour_net",
]);

const SALARY_METRIC_PREFIX = "salary.";

function valueAtPath(root: unknown, path: readonly PropertyKey[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<PropertyKey, unknown>)[key];
  }
  return node;
}

/**
 * Run the full pipeline over one candidate. Deterministic: same candidate
 * + same context → same result. Schema failure stops the remaining checks
 * (they need a typed observation) but is itself reported per-field-class.
 */
export function validateObservationCandidate(
  candidate: ObservationCandidateV1,
  context: ObservationValidationContextV1,
): ObservationValidationResult {
  const failures: ObservationValidationFailure[] = [];

  // ── schema + required fields ──────────────────────────────────────────
  const parsed = intelligenceObservationSchema.safeParse(candidate.observation);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // A field is MISSING (required_fields) when the raw candidate holds
      // undefined at the issue path; any other structural problem is a
      // schema failure. (Robust across zod issue formats.)
      const missing =
        issue.code === "invalid_type" &&
        valueAtPath(candidate.observation, issue.path) === undefined;
      failures.push({
        checkId: missing ? "required_fields" : "schema",
        reasonCode: `${issue.path.join(".") || "root"}:${issue.code}`,
      });
    }
    return { ok: false, failures };
  }
  const observation = parsed.data;

  // ── source approval (fail-closed: proposed sources NEVER pass) ────────
  const profile = getSourceProfile(observation.sourceKey);
  if (profile === null) {
    failures.push({
      checkId: "source_approved",
      reasonCode: "unknown_source",
    });
  } else if (observation.sourceKind !== profile.sourceKind) {
    // The candidate's claimed kind must MATCH the registry — otherwise a
    // mislabelled row (e.g. an external kind riding on an internal key)
    // would be judged by the wrong branch. Mismatch is a hard failure.
    failures.push({
      checkId: "source_approved",
      reasonCode: "source_kind_mismatch",
    });
  } else if (
    profile.sourceKind !== "internal_aggregated" &&
    !isExternalSourceActive(observation.sourceKey)
  ) {
    failures.push({
      checkId: "source_approved",
      reasonCode: "source_not_active",
    });
  }

  // ── metric key + metric import policy (independent, fail-closed) ──────
  // Two SEPARATE gates, both required, neither suppressing the other or
  // the source checks above:
  //   metric_key    — the candidate metric must exist in the canonical
  //                   platform vocabulary (metric-keys.ts);
  //   metric_policy — the source's RECORDED import policy must explicitly
  //                   permit that metric. Missing / malformed / empty
  //                   policy rejects — an approved or active source never
  //                   authorizes every possible metric, and absence is
  //                   never permission.
  if (!isKnownMetricKey(observation.metricKey)) {
    failures.push({ checkId: "metric_key", reasonCode: "metric_key_unknown" });
  }
  const metricPermission = evaluateMetricPermission(
    profile?.importPolicy ?? null,
    observation.metricKey,
  );
  if (metricPermission !== "permitted") {
    failures.push({ checkId: "metric_policy", reasonCode: metricPermission });
  }

  // ── date validity ─────────────────────────────────────────────────────
  const capturedMs = Date.parse(observation.capturedAt);
  if (capturedMs > context.nowMs) {
    failures.push({
      checkId: "date_validity",
      reasonCode: "captured_in_future",
    });
  }
  if (Date.parse(observation.window.end) > capturedMs) {
    failures.push({
      checkId: "date_validity",
      reasonCode: "window_ends_after_capture",
    });
  }
  if (
    observation.validTo !== null &&
    Date.parse(observation.validTo) <= Date.parse(observation.validFrom)
  ) {
    failures.push({
      checkId: "date_validity",
      reasonCode: "valid_to_not_after_valid_from",
    });
  }

  // ── country allowlist (fail-closed when the policy list is empty) ─────
  if (observation.geo.country !== null) {
    if (!context.allowedCountries.includes(observation.geo.country)) {
      failures.push({
        checkId: "country",
        reasonCode: "country_not_in_import_policy",
      });
    }
  }

  // ── language allowlist (unknown language never assumed acceptable) ────
  if (context.allowedLanguages.length > 0) {
    if (
      candidate.sourceLanguage === null ||
      !context.allowedLanguages.includes(candidate.sourceLanguage)
    ) {
      failures.push({
        checkId: "language",
        reasonCode:
          candidate.sourceLanguage === null
            ? "language_undeclared"
            : "language_not_in_import_policy",
      });
    }
  }

  // ── salary structure ──────────────────────────────────────────────────
  if (observation.metricKey.startsWith(SALARY_METRIC_PREFIX)) {
    if (!SALARY_METRIC_UNITS.has(observation.unit)) {
      failures.push({
        checkId: "salary_structure",
        reasonCode: "salary_unit_unknown",
      });
    }
    // A KNOWN salary metric must carry its exact 1:1 unit — a monthly-gross
    // key on an hourly-net number is a contradictory row, never accepted.
    // (Unknown salary keys already fail metric_key; no expectation exists.)
    const expectedUnit = isKnownMetricKey(observation.metricKey)
      ? SALARY_METRIC_EXPECTED_UNIT[observation.metricKey]
      : undefined;
    if (expectedUnit !== undefined && observation.unit !== expectedUnit) {
      failures.push({
        checkId: "salary_structure",
        reasonCode: "salary_unit_mismatch",
      });
    }
    if (!(observation.valueNumeric > 0)) {
      failures.push({
        checkId: "salary_structure",
        reasonCode: "salary_value_not_positive",
      });
    }
  }

  // ── content-hash integrity (recomputed, never trusted) ────────────────
  const recomputed = computeObservationContentHash({
    subjectKind: observation.subjectKind,
    subjectId: observation.subjectId,
    metricKey: observation.metricKey,
    geo: observation.geo,
    window: observation.window,
    valueNumeric: observation.valueNumeric,
    unit: observation.unit,
    statMethod: observation.statMethod,
    sourceKind: observation.sourceKind,
    sourceKey: observation.sourceKey,
    capturedAt: observation.capturedAt,
    transformVersion: observation.transformVersion,
  });
  if (recomputed !== observation.contentHash) {
    failures.push({
      checkId: "hash_integrity",
      reasonCode: "content_hash_mismatch",
    });
  }

  // ── duplicate detection (against the recomputed truth, not the claim) ─
  if (context.knownContentHashes.has(recomputed)) {
    failures.push({ checkId: "duplicate", reasonCode: "duplicate" });
  }

  return failures.length === 0
    ? { ok: true, observation }
    : { ok: false, failures };
}
