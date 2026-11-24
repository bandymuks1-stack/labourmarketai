/**
 * pnpm tsx scripts/eurostat-import.ts --emit <path> [--last N]
 *
 * The FIRST bounded Eurostat production import mechanism. It performs the
 * exact canonical pipeline — official bounded fetch → pure JSON-stat parser
 * (eurostat-jsonstat.ts) → canonical validation (validateObservationCandidate)
 * → import boundary (validateExternalImport) → import session/report — and
 * EMITS the accepted, validated observation rows plus the session accounting
 * as JSON. It does NOT write to the database itself: persistence is performed
 * by the operator via the Supabase service-role path (MCP) using the emitted
 * payload with an idempotent `on conflict (content_hash) do nothing` insert.
 * This keeps the single secret (service-role key) out of the script while the
 * validation, bounds and accounting stay in the reviewed code path.
 *
 * Hard bounds (owner): ≤4 datasets, ≤24 periods/series, ≤5000 accepted rows,
 * EU/EFTA geographies only, one session, no scheduler, no backfill. Requires
 * EUROSTAT_SOURCE_ENABLED=on (kill switch operational) and eurostat activated
 * in the code registry (validateExternalImport must allow it).
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  EUROSTAT_DATASETS,
  EUROSTAT_IMPORT_BOUNDS,
  EUROSTAT_SOURCE_KEY,
  EUROSTAT_TRANSFORM_VERSION,
  EUROSTAT_GEO_COUNTRIES,
} from "../lib/intelligence/eurostat-source-v1";
import { parseEurostatJsonStat } from "../lib/intelligence/eurostat-jsonstat";
import {
  validateObservationCandidate,
  type ObservationValidationContextV1,
} from "../lib/intelligence/observation-validation";
import { validateExternalImport } from "../lib/intelligence/import-boundary";
import { buildImportSession } from "../lib/intelligence/import-session";
import { buildImportReport } from "../lib/intelligence/import-report";
import type { IntelligenceObservationV1 } from "../lib/intelligence/observation-contract";

const API_ORIGIN = "https://ec.europa.eu";
const API_BASE = "/eurostat/api/dissemination";

/** Bounded EU/EFTA geo set for the first import — aggregates + a member
 *  sample. All are on the EU/EFTA allowlist (reuse-safe). */
const GEO_SET = [
  "EU27_2020",
  "EA20",
  "LT",
  "LV",
  "EE",
  "PL",
  "DE",
  "NL",
  "FR",
  "ES",
  "IT",
  "SE",
];

function buildUrl(pathTemplate: string, pinned: Record<string, string>, geo: string, lastN: number): string {
  const url = new URL(`${API_BASE}/${pathTemplate}`, API_ORIGIN);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("lang", "EN");
  for (const [dim, code] of Object.entries(pinned)) url.searchParams.set(dim, code);
  url.searchParams.set("geo", geo);
  url.searchParams.set("lastTimePeriod", String(lastN));
  return url.toString();
}

async function boundedFetch(url: string): Promise<
  | { ok: true; body: unknown; sha256: string }
  | { ok: false; errorCode: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EUROSTAT_IMPORT_BOUNDS.requestTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, errorCode: `http_${res.status}` };
    if (!/json/i.test(res.headers.get("content-type") ?? "")) return { ok: false, errorCode: "content_type" };
    const raw = await res.arrayBuffer();
    if (raw.byteLength > EUROSTAT_IMPORT_BOUNDS.maxResponseBytes) return { ok: false, errorCode: "too_large" };
    const text = Buffer.from(raw).toString("utf8");
    return { ok: true, body: JSON.parse(text), sha256: createHash("sha256").update(text).digest("hex") };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && /abort/i.test(err.name + err.message);
    return { ok: false, errorCode: aborted ? "timeout" : "network" };
  }
}

