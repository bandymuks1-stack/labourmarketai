#!/usr/bin/env node
// PRODUCTION WALK BRAKES — automatic load and error brakes in front of every
// production walk (.github/workflows/prod-qa-walk.yml).
//
// Why (owner order 2026-10-23): one brigade-formation walk (run 39795574869,
// 2026-10-22 14:26–14:33 UTC) made ~8,100 Supabase requests in 6.5 minutes.
// The daily budget is raised to 200 walks, so a count alone is not a safe
// limit: a walk must also not start while production is slow, while the last
// walks are failing for infrastructure reasons, while Supabase is answering
// 5xx / 429, or right on the heels of the previous walk.
//
// Subcommands (each prints one summary line; a refusal prints `::error::` and
// exits 1; a skipped optional signal prints `::notice::` and exits 0):
//
//   health    3 x GET /api/health, 5 s apart: refuse if ANY sample is not
//             HTTP 200, not ok, has db.ms or auth.ms > 1500, or no
//             vacancyFreshness answer. NOT bypassable by budget_override.
//   deploy    refuse while a deploy-vps.yml run is in progress or queued, or
//             within 5 min of the last one ending (the blue/green switch runs
//             two servers on one origin: run 39978076973 got Cloudflare 522s
//             and 45 s timeouts during deploys). NOT bypassable.
//   errors    refuse when the last 2 walks that reached production both failed
//             in their FIRST step or with infrastructure / 5xx errors, and the
//             latest of them ended < 60 min ago (circuit breaker: after the
//             cool-down one probe walk may run). Bypassable by budget_override.
//   supabase  OPTIONAL: with secret SUPABASE_ACCESS_TOKEN, count 5xx and 429
//             answers at the Supabase edge in the last 15 min; refuse above 25
//             5xx or 10 x 429. Absent token or unreadable logs: skipped.
//             Bypassable by budget_override.
//   gap       keep >= 180 s between the end of the previous walk and the start
//             of this one: WAITS out the remainder (at most 180 s), because the
//             walk job is queued behind the `prod-qa-walk` concurrency group —
//             a refusal there would stop the acceptance campaign's chain.
//             NOT bypassable.
//   count     production walks that reached production in the last 24 h,
//             cheaply (artifact list + in-flight runs), printed as `used=<n>`.
//
// The pure judges are exported for the unit test
// (apps/web/lib/guards/walk-brakes.test.ts). Nothing here reads or prints a
// secret, a session, a person or a production row: only HTTP status codes,
// latencies, run conclusions and counts.

import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Every threshold in one place (documented in prod-qa-walk.yml). */
export const THRESHOLDS = Object.freeze({
  /** /api/health database probe latency above this refuses. */
  healthDbMs: 1500,
  /** /api/health auth probe latency above this refuses. */
  healthAuthMs: 1500,
  /** Health is sampled this many times, this far apart; EVERY sample must be
   *  HTTP 200 and within the latency thresholds (coordinator 2026-10-23). */
  healthSamples: 3,
  healthSampleGapMs: 5_000,
  /** No walk while a deploy runs or is queued, nor this soon after one ended
   *  (blue/green switch: two Next servers on one origin; run 39978076973 got
   *  Cloudflare 522s and 45 s timeouts during deploys). */
  deployQuietMinutes: 5,
  /** The error brake looks at this many latest walks that reached production. */
  errorLookback: 2,
  /** …and trips only while the latest of them ended less than this long ago. */
  errorCooldownMinutes: 60,
  /** Supabase edge window and limits (optional brake). */
  supabaseWindowMinutes: 15,
  supabaseMax5xx: 25,
  supabaseMax429: 10,
  /** Minimum gap between the previous walk's end and the next walk's start. */
  minGapSeconds: 180,
});

/** Failures that are the platform's, not the product's. */
const INFRA_PATTERN =
  /\b(?:500|502|503|504)\b|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Time-?out|net::ERR_|ECONNRESET|ECONNREFUSED|ETIMEDOUT|socket hang up|PGRST\d{3}.*(?:timeout|connection)|57014|too many connections|rate limit/i;

// ── Pure judges ──────────────────────────────────────────────────────────────

