/**
 * pnpm tsx scripts/eurostat-dry-run.ts [--last N] [--out <path>]
 *
 * LIVE dry-run of the Eurostat source against the official Eurostat
 * dissemination API. Persists NOTHING. It fetches each allowlisted dataset
 * (EU/EA aggregates + a bounded country sample), runs the EXACT pure parser
 * (eurostat-jsonstat.ts) and the EXACT canonical validation pipeline
 * (observation-validation.ts), builds a real import session + report, and
 * writes a JSON evidence file.
 *
 * With eurostat OFF in the code registry (the shipped default), every
 * well-formed candidate is blocked SOLELY by the owner-activation gates
 * (source_not_active + import_policy_missing) — this is the intended
 * fail-closed proof: 0 accepted, N valid-after-activation, 0 genuine data
 * defects. No SUPABASE / service key is used; no write path is touched.
 *
 * This script does its own bounded fetch (the app adapter is server-only and
 * cannot be imported by a tsx script); the fetch mirrors the adapter bounds
 * (timeout, content-type, byte cap, sha256). The adapter's own mechanics are
 * covered separately by vitest.
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  EUROSTAT_DATASETS,
  EUROSTAT_IMPORT_BOUNDS,
  EUROSTAT_SOURCE_KEY,
  EUROSTAT_TRANSFORM_VERSION,
  EUROSTAT_GEO_COUNTRIES,
  type EurostatDatasetV1,
} from "../lib/intelligence/eurostat-source-v1";
import { parseEurostatJsonStat } from "../lib/intelligence/eurostat-jsonstat";
import {
  validateObservationCandidate,
  type ObservationValidationContextV1,
} from "../lib/intelligence/observation-validation";
import { buildImportSession } from "../lib/intelligence/import-session";
import { buildImportReport } from "../lib/intelligence/import-report";

const API_ORIGIN = "https://ec.europa.eu";
const API_BASE = "/eurostat/api/dissemination";

// Bounded geo sample: both supranational aggregates + three EU members.
const GEO_SAMPLE = ["EU27_2020", "EA20", "LT", "DE", "PL"];

const ACTIVATION_GATED = new Set([
  "source_not_active",
  "import_policy_missing",
  "import_policy_empty",
  "metric_not_permitted",
  "country_not_in_import_policy",
  "language_undeclared",
  "language_not_in_import_policy",
]);

function buildUrl(dataset: EurostatDatasetV1, geo: string, lastN: number): string {
  const url = new URL(`${API_BASE}/${dataset.apiPathTemplate}`, API_ORIGIN);
  url.searchParams.set("format", "JSON");
  url.searchParams.set("lang", "EN");
  for (const [dim, code] of Object.entries(dataset.pinnedDimensions)) {
    url.searchParams.set(dim, code);
  }
  url.searchParams.set("geo", geo);
  url.searchParams.set("lastTimePeriod", String(lastN));
  return url.toString();
}

async function boundedFetch(
  url: string,
): Promise<
  | { ok: true; body: unknown; sha256: string; bytes: number }
  | { ok: false; errorCode: string; detail: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    EUROSTAT_IMPORT_BOUNDS.requestTimeoutMs,
  );
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
      redirect: "error",
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, errorCode: "http_error", detail: String(res.status) };
    const ct = res.headers.get("content-type") ?? "";
    if (!/json/i.test(ct)) return { ok: false, errorCode: "content_type_invalid", detail: ct };
    const raw = await res.arrayBuffer();
    if (raw.byteLength > EUROSTAT_IMPORT_BOUNDS.maxResponseBytes) {
      return { ok: false, errorCode: "response_too_large", detail: String(raw.byteLength) };
    }
    const text = Buffer.from(raw).toString("utf8");
    return {
      ok: true,
      body: JSON.parse(text),
      sha256: createHash("sha256").update(text).digest("hex"),
      bytes: raw.byteLength,
    };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && /abort/i.test(err.name + err.message);
    return { ok: false, errorCode: aborted ? "timeout" : "network_error", detail: "" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const lastIdx = argv.indexOf("--last");
  const lastN = Math.min(
    lastIdx >= 0 ? Math.max(1, Number(argv[lastIdx + 1]) || 4) : 4,
    EUROSTAT_IMPORT_BOUNDS.maxPeriodsPerSeries,
  );
  const outIdx = argv.indexOf("--out");
  const outPath =
    outIdx >= 0 ? argv[outIdx + 1] : "eurostat-dry-run-report.json";

  const nowMs = Date.now();
  const context: ObservationValidationContextV1 = {
    nowMs,
    knownContentHashes: new Set<string>(),
    allowedCountries: [...EUROSTAT_GEO_COUNTRIES],
    allowedLanguages: ["en"],
  };

  const startedAtIso = new Date(nowMs).toISOString();
  const outcomes: Record<string, unknown>[] = [];
  const reasonCounts = new Map<string, number>();
  const sampleObservations: unknown[] = [];
  let scanned = 0;
  let accepted = 0;
  let rejected = 0;
  let duplicated = 0;
  let activationGated = 0;
  const errors: string[] = [];

  const bump = (code: string) =>
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);

  for (const dataset of EUROSTAT_DATASETS) {
    for (const geo of GEO_SAMPLE) {
      const url = buildUrl(dataset, geo, lastN);
      const fetched = await boundedFetch(url);
      await sleep(EUROSTAT_IMPORT_BOUNDS.minRequestSpacingMs);
      if (!fetched.ok) {
        bump(`fetch_${fetched.errorCode}`);
        errors.push(`${dataset.code}/${geo}:${fetched.errorCode}`);
        outcomes.push({ dataset: dataset.code, geo, error: fetched.errorCode });
        continue;
      }
      const parsed = parseEurostatJsonStat({
        body: fetched.body,
        dataset,
        requestUrl: url,
        responseSha256: fetched.sha256,
        nowMs,
      });
      if (!parsed.ok) {
        bump(`parse_${parsed.reason}`);
        outcomes.push({ dataset: dataset.code, geo, parseReject: parsed.reason });
        continue;
      }
      let cScan = 0, cAcc = 0, cGated = 0, cRejData = 0, cDup = 0;
      for (const cell of parsed.cells) {
        cScan += 1;
        scanned += 1;
        if (cell.outcome.kind === "rejected") {
          cRejData += 1; rejected += 1; bump(`cell_${cell.outcome.reason}`);
          continue;
        }
        const result = validateObservationCandidate(
          { observation: cell.outcome.observation, sourceLanguage: "en" },
          context,
        );
        if (result.ok) {
          cAcc += 1; accepted += 1;
          continue;
        }
        const reasons = result.failures.map((f) => f.reasonCode);
        if (reasons.includes("duplicate")) {
          cDup += 1; duplicated += 1; bump("duplicate");
        } else if (reasons.length > 0 && reasons.every((r) => ACTIVATION_GATED.has(r))) {
          cGated += 1; activationGated += 1; rejected += 1;
          for (const r of reasons) bump(`gated_${r}`);
          if (sampleObservations.length < 8) {
            sampleObservations.push(cell.outcome.observation);
          }
        } else {
          cRejData += 1; rejected += 1;
          for (const f of result.failures) bump(`data_${f.reasonCode}`);
        }
      }
      outcomes.push({
        dataset: dataset.code, geo, datasetLabel: parsed.datasetLabel,
        updated: parsed.updatedIso, cellsScanned: cScan,
        accepted: cAcc, activationGated: cGated, rejectedData: cRejData, duplicates: cDup,
      });
    }
  }

  const finishedAtIso = new Date(Date.now()).toISOString();
  const built = buildImportSession({
    sessionId: `eurostat-dry-run-${startedAtIso}`,
    sourceKey: EUROSTAT_SOURCE_KEY,
    transformVersion: EUROSTAT_TRANSFORM_VERSION,
    startedAtIso,
    finishedAtIso,
    itemsScanned: scanned,
    itemsAccepted: accepted,
    itemsRejected: rejected,
    itemsDuplicated: duplicated,
    reasonCounts: Array.from(reasonCounts.entries()).map(([code, count]) => ({ code, count })),
    errors,
    rollbackRef: "eurostat-dry-run:no-persist",
  });
  const report = built.ok ? buildImportReport(built.session, { warningCodes: ["dry_run_no_persist"] }) : null;

  const summary = {
    generatedAtIso: finishedAtIso,
    mode: "dry_run",
    persisted: false as const,
    lastTimePeriod: lastN,
    datasets: EUROSTAT_DATASETS.map((d) => d.code),
    geoSample: GEO_SAMPLE,
    totals: { scanned, accepted, rejected, duplicated, validAfterActivation: activationGated },
    sessionOk: built.ok,
    sessionReason: built.ok ? null : built.reasonCode,
    finalStatus: report?.finalStatus ?? null,
    reasonCounts: Object.fromEntries(reasonCounts),
    outcomes,
    sampleObservations,
  };
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    scanned, accepted, validAfterActivation: activationGated, rejected, duplicated,
    finalStatus: report?.finalStatus, out: outPath,
  }));
}

main().catch((e) => {
  console.error("eurostat-dry-run failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
