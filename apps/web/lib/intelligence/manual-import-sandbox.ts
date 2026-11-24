/**
 * MANUAL IMPORT SANDBOX engine (Manual Import Sandbox v1).
 *
 * A completely isolated dry-run: owner-supplied file content goes in, an
 * honest validation/preview report comes out — and NOTHING is persisted,
 * ever. The result type carries `persisted: false` as a LITERAL type, so
 * no code path can even express a persisted sandbox run.
 *
 * The engine reuses the real contracts end to end (same parsers → same
 * validation pipeline → same session/report builders a future importer
 * must use), so what the owner previews is exactly what production would
 * do. Readiness stays fail-closed and is NOT bypassed: rows from a
 * non-active source fail `source_approved` here too; the sandbox merely
 * ALSO reports how many rows would remain valid once the owner activates
 * the source ("validAfterActivation") — a calculation, not an override.
 *
 * Diagnostics are deterministic reason codes only — no stack traces, no
 * internals, no secrets.
 *
 * Pure module: no IO, no Date.now (caller supplies nowMs).
 */
import {
  parseManualImportFile,
  type ManualImportFormat,
  type ManualImportParseResult,
} from "./manual-import-parsers";
import {
  validateObservationCandidate,
  type ObservationValidationFailure,
} from "./observation-validation";
import { computeObservationContentHash } from "./observation-hash";
import { buildImportSession, type ImportSessionV1 } from "./import-session";
import { buildImportReport, type ImportReportV1 } from "./import-report";
import { deriveConfidence, type ConfidenceLevel } from "./confidence";
import { computeFreshness } from "./observation-contract";
import { getSourceProfile } from "./source-governance";

export const SANDBOX_MAX_PREVIEWS = 20;

/** Action-state contract shared by the server action and the client
 *  shell (lives here so the UI component never imports from the admin
 *  route tree). */
export type SandboxActionState =
  | { readonly kind: "idle" }
  | { readonly kind: "refused"; readonly reasonCode: string }
  | { readonly kind: "ran"; readonly run: SandboxRunV1 };

/** Sandbox policy defaults — explicit, documented, overridable per run. */
export const SANDBOX_DEFAULT_COUNTRIES: readonly string[] = ["LT"];
export const SANDBOX_DEFAULT_LANGUAGES: readonly string[] = ["lt"];

/** SLA used for the preview freshness/confidence derivation (mirrors the
 *  curated-benchmark policy default). */
export const SANDBOX_FRESHNESS_SLA_DAYS = 90;

export type SandboxMode = "validate_only" | "preview";

export interface SandboxRunInputV1 {
  readonly fileName: string;
  readonly format: ManualImportFormat;
  readonly content: string;
  readonly mode: SandboxMode;
  readonly nowMs: number;
  readonly allowedCountries?: readonly string[];
  readonly allowedLanguages?: readonly string[];
}

/** Issue tallies for the validation preview (§3). */
export interface SandboxIssueTalliesV1 {
  readonly missingFields: number;
  readonly unsupportedSchema: number;
  readonly unknownCountries: number;
  readonly unknownLanguages: number;
  readonly salaryFormat: number;
  readonly duplicateHashes: number;
  readonly sourceNotActive: number;
  /** Rows whose metric key is unknown to the platform vocabulary. */
  readonly unknownMetrics: number;
  /** Rows whose metric the source's import policy does not permit
   *  (missing / malformed / empty policy included — fail-closed). */
  readonly metricPolicy: number;
  readonly dateIssues: number;
  readonly hashMismatches: number;
}

/** One future observation exactly as it would appear post-validation (§4). */
export interface ObservationPreviewV1 {
  readonly rowNumber: number;
  readonly contentHash: string;
  readonly sourceKey: string | null;
  readonly capturedAtIso: string | null;
  readonly country: string | null;
  readonly language: string | null;
  /** gross / net / unknown for salary metrics; null for other metrics. */
  readonly salaryBasis: "gross" | "net" | "unknown" | null;
  readonly confidence: ConfidenceLevel;
  readonly valid: boolean;
  /** Deterministic `check:reason` codes (§7) — never a stack trace. */
  readonly failureCodes: readonly string[];
  readonly provenanceRef: string;
}