/** @returns {{ ok: boolean, reasons: string[], summary: string }} */
export function judgeHealth(report, t = THRESHOLDS) {
  const reasons = [];
  if (!report || typeof report !== "object") {
    return { ok: false, reasons: ["health answer is not JSON"], summary: "health: unreadable" };
  }
  const db = report.checks?.db ?? {};
  const auth = report.checks?.auth ?? {};
  const fresh = report.vacancyFreshness ?? {};
  if (report.ok !== true) reasons.push("ok=false");
  if (db.ok !== true) reasons.push(`db not ok${db.reason ? ` (${db.reason})` : ""}`);
  if (auth.ok !== true) reasons.push(`auth not ok${auth.reason ? ` (${auth.reason})` : ""}`);
  if (!(typeof db.ms === "number" && db.ms <= t.healthDbMs)) reasons.push(`db.ms=${db.ms ?? "?"} > ${t.healthDbMs}`);
  if (!(typeof auth.ms === "number" && auth.ms <= t.healthAuthMs))
    reasons.push(`auth.ms=${auth.ms ?? "?"} > ${t.healthAuthMs}`);
  if (fresh.ok !== true) reasons.push(`vacancyFreshness not ok${fresh.reason ? ` (${fresh.reason})` : ""}`);
  const summary = `health: ok=${report.ok} db=${db.ms ?? "?"}ms auth=${auth.ms ?? "?"}ms vacancyFreshness=${fresh.ok === true ? fresh.state ?? "ok" : "not ok"} build=${report.build ?? "?"}`;
  return { ok: reasons.length === 0, reasons, summary };
}

/**
 * All health samples together: EVERY sample must be an HTTP 200 whose report
 * passes `judgeHealth`. `samples` = [{ status, report }] (status 0 = no answer).
 * @returns {{ ok: boolean, reasons: string[] }}
 */
export function judgeHealthSamples(samples, t = THRESHOLDS) {
  const reasons = [];
  if (samples.length < t.healthSamples) reasons.push(`only ${samples.length} of ${t.healthSamples} samples taken`);
  samples.forEach((s, i) => {
    if (s.status !== 200) reasons.push(`sample ${i + 1}: HTTP ${s.status || "no answer"}`);
    const v = judgeHealth(s.report, t);
    if (!v.ok) reasons.push(`sample ${i + 1}: ${v.reasons.join(", ")}`);
  });
  return { ok: reasons.length === 0, reasons };
}

const DEPLOY_ACTIVE = new Set(["in_progress", "queued", "waiting", "requested", "pending"]);

/**
 * The deploy brake: `runs` = the latest deploy-vps.yml runs ({ id, status,
 * updated_at }). Refuse while one is running or queued, or within
 * `deployQuietMinutes` of the latest one ending.
 * @returns {{ refuse: boolean, reason: string }}
 */
export function judgeDeployBrake(runs, now = new Date(), t = THRESHOLDS) {
  const active = runs.filter((r) => DEPLOY_ACTIVE.has(r.status));
  if (active.length > 0) {
    return {
      refuse: true,
      reason: `a production deploy is ${active.map((r) => `${r.status} (run ${r.id})`).join(", ")}: the blue/green switch runs two servers on one origin, so a walk now measures the deploy, not the product. Re-dispatch ${t.deployQuietMinutes} min after it ends.`,
    };
  }
  const ended = runs
    .filter((r) => r.status === "completed")
    .map((r) => Date.parse(r.updated_at ?? ""))
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  if (ended !== undefined) {
    const ageMin = (now.getTime() - ended) / 60_000;
    if (ageMin < t.deployQuietMinutes) {
      return {
        refuse: true,
        reason: `the last production deploy ended ${Math.max(0, Math.round(ageMin * 10) / 10)} min ago (quiet period ${t.deployQuietMinutes} min). Re-dispatch after ${new Date(ended + t.deployQuietMinutes * 60_000).toISOString()}.`,
      };
    }
    return { refuse: false, reason: `no deploy running; the last ended ${Math.round(ageMin)} min ago` };
  }
  return { refuse: false, reason: "no deploy run found" };
}

/**
 * One finished walk that reached production, judged from its own record.
 * `result` is the Playwright JSON report (or null when it is missing), `log`
 * the list reporter's text (or "").
 * @returns {{ bad: boolean, why: string }}
 */
