#!/usr/bin/env node
/**
 * 12-hour status report — data collection (owner order 2026-11-14, P0).
 *
 *   node .github/scripts/status-report-fetch.mjs [--since-hours 12] > <file.json>
 *
 * Reads ONLY: open and recently merged pull requests, head check runs and commit statuses, review
 * verdicts and formal reviews, deploy and walk runs (gh api, read scopes), and the public /api/health.
 * No database, no production writes, no secrets printed. The JSON goes to stdout; progress and the
 * error log go to stderr. The decision logic lives in status-report-lib.mjs (tested by
 * apps/web/lib/guards/status-report.test.ts).
 *
 * Exit code: 0 with completeness COMPLETE; 3 with completeness PARTIAL (the JSON is still written and
 * the report marks it PARTIAL); 2 on a usage error.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { collect, createGithubClient, parseGhInclude } from "./status-report-lib.mjs";

const run = promisify(execFile);
const REPO = process.env.REPORT_REPO ?? "bandymuks1-stack/labourmarketai";
const HEALTH = process.env.REPORT_HEALTH_URL ?? "https://labourmarket.ai/api/health";
const REQUEST_TIMEOUT_MS = 30_000;

const args = process.argv.slice(2);
const i = args.indexOf("--since-hours");
const SINCE_HOURS = i >= 0 ? Number(args[i + 1]) : 12;
if (!Number.isFinite(SINCE_HOURS) || SINCE_HOURS <= 0) {
  console.error("usage: status-report-fetch.mjs [--since-hours 12] > <file.json>");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * `gh api -i` transport. gh exits non-zero on HTTP >= 400 but still prints the status line, headers
 * and body; only a missing status line (network failure, timeout) is thrown.
 */
async function transport(path) {
  try {
    const { stdout } = await run("gh", ["api", "-i", "-X", "GET", path], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return parseGhInclude(stdout);
  } catch (e) {
    const parsed = parseGhInclude(e?.stdout ?? "");
    if (parsed.status) return parsed;
    throw new Error(e?.killed ? `timeout after ${REQUEST_TIMEOUT_MS} ms` : String(e?.stderr || e?.message || e).slice(0, 200));
  }
}

async function fetchHealth() {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(HEALTH, { signal: AbortSignal.timeout(15_000) });
      const j = await res.json();
      return { ok: j.ok === true && res.ok, build: j.build, at: j.at, dbMs: j.checks?.db?.ms, authMs: j.checks?.auth?.ms };
    } catch (e) {
      last = e;
      await sleep(2000 * attempt);
    }
  }
  throw last;
}

const client = createGithubClient({ transport, sleep });
const sinceIso = new Date(Date.now() - SINCE_HOURS * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
const data = await collect({ client, repo: REPO, sinceIso, fetchHealth, sleep });
data.fetchedAt = new Date().toISOString();

process.stdout.write(JSON.stringify(data, null, 1) + "\n");
console.error(
  `${data.completeness}: open PRs ${data.prs.length} (${data.prs.filter((p) => p.incomplete).length} incomplete), merged ${data.merged.length}, deploys ${data.deploys.length}, walks ${data.walks.length}, requests ${data.requests}, errors ${data.errors.length}`,
);
for (const e of data.errors) console.error(`  error ${e.status} after ${e.attempts} attempt(s): ${e.path} — ${e.message}`);
process.exit(data.completeness === "COMPLETE" ? 0 : 3);
