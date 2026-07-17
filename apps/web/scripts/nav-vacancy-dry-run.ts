/**
 * pnpm tsx scripts/nav-vacancy-dry-run.ts [--live] [--max-entries N] [--out <path>]
 *
 * DRY-RUN of the NAV (arbeidsplassen.no) official vacancy feed pipeline.
 * Persists NOTHING, ever. Two modes:
 *
 *   default (fixtures): runs the EXACT pure pipeline — contract parse
 *   (nav-feed-contract.ts) → normalize (normalize.ts) → idempotent upsert
 *   plan → import-session accounting — over the pinned real-shaped fixtures
 *   (lib/vacancy-sources/nav-fixtures.ts). Zero network, zero tokens.
 *
 *   --live: additionally fetches the real feed with the operator's token
 *   (NAV_FEED_TOKEN env — public rotating experiment token or, later, the
 *   registered private token; never committed, never printed). Bounded and
 *   polite: host-pinned to pam-stilling-feed.nav.no, page/entry caps
 *   (NAV_IMPORT_BOUNDS), request spacing, timeout, byte cap, GET only,
 *   redirects refused. Still persists NOTHING — the evidence JSON records
 *   what WOULD be imported after owner activation.
 *
 * The eurostat-dry-run.ts precedent: same shape, same honesty rules. With
 * nav_arbeidsplassen OFF in the code registry (the shipped default), the
 * import boundary refuses persistence anyway — this script is the safe way
 * to look.
 */
import { writeFileSync } from "node:fs";
import {
  NAV_FEED_ORIGIN,
  NAV_IMPORT_BOUNDS,
  NAV_SOURCE_KEY,
  NAV_TRANSFORM_VERSION,
  parseNavFeedEntryDetail,
  parseNavFeedPage,
  shouldContinuePaging,
  type NavFeedEntryDetail,
} from "../lib/vacancy-sources/nav-feed-contract";
import {
  normalizeNavEntry,
  planVacancyUpsert,
  type ExternalVacancyDeactivationV1,
  type ExternalVacancyV1,
} from "../lib/vacancy-sources/normalize";
import {
  NAV_FIXTURE_DETAILS,
  NAV_FIXTURE_FEED_PAGE,
} from "../lib/vacancy-sources/nav-fixtures";
import { buildImportSession } from "../lib/intelligence/import-session";
import { buildImportReport } from "../lib/intelligence/import-report";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Bounded, host-pinned GET (mirrors the eurostat script bounds). */
async function boundedFetch(
  url: string,
  token: string,
): Promise<
  | { ok: true; body: unknown }
  | { ok: false; errorCode: string; detail: string }
> {
  if (!url.startsWith(`${NAV_FEED_ORIGIN}/`)) {
    return { ok: false, errorCode: "host_not_pinned", detail: new URL(url).host };
  }
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    NAV_IMPORT_BOUNDS.requestTimeoutMs,
  );
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      signal: controller.signal,
      redirect: "error",
    });
    clearTimeout(timer);
    if (!res.ok) return { ok: false, errorCode: "http_error", detail: String(res.status) };
    const ct = res.headers.get("content-type") ?? "";
    if (!/json/i.test(ct)) return { ok: false, errorCode: "content_type_invalid", detail: ct };
    const raw = await res.arrayBuffer();
    if (raw.byteLength > NAV_IMPORT_BOUNDS.maxResponseBytes) {
      return { ok: false, errorCode: "response_too_large", detail: String(raw.byteLength) };
    }
    return { ok: true, body: JSON.parse(Buffer.from(raw).toString("utf8")) };
  } catch (err) {
    clearTimeout(timer);
    const aborted = err instanceof Error && /abort/i.test(err.name + err.message);
    return { ok: false, errorCode: aborted ? "timeout" : "network_error", detail: "" };
  }
}