export function judgeWalkRun({ walkConclusion, provisionFailed, result, log = "" }) {
  if (walkConclusion === "success") return { bad: false, why: "passed" };
  if (provisionFailed) return { bad: true, why: "the session mint failed (first step)" };
  if (!result) return { bad: true, why: "failed with no result file (infrastructure)" };
  const tests = flattenTests(result);
  const first = tests.find((x) => x.status !== "skipped");
  if (first && first.status !== "passed" && first.status !== "expected" && first.status !== "flaky") {
    return { bad: true, why: `the first step failed (${first.status})` };
  }
  const messages = tests.flatMap((x) => x.errors).join("\n");
  if (INFRA_PATTERN.test(messages) || INFRA_PATTERN.test(log)) {
    return { bad: true, why: "infrastructure / 5xx error in the walk" };
  }
  return { bad: false, why: "a product assertion failed (not an infrastructure signal)" };
}

/** Tests of a Playwright JSON report in file order: { status, errors[] }. */
export function flattenTests(result) {
  const out = [];
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const last = results[results.length - 1];
        const status = last?.status ?? test.status ?? "unknown";
        const errors = results.flatMap((r) => [
          ...(r.errors ?? []).map((e) => String(e?.message ?? "")),
          ...(r.error ? [String(r.error.message ?? "")] : []),
        ]);
        out.push({ status: test.status === "skipped" ? "skipped" : status, errors });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };
  for (const s of result?.suites ?? []) walk(s);
  return out;
}

/**
 * The error brake: `recent` = the latest walks that reached production,
 * NEWEST FIRST, each { bad, why, endedAt }.
 * @returns {{ refuse: boolean, reason: string }}
 */
export function judgeErrorBrake(recent, now = new Date(), t = THRESHOLDS) {
  const last = recent.slice(0, t.errorLookback);
  if (last.length < t.errorLookback) return { refuse: false, reason: `only ${last.length} earlier walk(s) to judge` };
  if (!last.every((r) => r.bad)) return { refuse: false, reason: "the latest walks did not fail for infrastructure" };
  const endedMs = Date.parse(last[0].endedAt ?? "");
  const ageMin = Number.isFinite(endedMs) ? (now.getTime() - endedMs) / 60_000 : 0;
  if (ageMin >= t.errorCooldownMinutes) {
    return {
      refuse: false,
      reason: `the last ${t.errorLookback} walks failed, but the latest ended ${Math.round(ageMin)} min ago (cool-down ${t.errorCooldownMinutes} min): one probe walk may run`,
    };
  }
  return {
    refuse: true,
    reason: `the last ${t.errorLookback} walks that reached production failed (${last.map((r) => r.why).join("; ")}); the latest ended ${Math.round(ageMin)} min ago. Wait ${Math.ceil(t.errorCooldownMinutes - ageMin)} min (cool-down), or fix the cause first.`,
  };
}

/** Seconds still to wait so `minGapSeconds` separate the previous walk's end from now. */
export function gapRemainingSeconds(lastEndedAtIso, now = new Date(), t = THRESHOLDS) {
  const ended = Date.parse(lastEndedAtIso ?? "");
  if (!Number.isFinite(ended)) return 0;
  return Math.max(0, Math.ceil(t.minGapSeconds - (now.getTime() - ended) / 1000));
}

/** @returns {{ refuse: boolean, reason: string }} */
export function judgeSupabaseEdge({ e5, e429 }, t = THRESHOLDS) {
  if (e5 > t.supabaseMax5xx || e429 > t.supabaseMax429) {
    return {
      refuse: true,
      reason: `Supabase edge in the last ${t.supabaseWindowMinutes} min: ${e5} x 5xx (limit ${t.supabaseMax5xx}), ${e429} x 429 (limit ${t.supabaseMax429})`,
    };
  }
  return { refuse: false, reason: `Supabase edge in the last ${t.supabaseWindowMinutes} min: ${e5} x 5xx, ${e429} x 429` };
}

// ── I/O (only when run as a script) ──────────────────────────────────────────

const REPO = process.env.GITHUB_REPOSITORY ?? "";
const RUN_ID = Number(process.env.GITHUB_RUN_ID ?? 0);
const WORKFLOW = "prod-qa-walk.yml";