function dbRow(o: IntelligenceObservationV1): Record<string, unknown> {
  return {
    subject_kind: o.subjectKind, subject_id: o.subjectId, metric_key: o.metricKey,
    geo_country: o.geo.country, geo_region: o.geo.region, geo_city: o.geo.city,
    window_start: o.window.start, window_end: o.window.end, value_numeric: o.valueNumeric,
    unit: o.unit, stat_method: o.statMethod, source_kind: o.sourceKind, source_key: o.sourceKey,
    source_url: o.sourceUrl, derivation_ids: o.derivationIds, captured_at: o.capturedAt,
    valid_from: o.validFrom, valid_to: o.validTo, sample_size: o.sampleSize, confidence: o.confidence,
    transform_version: o.transformVersion, privacy_class: o.privacyClass,
    freshness_status: o.freshnessStatus, provenance: o.provenance, content_hash: o.contentHash,
  };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emitIdx = argv.indexOf("--emit");
  const emitPath = emitIdx >= 0 ? argv[emitIdx + 1] : "eurostat-import-accepted.json";
  const lastIdx = argv.indexOf("--last");
  const lastN = Math.min(lastIdx >= 0 ? Math.max(1, Number(argv[lastIdx + 1]) || 4) : 4, EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries);

  // Gate 1: kill switch / enable flag (inline — mirrors eurostat-kill-switch).
  const enabled = ["1", "true", "on"].includes(process.env.EUROSTAT_SOURCE_ENABLED ?? "");
  const killed = ["1", "true", "on"].includes(process.env.EUROSTAT_KILL_SWITCH ?? "");
  if (!enabled || killed) {
    console.error(`eurostat import blocked: enabled=${enabled} killed=${killed}`);
    process.exit(1);
  }
  // Gate 2: import boundary must allow eurostat (code registry active).
  const boundary = validateExternalImport({
    sourceKey: EUROSTAT_SOURCE_KEY, snapshotRef: "first-import", sourceUrl: "eurostat",
    capturedAt: new Date(0).toISOString(), payload: null,
  });
  if (!boundary.ok) {
    console.error(`eurostat import boundary refused: ${boundary.reasonCode}`);
    process.exit(1);
  }

  const nowMs = Date.now();
  const sessionId = `eurostat-first-import-${new Date(nowMs).toISOString()}`;
  const startedAtIso = new Date(nowMs).toISOString();
  const context: ObservationValidationContextV1 = {
    nowMs,
    knownContentHashes: new Set<string>(),
    allowedCountries: [...EUROSTAT_GEO_COUNTRIES],
    allowedLanguages: ["en"],
  };
  const geos = GEO_SET; // all on the EU/EFTA allowlist
  const accepted: IntelligenceObservationV1[] = [];
  const acceptedRows: Record<string, unknown>[] = [];
  const reasonCounts = new Map<string, number>();
  const errors: string[] = [];
  const perDataset: Record<string, { requests: number; scanned: number; accepted: number; rejected: number }> = {};
  let scanned = 0, acc = 0, rejected = 0, duplicated = 0;
  const bump = (c: string) => reasonCounts.set(c, (reasonCounts.get(c) ?? 0) + 1);
  const capRemaining = () => EUROSTAT_IMPORT_BOUNDS.maxAcceptedPerSession - acc;

  for (const dataset of EUROSTAT_DATASETS) {
    perDataset[dataset.code] = { requests: 0, scanned: 0, accepted: 0, rejected: 0 };
    for (const geo of geos) {
      const url = buildUrl(dataset.apiPathTemplate, dataset.pinnedDimensions, geo, lastN);
      const fetched = await boundedFetch(url);
      perDataset[dataset.code].requests += 1;
      await sleep(EUROSTAT_IMPORT_BOUNDS.minRequestSpacingMs);
      if (!fetched.ok) { bump(`fetch_${fetched.errorCode}`); errors.push(`${dataset.code}/${geo}:${fetched.errorCode}`); continue; }
      const parsed = parseEurostatJsonStat({ body: fetched.body, dataset, requestUrl: url, responseSha256: fetched.sha256, nowMs });
      if (!parsed.ok) { bump(`parse_${parsed.reason}`); continue; }
      for (const cell of parsed.cells) {
        scanned += 1; perDataset[dataset.code].scanned += 1;
        if (cell.outcome.kind === "rejected") { rejected += 1; perDataset[dataset.code].rejected += 1; bump(`cell_${cell.outcome.reason}`); continue; }
        const result = validateObservationCandidate({ observation: cell.outcome.observation, sourceLanguage: "en" }, context);
        if (result.ok) {
          if (capRemaining() <= 0) { rejected += 1; perDataset[dataset.code].rejected += 1; bump("session_accept_cap"); continue; }
          acc += 1; perDataset[dataset.code].accepted += 1;
          accepted.push(result.observation);
          acceptedRows.push(dbRow(result.observation));
          // add to known hashes so an intra-run duplicate is caught
          (context.knownContentHashes as Set<string>).add(result.observation.contentHash);
          continue;
        }
        const reasons = result.failures.map((f) => f.reasonCode);
        if (reasons.includes("duplicate")) { duplicated += 1; bump("duplicate"); }
        else { rejected += 1; perDataset[dataset.code].rejected += 1; for (const f of result.failures) bump(`data_${f.reasonCode}`); }
      }
    }
  }

  const finishedAtIso = new Date(Date.now()).toISOString();
  const built = buildImportSession({
    sessionId, sourceKey: EUROSTAT_SOURCE_KEY, transformVersion: EUROSTAT_TRANSFORM_VERSION,
    startedAtIso, finishedAtIso, itemsScanned: scanned, itemsAccepted: acc,
    itemsRejected: rejected, itemsDuplicated: duplicated,
    reasonCounts: Array.from(reasonCounts.entries()).map(([code, count]) => ({ code, count })),
    errors, rollbackRef: `eurostat-import-session:${sessionId}`,
  });
  const report = built.ok ? buildImportReport(built.session, {}) : null;

  const out = {
    generatedAtIso: finishedAtIso, sessionId, rollbackRef: `eurostat-import-session:${sessionId}`,
    bounds: { maxDatasets: 4, maxPeriods: EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries, maxAccepted: EUROSTAT_IMPORT_BOUNDS.maxAcceptedPerSession, lastTimePeriod: lastN },
    datasets: EUROSTAT_DATASETS.map((d) => d.code), geos,
    totals: { scanned, accepted: acc, rejected, duplicated },
    perDataset, reasonCounts: Object.fromEntries(reasonCounts),
    sessionOk: built.ok, sessionReason: built.ok ? null : built.reasonCode,
    finalStatus: report?.finalStatus ?? null,
    acceptedRows, // the exact DB payload for the idempotent service-role insert
  };
  writeFileSync(emitPath, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ sessionId, scanned, accepted: acc, rejected, duplicated, acceptedRows: acceptedRows.length, finalStatus: report?.finalStatus, emit: emitPath }));
}

main().catch((e) => { console.error("eurostat-import failed:", e instanceof Error ? e.message : e); process.exit(1); });
