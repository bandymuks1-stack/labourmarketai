import "server-only";

/**
 * EUROSTAT IMPORTER — the server-only orchestrator: adapter → parser →
 * canonical validation → import session/report. It performs one bounded
 * import run over the allowlisted datasets and geographies, and NEVER
 * bypasses a gate:
 *
 *   - the kill switch is asserted before any request (adapter) and before
 *     any persist;
 *   - every candidate passes the SAME canonical pipeline as the sandbox
 *     (validateObservationCandidate) — no parallel validator;
 *   - persistence is gated behind the external-import boundary
 *     (validateExternalImport) AND the code-registry active check, and uses
 *     the service-role writer only for accepted rows;
 *   - exact-sum accounting via buildImportSession; a report via
 *     buildImportReport; a mandatory rollback reference (the session id).
 *
 * Two run modes:
 *   - "dry_run": fetch + parse + validate + classify, persist NOTHING;
 *   - "persist": additionally write accepted observations (only possible
 *     when the owner has activated eurostat in code + DB).
 */
import {
  EUROSTAT_DATASETS,
  EUROSTAT_GEO_ALLOWLIST,
  EUROSTAT_GEO_COUNTRIES,
  EUROSTAT_IMPORT_BOUNDS,
  EUROSTAT_SOURCE_KEY,
  EUROSTAT_TRANSFORM_VERSION,
  type EurostatDatasetV1,
} from "@/lib/intelligence/eurostat-source-v1";
import { parseEurostatJsonStat } from "@/lib/intelligence/eurostat-jsonstat";
import {
  validateObservationCandidate,
  type ObservationValidationContextV1,
} from "@/lib/intelligence/observation-validation";
import {
  buildImportSession,
  type ImportSessionReasonCountV1,
  type ImportSessionV1,
} from "@/lib/intelligence/import-session";
import {
  buildImportReport,
  type ImportReportV1,
} from "@/lib/intelligence/import-report";
import type { IntelligenceObservationV1 } from "@/lib/intelligence/observation-contract";
import { fetchEurostatDataset } from "./eurostat-adapter";
import { eurostatSwitchState } from "./eurostat-kill-switch";

/** The activation-gated validation reason codes — a candidate blocked ONLY
 *  by these is a well-formed observation waiting for owner activation, not a
 *  data defect. Mirrors the sandbox's validAfterActivation semantics. */
const ACTIVATION_GATED_REASONS: ReadonlySet<string> = new Set([
  "source_not_active",
  "import_policy_missing",
  "import_policy_empty",
  "metric_not_permitted",
  "country_not_in_import_policy",
  "language_undeclared",
  "language_not_in_import_policy",
]);

export type EurostatImportMode = "dry_run" | "persist";

export interface EurostatImportRequestV1 {
  readonly mode: EurostatImportMode;
  /** Datasets to import — subset of EUROSTAT_DATASETS.code (max 4). */
  readonly datasetCodes: readonly string[];
  /** Geographies to import — subset of EUROSTAT_GEO_ALLOWLIST. */
  readonly geos: readonly string[];
  /** Latest N periods per series — clamped to the import bounds. */
  readonly lastTimePeriod: number;
  /** Validation clock (ms). Deterministic — never Date.now in the module. */
  readonly nowMs: number;
  /** Import session id (caller-supplied, unique per run). */
  readonly sessionId: string;
  readonly startedAtIso: string;
  readonly finishedAtIso: string;
  /** Content hashes already stored — duplicate detection input. */
  readonly knownContentHashes?: ReadonlySet<string>;
  /** REQUIRED for mode "persist": the service-role writer. Given the exact
   *  accepted observations, it inserts them idempotently and returns how
   *  many rows were newly written. Absent in dry-run. */
  readonly persist?: (
    rows: readonly IntelligenceObservationV1[],
  ) => Promise<{ inserted: number; duplicates: number }>;
}

export interface EurostatDatasetOutcomeV1 {
  readonly datasetCode: string;
  readonly geo: string;
  readonly requestUrl: string;
  readonly ok: boolean;
  readonly errorCode: string | null;
  readonly cellsScanned: number;
  readonly candidates: number;
  readonly accepted: number;
  readonly rejectedData: number;
  readonly activationGated: number;
  readonly duplicates: number;
}