export interface SandboxRunV1 {
  /** LITERAL false — a persisted sandbox run is unrepresentable. */
  readonly persisted: false;
  readonly noticeCode: "intelligence.sandbox.noDataImported";
  readonly fileName: string;
  readonly format: ManualImportFormat;
  readonly mode: SandboxMode;
  readonly parse:
    | { readonly ok: true }
    | {
        readonly ok: false;
        readonly reasonCode: string;
        readonly rowNumber: number | null;
      };
  readonly rowsDetected: number;
  readonly validRows: number;
  readonly invalidRows: number;
  /** Rows whose ONLY blocker is the (correctly) inactive source — how many
   *  rows would validate after the owner activates it. Not an override. */
  readonly validAfterActivation: number;
  readonly tallies: SandboxIssueTalliesV1;
  /** Observation previews (preview mode only; bounded). */
  readonly previews: readonly ObservationPreviewV1[];
  /** The session/report EXACTLY as the run would have produced (§6) —
   *  simulated rollback reference, nothing behind it. */
  readonly sessionPreview: ImportSessionV1 | null;
  readonly reportPreview: ImportReportV1 | null;
}

// ── Row → candidate mapping ──────────────────────────────────────────────────

function asTrimmed(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

function asNumeric(v: unknown): unknown {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : v; // let schema report the bad value
  }
  return v ?? undefined;
}

/** Map one flat file row (snake_case columns, mirroring the gated table)
 *  to an observation candidate. Absent content_hash is computed — exactly
 *  what a real importer would do; a present one is verified, not trusted. */
function rowToCandidate(
  row: Record<string, unknown>,
  rowNumber: number,
  fileName: string,
): { observation: Record<string, unknown>; sourceLanguage: string | null } {
  const geo = {
    country: asTrimmed(row["geo_country"]),
    region: asTrimmed(row["geo_region"]),
    city: asTrimmed(row["geo_city"]),
  };
  const window = {
    start: asTrimmed(row["window_start"]) ?? undefined,
    end: asTrimmed(row["window_end"]) ?? undefined,
  };
  const observation: Record<string, unknown> = {
    subjectKind: asTrimmed(row["subject_kind"]) ?? undefined,
    subjectId: asTrimmed(row["subject_id"]) ?? undefined,
    metricKey: asTrimmed(row["metric_key"]) ?? undefined,
    geo,
    window,
    valueNumeric: asNumeric(row["value_numeric"]),
    unit: asTrimmed(row["unit"]) ?? undefined,
    statMethod: asTrimmed(row["stat_method"]) ?? undefined,
    sourceKind: asTrimmed(row["source_kind"]) ?? undefined,
    sourceKey: asTrimmed(row["source_key"]) ?? undefined,
    sourceUrl: asTrimmed(row["source_url"]),
    derivationIds:
      asTrimmed(row["derivation_ids"])
        ?.split("|")
        .map((s) => s.trim())
        .filter((s) => s !== "") ?? [],
    capturedAt: asTrimmed(row["captured_at"]) ?? undefined,
    validFrom:
      asTrimmed(row["valid_from"]) ?? asTrimmed(row["captured_at"]) ?? undefined,
    validTo: asTrimmed(row["valid_to"]),
    sampleSize:
      row["sample_size"] === null || row["sample_size"] === undefined
        ? null
        : asNumeric(row["sample_size"]),
    confidence: null,
    transformVersion: asTrimmed(row["transform_version"]) ?? "sandbox-v1",
    privacyClass: asTrimmed(row["privacy_class"]) ?? undefined,
    freshnessStatus: asTrimmed(row["freshness_status"]) ?? "unverified",
    provenance: [
      { step: "manual_file", ref: `${fileName}#row-${rowNumber}` },
    ],
    contentHash: asTrimmed(row["content_hash"]) ?? undefined,
  };
  if (observation.contentHash === undefined) {
    observation.contentHash = computeObservationContentHash({
      subjectKind: observation.subjectKind as never,
      subjectId: String(observation.subjectId ?? ""),
      metricKey: String(observation.metricKey ?? ""),
      geo: geo as never,
      window: { start: String(window.start ?? ""), end: String(window.end ?? "") },
      valueNumeric: Number(observation.valueNumeric),
      unit: String(observation.unit ?? ""),
      statMethod: observation.statMethod as never,
      sourceKind: observation.sourceKind as never,
      sourceKey: String(observation.sourceKey ?? ""),
      capturedAt: String(observation.capturedAt ?? ""),
      transformVersion: String(observation.transformVersion),
    });
  }
  return {
    observation,
    sourceLanguage: asTrimmed(row["source_language"])?.toLowerCase() ?? null,
  };
}