/** Collect entry details — fixture mode is pure; live mode is bounded. */
async function collectDetails(opts: {
  live: boolean;
  maxEntries: number;
  errors: string[];
  bump: (code: string) => void;
}): Promise<{ details: NavFeedEntryDetail[]; pagesFetched: number }> {
  if (!opts.live) {
    // Fixture mode: prove the page contract parses, then use the pinned
    // details (already typed — re-parse anyway so the contract is exercised).
    const page = parseNavFeedPage(NAV_FIXTURE_FEED_PAGE);
    if (!page.ok) {
      opts.errors.push(`fixture_page:${page.detail}`);
      return { details: [], pagesFetched: 0 };
    }
    const details: NavFeedEntryDetail[] = [];
    for (const d of NAV_FIXTURE_DETAILS.slice(0, opts.maxEntries)) {
      const parsed = parseNavFeedEntryDetail(d);
      if (parsed.ok) details.push(parsed.value);
      else opts.bump("fixture_detail_schema_invalid");
    }
    return { details, pagesFetched: 1 };
  }

  const token = process.env.NAV_FEED_TOKEN ?? "";
  if (token.trim().length === 0) {
    console.error(
      "nav-vacancy-dry-run --live requires NAV_FEED_TOKEN (never committed; " +
        "public experiment token: pam-stilling-feed.nav.no/api/publicToken).",
    );
    process.exit(1);
  }
  const details: NavFeedEntryDetail[] = [];
  let pagesFetched = 0;
  let entriesSeen = 0;
  let nextUrl: string | null = `${NAV_FEED_ORIGIN}/api/v1/feed`;
  while (nextUrl && shouldContinuePaging({ pagesFetched, entriesSeen })) {
    const fetched = await boundedFetch(nextUrl, token);
    pagesFetched += 1;
    await sleep(NAV_IMPORT_BOUNDS.minRequestSpacingMs);
    if (!fetched.ok) {
      opts.bump(`fetch_${fetched.errorCode}`);
      opts.errors.push(`page:${fetched.errorCode}:${fetched.detail}`);
      break;
    }
    const page = parseNavFeedPage(fetched.body);
    if (!page.ok) {
      opts.bump("page_schema_invalid");
      opts.errors.push(`page_schema:${page.detail}`);
      break;
    }
    for (const item of page.value.items) {
      if (entriesSeen >= opts.maxEntries) break;
      entriesSeen += 1;
      const detailFetched = await boundedFetch(item.url, token);
      await sleep(NAV_IMPORT_BOUNDS.minRequestSpacingMs);
      if (!detailFetched.ok) {
        opts.bump(`fetch_detail_${detailFetched.errorCode}`);
        continue;
      }
      const parsed = parseNavFeedEntryDetail(detailFetched.body);
      if (!parsed.ok) {
        opts.bump("detail_schema_invalid");
        continue;
      }
      details.push(parsed.value);
    }
    nextUrl = page.value.next_url;
  }
  return { details, pagesFetched };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const live = argv.includes("--live");
  const outIdx = argv.indexOf("--out");
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : "nav-vacancy-dry-run-report.json";
  const maxIdx = argv.indexOf("--max-entries");
  const maxEntries = Math.min(
    maxIdx >= 0
      ? Math.max(1, Number(argv[maxIdx + 1]) || NAV_IMPORT_BOUNDS.maxEntriesPerSession)
      : NAV_IMPORT_BOUNDS.maxEntriesPerSession,
    NAV_IMPORT_BOUNDS.maxEntriesPerSession,
  );

  const startedAtIso = new Date().toISOString();
  const reasonCounts = new Map<string, number>();
  const errors: string[] = [];
  const bump = (code: string) =>
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);

  const { details, pagesFetched } = await collectDetails({
    live,
    maxEntries,
    errors,
    bump,
  });

  const importedAtIso = new Date().toISOString();
  const vacancies: ExternalVacancyV1[] = [];
  const deactivations: ExternalVacancyDeactivationV1[] = [];
  let scanned = 0;
  let rejected = 0;
  for (const detail of details) {
    scanned += 1;
    const result = normalizeNavEntry(detail, { importedAtIso });
    if (result.kind === "vacancy") {
      vacancies.push(result.vacancy);
    } else if (result.kind === "deactivation") {
      deactivations.push(result);
      bump("deactivation");
    } else {
      rejected += 1;
      bump(`rejected_${result.reason}`);
    }
  }
  // Idempotency plan over an EMPTY known-hash set (dry-run has no DB state);
  // intra-run duplicates are still caught.
  const plan = planVacancyUpsert(new Set(), vacancies);
  const duplicated = plan.skippedDuplicate.length;
  const accepted = plan.toInsert.length + deactivations.length;

  const finishedAtIso = new Date().toISOString();
  const built = buildImportSession({
    sessionId: `nav-vacancy-dry-run-${startedAtIso}`,
    sourceKey: NAV_SOURCE_KEY,
    transformVersion: NAV_TRANSFORM_VERSION,
    startedAtIso,
    finishedAtIso,
    itemsScanned: scanned,
    itemsAccepted: accepted,
    itemsRejected: rejected,
    itemsDuplicated: duplicated,
    reasonCounts: Array.from(reasonCounts.entries()).map(([code, count]) => ({ code, count })),
    errors,
    rollbackRef: "nav-vacancy-dry-run:no-persist",
  });
  const report = built.ok
    ? buildImportReport(built.session, { warningCodes: ["dry_run_no_persist"] })
    : null;

  const summary = {
    generatedAtIso: finishedAtIso,
    mode: live ? "dry_run_live" : "dry_run_fixtures",
    persisted: false as const,
    bounds: { ...NAV_IMPORT_BOUNDS, maxEntriesThisRun: maxEntries },
    pagesFetched,
    totals: {
      scanned,
      normalizedVacancies: plan.toInsert.length,
      deactivations: deactivations.length,
      rejected,
      duplicated,
    },
    sessionOk: built.ok,
    sessionReason: built.ok ? null : built.reasonCode,
    finalStatus: report?.finalStatus ?? null,
    reasonCounts: Object.fromEntries(reasonCounts),
    // The exact rows an ACTIVATED import would emit (nothing is written).
    normalizedRows: plan.toInsert,
    deactivationRecords: deactivations,
  };
  writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(
    JSON.stringify({
      mode: summary.mode,
      scanned,
      normalizedVacancies: plan.toInsert.length,
      deactivations: deactivations.length,
      rejected,
      duplicated,
      finalStatus: report?.finalStatus ?? null,
      persisted: false,
      out: outPath,
    }),
  );
}

main().catch((e) => {
  console.error("nav-vacancy-dry-run failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