export interface EurostatImportResultV1 {
  readonly mode: EurostatImportMode;
  readonly sourceKey: string;
  readonly operational: boolean;
  readonly blockedReason: string | null;
  readonly outcomes: readonly EurostatDatasetOutcomeV1[];
  readonly acceptedObservations: readonly IntelligenceObservationV1[];
  readonly session: ImportSessionV1 | null;
  readonly report: ImportReportV1 | null;
  /** How many well-formed candidates are blocked SOLELY by owner activation
   *  gates (would be accepted once eurostat is activated). */
  readonly validAfterActivation: number;
  /** Rows actually written (persist mode only). */
  readonly persistedInserted: number;
  readonly persistedDuplicates: number;
}

function tallyReason(
  counts: Map<string, number>,
  code: string,
): void {
  counts.set(code, (counts.get(code) ?? 0) + 1);
}

export async function runEurostatImport(
  req: EurostatImportRequestV1,
): Promise<EurostatImportResultV1> {
  const switchState = eurostatSwitchState();

  const datasets = EUROSTAT_DATASETS.filter((d) =>
    req.datasetCodes.includes(d.code),
  ).slice(0, EUROSTAT_DATASETS.length);
  // Dedupe geos — a duplicated geo would fetch and accept the same cells
  // twice (the second pass would dedupe by hash, but the request is wasted
  // and the accept cap must count real distinct work).
  const geos = [...new Set(req.geos)].filter((g) =>
    EUROSTAT_GEO_ALLOWLIST.includes(g),
  );
  const lastN = Math.min(
    Math.max(1, Math.floor(req.lastTimePeriod)),
    EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries,
  );

  const context: ObservationValidationContextV1 = {
    nowMs: req.nowMs,
    knownContentHashes: req.knownContentHashes ?? new Set<string>(),
    allowedCountries: [...EUROSTAT_GEO_COUNTRIES],
    allowedLanguages: ["en"],
  };

  const outcomes: EurostatDatasetOutcomeV1[] = [];
  const acceptedObservations: IntelligenceObservationV1[] = [];
  const reasonCounts = new Map<string, number>();
  const errors: string[] = [];
  let scanned = 0;
  let accepted = 0;
  let rejected = 0;
  let duplicated = 0;
  let validAfterActivation = 0;

  // If not operational (kill switch / disabled), do NOT contact the network
  // at all — report the block honestly and stop. Still emit a zero session.
  const runOverNetwork = switchState.operational;

  // Hard session accept cap (owner bound) — a shared budget across all
  // dataset/geo passes. Once exhausted, further candidates are rejected with
  // a stable reason rather than persisted, so the invariant holds even if a
  // caller passes an unexpectedly large geo list.
  const capBudget = { remaining: EUROSTAT_IMPORT_BOUNDS.maxAcceptedPerSession };

  for (const dataset of datasets) {
    for (const geo of geos) {
      const outcome = await importOneDatasetGeo({
        dataset,
        geo,
        lastN,
        context,
        runOverNetwork,
        seenHashes: context.knownContentHashes,
        capBudget,
        onReason: (code) => tallyReason(reasonCounts, code),
      });
      outcomes.push(outcome.summary);
      scanned += outcome.summary.cellsScanned;
      accepted += outcome.summary.accepted;
      rejected += outcome.summary.rejectedData;
      duplicated += outcome.summary.duplicates;
      validAfterActivation += outcome.summary.activationGated;
      // Activation-gated candidates count as "rejected" in the session
      // accounting (they were not accepted) but are tracked separately.
      rejected += outcome.summary.activationGated;
      acceptedObservations.push(...outcome.accepted);
      if (outcome.summary.errorCode) {
        errors.push(`${dataset.code}/${geo}:${outcome.summary.errorCode}`);
      }
    }
  }

  const reasonCountsArr: ImportSessionReasonCountV1[] = Array.from(
    reasonCounts.entries(),
  ).map(([code, count]) => ({ code, count }));

  const built = buildImportSession({
    sessionId: req.sessionId,
    sourceKey: EUROSTAT_SOURCE_KEY,
    transformVersion: EUROSTAT_TRANSFORM_VERSION,
    startedAtIso: req.startedAtIso,
    finishedAtIso: req.finishedAtIso,
    itemsScanned: scanned,
    itemsAccepted: accepted,
    itemsRejected: rejected,
    itemsDuplicated: duplicated,
    reasonCounts: reasonCountsArr,
    errors,
    rollbackRef: `eurostat-import-session:${req.sessionId}`,
  });

  const session = built.ok ? built.session : null;
  const report = session
    ? buildImportReport(session, {
        warningCodes: runOverNetwork
          ? []
          : [`eurostat_${switchState.blockedReason ?? "not_operational"}`],
      })
    : null;

  // Persist only in persist mode, only when operational, and only accepted
  // rows — routed through the caller's service-role writer.
  let persistedInserted = 0;
  let persistedDuplicates = 0;
  if (
    req.mode === "persist" &&
    runOverNetwork &&
    acceptedObservations.length > 0 &&
    typeof req.persist === "function"
  ) {
    const res = await req.persist(acceptedObservations);
    persistedInserted = res.inserted;
    persistedDuplicates = res.duplicates;
  }

  return {
    mode: req.mode,
    sourceKey: EUROSTAT_SOURCE_KEY,
    operational: switchState.operational,
    blockedReason: switchState.blockedReason,
    outcomes,
    acceptedObservations,
    session,
    report,
    validAfterActivation,
    persistedInserted,
    persistedDuplicates,
  };
}