// ── Failure classification ───────────────────────────────────────────────────

function tally(failures: readonly ObservationValidationFailure[][]): SandboxIssueTalliesV1 {
  const counts = {
    missingFields: 0,
    unsupportedSchema: 0,
    unknownCountries: 0,
    unknownLanguages: 0,
    salaryFormat: 0,
    duplicateHashes: 0,
    sourceNotActive: 0,
    unknownMetrics: 0,
    metricPolicy: 0,
    dateIssues: 0,
    hashMismatches: 0,
  };
  for (const rowFailures of failures) {
    const checks = new Set(rowFailures.map((f) => f.checkId));
    if (checks.has("required_fields")) counts.missingFields++;
    if (checks.has("schema")) counts.unsupportedSchema++;
    if (checks.has("country")) counts.unknownCountries++;
    if (checks.has("language")) counts.unknownLanguages++;
    if (checks.has("salary_structure")) counts.salaryFormat++;
    if (checks.has("duplicate")) counts.duplicateHashes++;
    if (checks.has("source_approved")) counts.sourceNotActive++;
    if (checks.has("metric_key")) counts.unknownMetrics++;
    if (checks.has("metric_policy")) counts.metricPolicy++;
    if (checks.has("date_validity")) counts.dateIssues++;
    if (checks.has("hash_integrity")) counts.hashMismatches++;
  }
  return counts;
}

function salaryBasisOf(
  metricKey: string | null,
  unit: string | null,
): "gross" | "net" | "unknown" | null {
  if (metricKey === null || !metricKey.startsWith("salary.")) return null;
  if (unit?.endsWith("_gross")) return "gross";
  if (unit?.endsWith("_net")) return "net";
  return "unknown";
}

// ── The dry run ──────────────────────────────────────────────────────────────