function say(line) {
  console.log(line);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
}
function refuse(reason) {
  say(`::error::walk brake: ${reason}`);
  process.exit(1);
}
function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}
function ghJson(path) {
  return JSON.parse(gh(["api", path]));
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The walk job of a run and whether it reached production (Provision started). */
function walkJobOf(runId) {
  const jobs = ghJson(`repos/${REPO}/actions/runs/${runId}/jobs?filter=all&per_page=100`).jobs ?? [];
  const walk = jobs.find((j) => j.name === "walk");
  if (!walk) return null;
  const provision = (walk.steps ?? []).find((s) => String(s.name).startsWith("Provision"));
  const reached =
    !!provision &&
    (provision.status === "in_progress" || provision.status === "completed") &&
    provision.conclusion !== "skipped";
  return { walk, provision, reached };
}

/** The latest runs of this workflow other than this one, newest first. */
function recentRuns(perPage = 30) {
  return (ghJson(`repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=${perPage}`).workflow_runs ?? []).filter(
    (r) => r.id !== RUN_ID,
  );
}

async function cmdHealth() {
  const url = process.env.HEALTH_URL ?? "https://labourmarket.ai/api/health";
  const samples = [];
  for (let n = 1; n <= THRESHOLDS.healthSamples; n++) {
    let status = 0;
    let report = null;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      status = res.status;
      report = await res.json().catch(() => null);
    } catch (e) {
      say(`health sample ${n}: no answer (${e?.name ?? "error"})`);
    }
    samples.push({ status, report });
    if (report) say(`${judgeHealth(report).summary} http=${status} (sample ${n}/${THRESHOLDS.healthSamples})`);
    if (n < THRESHOLDS.healthSamples) await sleep(THRESHOLDS.healthSampleGapMs);
  }
  const verdict = judgeHealthSamples(samples);
  if (!verdict.ok) {
    refuse(`production is not healthy enough for a walk: ${verdict.reasons.join("; ")}. Every one of ${THRESHOLDS.healthSamples} samples must be HTTP 200 with ok=true, db.ms and auth.ms <= ${THRESHOLDS.healthDbMs} ms and vacancyFreshness answered.`);
  }
  say(`health brake: clear (${THRESHOLDS.healthSamples}/${THRESHOLDS.healthSamples} samples within thresholds)`);
}

async function cmdDeploy() {
  const runs = (ghJson(`repos/${REPO}/actions/workflows/deploy-vps.yml/runs?per_page=10`).workflow_runs ?? []).map(
    (r) => ({ id: r.id, status: r.status, updated_at: r.updated_at }),
  );
  const verdict = judgeDeployBrake(runs);
  if (verdict.refuse) refuse(verdict.reason);
  say(`deploy brake: clear (${verdict.reason})`);
}

async function cmdErrors() {
  const judged = [];
  for (const run of recentRuns(40)) {
    if (judged.length >= THRESHOLDS.errorLookback) break;
    if (run.status !== "completed") continue;
    const job = walkJobOf(run.id);
    if (!job || !job.reached) continue;
    if (job.walk.conclusion === "cancelled" || job.walk.conclusion === "skipped") continue;
    let result = null;
    let log = "";
    if (job.walk.conclusion !== "success") {
      const dir = mkdtempSync(join(tmpdir(), `walk-${run.id}-`));
      try {
        gh(["run", "download", String(run.id), "-R", REPO, "-D", dir]);
      } catch {
        /* no artifact: judged as a failure with no result file */
      }
      const files = listFiles(dir);
      const resultFile = files.find((f) => f.endsWith("prod-qa-result.json"));
      const logFile = files.find((f) => f.endsWith("prod-qa-walk.log"));
      try {
        result = resultFile ? JSON.parse(readFileSync(resultFile, "utf8")) : null;
      } catch {
        result = null;
      }
      log = logFile ? readFileSync(logFile, "utf8") : "";
    }
    const verdict = judgeWalkRun({
      walkConclusion: job.walk.conclusion,
      provisionFailed: job.provision?.conclusion === "failure",
      result,
      log,
    });
    judged.push({ ...verdict, endedAt: job.walk.completed_at, id: run.id });
    say(`earlier walk ${run.id}: ${job.walk.conclusion} — ${verdict.why}`);
  }
  const verdict = judgeErrorBrake(judged);
  if (verdict.refuse) {
    if (process.env.OVERRIDE === "true") {
      say(`::warning::walk brake (errors) bypassed by budget_override: ${verdict.reason}`);
      return;
    }
    refuse(verdict.reason);
  }
  say(`error brake: clear (${verdict.reason})`);
}

function listFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