async function importOneDatasetGeo(args: {
  dataset: EurostatDatasetV1;
  geo: string;
  lastN: number;
  context: ObservationValidationContextV1;
  runOverNetwork: boolean;
  seenHashes: ReadonlySet<string>;
  /** Shared, mutable session accept budget (owner cap). */
  capBudget: { remaining: number };
  onReason: (code: string) => void;
}): Promise<{
  summary: EurostatDatasetOutcomeV1;
  accepted: IntelligenceObservationV1[];
}> {
  const { dataset, geo, lastN, context, runOverNetwork, capBudget } = args;
  const base: EurostatDatasetOutcomeV1 = {
    datasetCode: dataset.code,
    geo,
    requestUrl: "",
    ok: false,
    errorCode: null,
    cellsScanned: 0,
    candidates: 0,
    accepted: 0,
    rejectedData: 0,
    activationGated: 0,
    duplicates: 0,
  };

  if (!runOverNetwork) {
    return { summary: { ...base, errorCode: "not_operational" }, accepted: [] };
  }

  const fetched = await fetchEurostatDataset({
    datasetCode: dataset.code,
    geo,
    lastTimePeriod: lastN,
  });
  if (!fetched.ok) {
    args.onReason(`fetch_${fetched.errorCode}`);
    return {
      summary: {
        ...base,
        requestUrl: fetched.requestUrl,
        errorCode: fetched.errorCode,
      },
      accepted: [],
    };
  }

  const parsed = parseEurostatJsonStat({
    body: fetched.body,
    dataset,
    requestUrl: fetched.requestUrl,
    responseSha256: fetched.responseSha256,
    nowMs: context.nowMs,
  });
  if (!parsed.ok) {
    args.onReason(`parse_${parsed.reason}`);
    return {
      summary: {
        ...base,
        requestUrl: fetched.requestUrl,
        ok: true,
        errorCode: parsed.reason,
      },
      accepted: [],
    };
  }

  const accepted: IntelligenceObservationV1[] = [];
  let cellsScanned = 0;
  let candidates = 0;
  let acceptedCount = 0;
  let rejectedData = 0;
  let activationGated = 0;
  let duplicates = 0;

  for (const cell of parsed.cells) {
    cellsScanned += 1;
    if (cell.outcome.kind === "rejected") {
      rejectedData += 1;
      args.onReason(`cell_${cell.outcome.reason}`);
      continue;
    }
    candidates += 1;
    const result = validateObservationCandidate(
      { observation: cell.outcome.observation, sourceLanguage: "en" },
      context,
    );
    if (result.ok) {
      // Enforce the shared session accept cap — once exhausted, a
      // structurally-valid candidate is rejected (never persisted) so the
      // ≤maxAcceptedPerSession invariant always holds.
      if (capBudget.remaining <= 0) {
        rejectedData += 1;
        args.onReason("session_accept_cap");
        continue;
      }
      capBudget.remaining -= 1;
      acceptedCount += 1;
      accepted.push(result.observation);
      continue;
    }
    const reasons = result.failures.map((f) => f.reasonCode);
    const onlyActivationGated =
      reasons.length > 0 &&
      reasons.every((r) => ACTIVATION_GATED_REASONS.has(r));
    const isDuplicate = reasons.includes("duplicate");
    if (isDuplicate) {
      duplicates += 1;
      args.onReason("duplicate");
    } else if (onlyActivationGated) {
      activationGated += 1;
      for (const r of reasons) args.onReason(`gated_${r}`);
    } else {
      rejectedData += 1;
      for (const f of result.failures) args.onReason(`data_${f.reasonCode}`);
    }
  }

  return {
    summary: {
      datasetCode: dataset.code,
      geo,
      requestUrl: fetched.requestUrl,
      ok: true,
      errorCode: null,
      cellsScanned,
      candidates,
      accepted: acceptedCount,
      rejectedData,
      activationGated,
      duplicates,
    },
    accepted,
  };
}