export function runManualImportSandbox(
  input: SandboxRunInputV1,
): SandboxRunV1 {
  const allowedCountries = input.allowedCountries ?? SANDBOX_DEFAULT_COUNTRIES;
  const allowedLanguages = input.allowedLanguages ?? SANDBOX_DEFAULT_LANGUAGES;
  const base = {
    persisted: false as const,
    noticeCode: "intelligence.sandbox.noDataImported" as const,
    fileName: input.fileName,
    format: input.format,
    mode: input.mode,
  };

  const parsed: ManualImportParseResult = parseManualImportFile(
    input.content,
    input.format,
  );
  if (!parsed.ok) {
    return {
      ...base,
      parse: {
        ok: false,
        reasonCode: parsed.reasonCode,
        rowNumber: parsed.rowNumber ?? null,
      },
      rowsDetected: 0,
      validRows: 0,
      invalidRows: 0,
      validAfterActivation: 0,
      tallies: tally([]),
      previews: [],
      sessionPreview: null,
      reportPreview: null,
    };
  }

  // Within-file duplicate detection: hashes accumulate as rows validate —
  // the second identical row fails the duplicate check, like a real run.
  const seenHashes = new Set<string>();
  const previews: ObservationPreviewV1[] = [];
  const allFailures: ObservationValidationFailure[][] = [];
  let firstSourceKey: string | null = null;
  let validRows = 0;
  let duplicated = 0;
  let rejectedOther = 0;
  let validAfterActivation = 0;
  const reasonTally = new Map<string, number>();

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const candidate = rowToCandidate(row, rowNumber, input.fileName);
    const result = validateObservationCandidate(candidate, {
      nowMs: input.nowMs,
      knownContentHashes: seenHashes,
      allowedCountries,
      allowedLanguages,
    });
    const failures = result.ok ? [] : [...result.failures];
    allFailures.push(failures);
    const hash = String(candidate.observation.contentHash);
    firstSourceKey ??= asTrimmed(candidate.observation.sourceKey);

    const checkIds = new Set(failures.map((f) => f.checkId));
    if (failures.length === 0) {
      validRows++;
      // Only ACCEPTED rows enter the duplicate set — a real import stores
      // only accepted rows, so a rejected row followed by its corrected
      // twin must not mark the correction as a duplicate.
      seenHashes.add(hash);
    } else if (checkIds.has("duplicate")) {
      duplicated++;
    } else {
      rejectedOther++;
    }
    // Rows blocked ONLY by a registered-but-inactive source: these are the
    // rows activation would let through. unknown_source / kind-mismatch
    // rows can NOT become valid by flipping an existing source on — and
    // neither can rows blocked by the metric import policy (missing /
    // malformed / empty policy, unknown or unpermitted metric): activating
    // a source without a recorded metric policy still imports NOTHING.
    if (
      failures.length > 0 &&
      failures.every(
        (f) =>
          f.checkId === "source_approved" &&
          f.reasonCode === "source_not_active",
      )
    ) {
      validAfterActivation++;
    }
    for (const failure of failures) {
      const code = `${failure.checkId}:${failure.reasonCode}`;
      reasonTally.set(code, (reasonTally.get(code) ?? 0) + 1);
    }

    if (input.mode === "preview" && previews.length < SANDBOX_MAX_PREVIEWS) {
      const observation = candidate.observation;
      const sourceKey = asTrimmed(observation.sourceKey);
      const profile = sourceKey ? getSourceProfile(sourceKey) : null;
      const capturedAtIso = asTrimmed(observation.capturedAt);
      const sampleSize =
        typeof observation.sampleSize === "number"
          ? observation.sampleSize
          : null;
      previews.push({
        rowNumber,
        contentHash: hash,
        sourceKey,
        capturedAtIso,
        country: asTrimmed(
          (observation.geo as Record<string, unknown>).country,
        ),
        language: candidate.sourceLanguage,
        salaryBasis: salaryBasisOf(
          asTrimmed(observation.metricKey),
          asTrimmed(observation.unit),
        ),
        confidence: deriveConfidence({
          sampleSize,
          freshness: capturedAtIso
            ? computeFreshness(capturedAtIso, input.nowMs, SANDBOX_FRESHNESS_SLA_DAYS)
            : null,
          sourceLegalStatus: profile?.legalStatus ?? null,
          provenanceStepCount: 1,
        }),
        valid: failures.length === 0,
        failureCodes: failures.map((f) => `${f.checkId}:${f.reasonCode}`),
        provenanceRef: `${input.fileName}#row-${rowNumber}`,
      });
    }
  });

  // The session/report EXACTLY as this run would have produced them — the
  // same validating builders a real importer must use; the rollback ref is
  // explicitly simulated (nothing exists behind it).
  const nowIso = new Date(input.nowMs).toISOString();
  const sessionResult = buildImportSession({
    sessionId: `sandbox-${input.nowMs}`,
    sourceKey: firstSourceKey ?? "sandbox_unknown_source",
    transformVersion: "sandbox-v1",
    startedAtIso: nowIso,
    finishedAtIso: nowIso,
    itemsScanned: parsed.rows.length,
    itemsAccepted: validRows,
    itemsRejected: rejectedOther,
    itemsDuplicated: duplicated,
    reasonCounts: [...reasonTally.entries()].map(([code, count]) => ({
      code,
      count,
    })),
    errors: [],
    rollbackRef: `sandbox-simulated:${input.fileName}`,
  });
  const sessionPreview = sessionResult.ok ? sessionResult.session : null;
  const reportPreview = sessionPreview
    ? buildImportReport(sessionPreview, {
        warningCodes: ["sandbox_simulated_run"],
      })
    : null;

  return {
    ...base,
    parse: { ok: true },
    rowsDetected: parsed.rows.length,
    validRows,
    invalidRows: rejectedOther + duplicated,
    validAfterActivation,
    tallies: tally(allFailures),
    previews,
    sessionPreview,
    reportPreview,
  };
}