async function cmdSupabase() {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!token) {
    say("::notice::walk brake (Supabase edge errors) skipped: no SUPABASE_ACCESS_TOKEN secret");
    return;
  }
  const ref = /^https:\/\/([a-z0-9]{20})\.supabase\.co/.exec(process.env.SUPABASE_URL ?? "")?.[1];
  if (!ref) {
    say("::notice::walk brake (Supabase edge errors) skipped: the project ref is not readable from the URL");
    return;
  }
  const end = new Date();
  const start = new Date(end.getTime() - THRESHOLDS.supabaseWindowMinutes * 60_000);
  const sql =
    "select countif(r.status_code >= 500) as e5, countif(r.status_code = 429) as e429, count(*) as n " +
    "from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as r";
  const qs = new URLSearchParams({
    sql,
    iso_timestamp_start: start.toISOString(),
    iso_timestamp_end: end.toISOString(),
  });
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?${qs}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      say(`::warning::walk brake (Supabase edge errors) skipped: logs API answered ${res.status}`);
      return;
    }
    const body = await res.json();
    const row = Array.isArray(body?.result) ? body.result[0] : null;
    if (!row) {
      say("::warning::walk brake (Supabase edge errors) skipped: no rows in the logs answer");
      return;
    }
    const verdict = judgeSupabaseEdge({ e5: Number(row.e5 ?? 0), e429: Number(row.e429 ?? 0) });
    if (verdict.refuse) {
      if (process.env.OVERRIDE === "true") {
        say(`::warning::walk brake (Supabase) bypassed by budget_override: ${verdict.reason}`);
        return;
      }
      refuse(verdict.reason);
    }
    say(`Supabase brake: clear (${verdict.reason}; ${row.n ?? "?"} requests)`);
  } catch (e) {
    say(`::warning::walk brake (Supabase edge errors) skipped: logs API unreachable (${e?.name ?? "error"})`);
  }
}

async function cmdGap() {
  let lastEnded = null;
  for (const run of recentRuns(20)) {
    const job = walkJobOf(run.id);
    if (!job || !job.reached) continue;
    if (job.walk.status !== "completed") continue; // a walk in flight: the concurrency group orders us after it
    lastEnded = job.walk.completed_at;
    break;
  }
  const wait = gapRemainingSeconds(lastEnded);
  if (wait > 0) {
    say(`::notice::walk brake (gap): the previous walk ended at ${lastEnded}; waiting ${wait} s so ${THRESHOLDS.minGapSeconds} s separate walks`);
    await sleep(wait * 1000);
  }
  say(`gap brake: clear (previous walk ended ${lastEnded ?? "unknown"}, minimum gap ${THRESHOLDS.minGapSeconds} s)`);
}

async function cmdCount() {
  // Completed walks: every walk job uploads `prod-qa-<spec>-<run id>` with
  // `if: always()`, so the artifact list names them in a few calls instead of
  // one jobs call per run (at 200 walks a day that was ~40k API calls a day,
  // past the GITHUB_TOKEN limit). In-flight runs are read one by one (few).
  const since = Date.now() - 24 * 3600_000;
  const runIds = new Set();
  for (let page = 1; page <= 20; page++) {
    const body = ghJson(`repos/${REPO}/actions/artifacts?per_page=100&page=${page}`);
    const artifacts = body.artifacts ?? [];
    let older = false;
    for (const a of artifacts) {
      const created = Date.parse(a.created_at ?? "");
      if (created < since) {
        older = true;
        continue;
      }
      const runId = a.workflow_run?.id;
      if (String(a.name).startsWith("prod-qa-") && runId && runId !== RUN_ID) runIds.add(runId);
    }
    if (older || artifacts.length < 100) break;
  }
  for (const run of recentRuns(30)) {
    if (run.status === "completed" || runIds.has(run.id)) continue;
    const job = walkJobOf(run.id);
    if (job?.reached) runIds.add(run.id);
  }
  console.log(`used=${runIds.size}`);
}

const COMMANDS = {
  health: cmdHealth,
  deploy: cmdDeploy,
  errors: cmdErrors,
  supabase: cmdSupabase,
  gap: cmdGap,
  count: cmdCount,
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const cmd = COMMANDS[process.argv[2] ?? ""];
  if (!cmd) {
    console.error(`usage: walk-brakes.mjs <${Object.keys(COMMANDS).join("|")}>`);
    process.exit(2);
  }
  await cmd();
}
