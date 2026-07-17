/**
 * pnpm tsx scripts/nav-vacancy-import.ts --emit <path> [--max-entries N]
 *
 * The bounded NAV (arbeidsplassen.no) production import mechanism —
 * eurostat-import.ts precedent. It performs the exact canonical pipeline —
 * official bounded fetch → pure contract parse (nav-feed-contract.ts) →
 * pure normalization (normalize.ts) → idempotent upsert plan → import
 * session/report — and EMITS the accepted, validated external_vacancies
 * rows plus deactivation records plus the session accounting as JSON. It
 * does NOT write to the database itself: persistence is performed by the
 * operator via the Supabase service-role path (MCP) using the emitted
 * payload with an idempotent `on conflict (source_key, content_hash) do
 * nothing` insert, and deactivations via
 * `update ... set status='inactive', deactivated_at=now()` — the NAV terms
 * demand inactive ads disappear IMMEDIATELY, so the operator runbook
 * (docs/intelligence/official-vacancy-source-nav-norway-v1.md) applies the
 * deactivation records in the SAME operator session as the inserts.
 *
 * FAIL-CLOSED GATES (all three must pass, else exit 1 — the shipped state
 * refuses at every gate):
 *   1. env: NAV_SOURCE_ENABLED must be explicitly "on" AND NAV_KILL_SWITCH
 *      must not be engaged (kill switch semantics mirror eurostat).
 *   2. token: NAV_FEED_TOKEN must be present (the PRIVATE registered token
 *      — production import with the public experiment token is refused by
 *      the terms; the token is never committed and never printed).
 *   3. registry: validateExternalImport("nav_arbeidsplassen") must allow it
 *      — requires the owner-flipped legalStatus "confirmed" + activation
 *      "on" in lib/intelligence/source-governance.ts. Shipped: refuses with
 *      legal_status_unconfirmed.
 *
 * Hard bounds (owner): ≤10 pages, ≤200 entries per session, spaced polite
 * requests, host-pinned to pam-stilling-feed.nav.no, one session, no
 * scheduler, no backfill. Malformed entries are counted and rejected —
 * never a partial write.
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
import { validateExternalImport } from "../lib/intelligence/import-boundary";
import { buildImportSession } from "../lib/intelligence/import-session";
import { buildImportReport } from "../lib/intelligence/import-report";

function isOn(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "on";
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

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

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const emitIdx = argv.indexOf("--emit");
  const emitPath = emitIdx >= 0 ? argv[emitIdx + 1] : "nav-vacancy-import-accepted.json";
  const maxIdx = argv.indexOf("--max-entries");
  const maxEntries = Math.min(
    maxIdx >= 0
      ? Math.max(1, Number(argv[maxIdx + 1]) || NAV_IMPORT_BOUNDS.maxEntriesPerSession)
      : NAV_IMPORT_BOUNDS.maxEntriesPerSession,
    NAV_IMPORT_BOUNDS.maxEntriesPerSession,
  );

  // Gate 1: enable flag + kill switch (fail-closed: absent = OFF).
  const enabled = isOn(process.env.NAV_SOURCE_ENABLED);
  const killed = isOn(process.env.NAV_KILL_SWITCH);
  if (!enabled || killed) {
    console.error(
      `nav-vacancy-import blocked: NAV_SOURCE_ENABLED=${enabled ? "on" : "off"} ` +
        `NAV_KILL_SWITCH=${killed ? "engaged" : "clear"}. ` +
        "The source ships OFF — see docs/intelligence/official-vacancy-source-nav-norway-v1.md.",
    );
    process.exit(1);
  }
  // Gate 2: the registered private token must be present (never printed).
  const token = process.env.NAV_FEED_TOKEN ?? "";
  if (token.trim().length === 0) {
    console.error(
      "nav-vacancy-import blocked: NAV_FEED_TOKEN missing. Production import " +
        "requires the PRIVATE registered token (REQUIRES_OWNER_ACTION — email " +
        "nav.team.arbeidsplassen@nav.no; see the activation runbook).",
    );
    process.exit(1);
  }
  // Gate 3: code-registry activation via the shared import boundary.
  const boundary = validateExternalImport({
    sourceKey: NAV_SOURCE_KEY,
    snapshotRef: "nav-first-import",
    sourceUrl: NAV_FEED_ORIGIN,
    capturedAt: new Date(0).toISOString(),
    payload: null,
  });
  if (!boundary.ok) {
    console.error(
      `nav-vacancy-import boundary refused: ${boundary.reasonCode}. ` +
        "The owner must confirm the legal status AND flip activation to \"on\" in " +
        "lib/intelligence/source-governance.ts (after the NAV registration gate).",
    );
    process.exit(1);
  }

  const startedAtIso = new Date().toISOString();
  const reasonCounts = new Map<string, number>();
  const errors: string[] = [];
  const bump = (code: string) =>
    reasonCounts.set(code, (reasonCounts.get(code) ?? 0) + 1);

  // Bounded, host-pinned feed traversal.
  const details: NavFeedEntryDetail[] = [];
  let pagesFetched = 0;
  let entriesSeen = 0;
  let nextUrl: string | null = `${NAV_FEED_ORIGIN}/api/v1/feed`;
  while (nextUrl && shouldContinuePaging({ pagesFetched, entriesSeen })) {
    const fetched = await boundedFetch(nextUrl, token);
    pagesFetched += 1;
    await sleep(NAV_IMPORT_BOUNDS.minRequestSpacingMs);
    if (!fetched.ok) {
      bump(`fetch_${fetched.errorCode}`);
      errors.push(`page:${fetched.errorCode}:${fetched.detail}`);
      break;
    }
    const page = parseNavFeedPage(fetched.body);
    if (!page.ok) {
      bump("page_schema_invalid");
      errors.push(`page_schema:${page.detail}`);
      break;
    }
    for (const item of page.value.items) {
      if (entriesSeen >= maxEntries) break;
      entriesSeen += 1;
      const detailFetched = await boundedFetch(item.url, token);
      await sleep(NAV_IMPORT_BOUNDS.minRequestSpacingMs);
      if (!detailFetched.ok) {
        bump(`fetch_detail_${detailFetched.errorCode}`);
        continue;
      }
      const parsed = parseNavFeedEntryDetail(detailFetched.body);
      if (!parsed.ok) {
        bump("detail_schema_invalid");
        continue;
      }
      details.push(parsed.value);
    }
    nextUrl = page.value.next_url;
  }

  // Pure normalization — a malformed entry becomes a counted rejection,
  // never a partial row.
  const importedAtIso = new Date().toISOString();
  const vacancies: ExternalVacancyV1[] = [];
  const deactivations: ExternalVacancyDeactivationV1[] = [];
  let scanned = 0;
  let rejected = 0;
  for (const detail of details) {
    scanned += 1;
    const result = normalizeNavEntry(detail, { importedAtIso });
    if (result.kind === "vacancy") vacancies.push(result.vacancy);
    else if (result.kind === "deactivation") {
      deactivations.push(result);
      bump("deactivation");
    } else {
      rejected += 1;
      bump(`rejected_${result.reason}`);
    }
  }
  const plan = planVacancyUpsert(new Set(), vacancies);
  const duplicated = plan.skippedDuplicate.length;
  const accepted = plan.toInsert.length + deactivations.length;

  const finishedAtIso = new Date().toISOString();
  const sessionId = `nav-vacancy-import-${startedAtIso}`;
  const built = buildImportSession({
    sessionId,
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
    rollbackRef: `nav-vacancy-import-session:${sessionId}`,
  });
  const report = built.ok ? buildImportReport(built.session, {}) : null;

  const out = {
    generatedAtIso: finishedAtIso,
    sessionId,
    rollbackRef: `nav-vacancy-import-session:${sessionId}`,
    bounds: { ...NAV_IMPORT_BOUNDS, maxEntriesThisRun: maxEntries },
    pagesFetched,
    totals: {
      scanned,
      accepted,
      insertRows: plan.toInsert.length,
      deactivations: deactivations.length,
      rejected,
      duplicated,
    },
    reasonCounts: Object.fromEntries(reasonCounts),
    sessionOk: built.ok,
    sessionReason: built.ok ? null : built.reasonCode,
    finalStatus: report?.finalStatus ?? null,
    // The exact DB payloads for the operator's idempotent service-role
    // apply: inserts `on conflict (source_key, content_hash) do nothing`,
    // deactivations in the SAME session (immediate-removal obligation).
    acceptedRows: plan.toInsert,
    deactivationRecords: deactivations,
  };
  writeFileSync(emitPath, JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify({
      sessionId,
      scanned,
      insertRows: plan.toInsert.length,
      deactivations: deactivations.length,
      rejected,
      duplicated,
      finalStatus: report?.finalStatus ?? null,
      emit: emitPath,
    }),
  );
}

main().catch((e) => {
  console.error("nav-vacancy-import failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
