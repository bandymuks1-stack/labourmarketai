#!/usr/bin/env node
/**
 * 12-hour status report — data fetch (owner order 2026-11-14, P0).
 *
 * Reads ONLY: the open and recently merged pull requests (gh api, read scopes), the head check
 * runs, the review verdict comments, the last production deploy runs and the public /api/health.
 * Writes one JSON file for status-report.mjs. No database, no production writes, no secrets
 * printed (gh uses its own token; nothing is echoed).
 *
 *   node .github/scripts/status-report-fetch.mjs [--since-hours 12] > <file.json>
 *
 * The JSON goes to stdout (the caller redirects it); progress goes to stderr. The script itself writes no file.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const REPO = process.env.REPORT_REPO ?? "bandymuks1-stack/labourmarketai";
const HEALTH = process.env.REPORT_HEALTH_URL ?? "https://labourmarket.ai/api/health";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const SINCE_HOURS = Number(arg("--since-hours", "12"));

async function ghOnce(path) {
  const { stdout } = await run("gh", ["api", "-X", "GET", path], { maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout);
}

/**
 * gh --paginate follows Link headers that point at repositories/{id}/…, which the session proxy
 * refuses; page by hand on the repos/{owner}/{repo} path instead.
 */
async function gh(path, { paginate = false } = {}) {
  if (!paginate) return ghOnce(path);
  const all = [];
  for (let page = 1; page <= 20; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const chunk = await ghOnce(`${path}${sep}page=${page}`);
    all.push(...chunk);
    if (chunk.length < 100) break;
  }
  return all;
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = await fn(items[i]);
      } catch (e) {
        out[i] = { error: String(e?.message ?? e).slice(0, 200) };
      }
    }
  }
  await Promise.all(Array.from({ length: size }, worker));
  return out;
}

/** One CI verdict for a head commit, from its check runs. */
function ciVerdict(checkRuns) {
  const runs = checkRuns.filter((r) => r.name !== "ci-rerun-on-label");
  if (runs.length === 0) return { state: "none", failed: [] };
  const failed = runs
    .filter((r) => ["failure", "timed_out", "cancelled", "action_required"].includes(r.conclusion))
    .map((r) => r.name);
  const pending = runs.filter((r) => r.status !== "completed").map((r) => r.name);
  const state = failed.length ? "failure" : pending.length ? "pending" : "success";
  return { state, failed: [...new Set(failed)], pending: [...new Set(pending)] };
}

/**
 * Lane R / R2 verdicts that name the current head commit. A comment headed "Independent security
 * review" is R2; any other comment carrying "Reviewed commit:" is R. A verdict for an older head is
 * "stale" (a new head voids it).
 */
function reviewVerdict(comments, headSha) {
  const short = headSha.slice(0, 7);
  const mentionsHead = (b) => b.includes(headSha) || b.includes(short);
  const isR2 = (b) => /Independent security review/i.test(b);
  const isR = (b) => !isR2(b) && /Reviewed commit:/i.test(b);
  const read = (b) => {
    const m = b.match(/Blocks merge:?\**\s*\**\s*(no|yes)/i);
    if (m) return m[1].toLowerCase() === "no" ? "no-block" : "blocks";
    if (/NO BLOCKING FINDINGS/i.test(b)) return "no-block";
    if (/BLOCKING FINDINGS|Result:\s*\**\s*BLOCK/i.test(b)) return "blocks";
    return "unclear";
  };
  const one = (pred) => {
    const all = comments.map((c) => c.body ?? "").filter(pred);
    const cur = all.filter(mentionsHead);
    if (cur.length) return read(cur[cur.length - 1]);
    return all.length ? "stale" : "none";
  };
  return { review: one(isR), security: one(isR2) };
}

const sinceIso = new Date(Date.now() - SINCE_HOURS * 3600 * 1000).toISOString();

const open = await gh(`repos/${REPO}/pulls?state=open&per_page=100`, { paginate: true });
const prs = await pool(open, 8, async (p) => {
  let [detail, checks, comments] = await Promise.all([
    gh(`repos/${REPO}/pulls/${p.number}`),
    gh(`repos/${REPO}/commits/${p.head.sha}/check-runs?per_page=100`),
    gh(`repos/${REPO}/issues/${p.number}/comments?per_page=100`, { paginate: true }),
  ]);
  if (detail.mergeable_state === "unknown") {
    // GitHub computes mergeability lazily; the first read only starts it.
    await new Promise((r) => setTimeout(r, 3000));
    detail = await gh(`repos/${REPO}/pulls/${p.number}`);
  }
  return {
    number: p.number,
    title: p.title,
    branch: p.head.ref,
    head: p.head.sha,
    draft: p.draft,
    labels: p.labels.map((l) => l.name),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    mergeableState: detail.mergeable_state,
    changedFiles: detail.changed_files,
    ci: ciVerdict(checks.check_runs ?? []),
    verdicts: reviewVerdict(comments, p.head.sha),
  };
});

const merged = (
  await gh(
    `search/issues?q=${encodeURIComponent(`repo:${REPO} is:pr is:merged merged:>=${sinceIso}`)}&per_page=100`,
  )
).items.map((i) => ({ number: i.number, title: i.title, closedAt: i.closed_at, user: i.user?.login }));

const deploys = (
  await gh(`repos/${REPO}/actions/workflows/deploy-vps.yml/runs?per_page=30`)
).workflow_runs
  .filter((r) => r.created_at >= sinceIso && r.conclusion !== "skipped")
  .map((r) => ({ sha: r.head_sha.slice(0, 8), conclusion: r.conclusion, status: r.status, at: r.updated_at, url: r.html_url }));

const walks = (
  await gh(`repos/${REPO}/actions/workflows/prod-qa-walk.yml/runs?per_page=50`)
).workflow_runs
  .filter((r) => r.created_at >= sinceIso)
  .map((r) => ({ id: r.id, title: r.display_title, sha: r.head_sha.slice(0, 8), conclusion: r.conclusion, status: r.status, at: r.updated_at }));

let health = null;
try {
  const res = await fetch(HEALTH);
  const j = await res.json();
  health = { ok: j.ok, build: j.build, at: j.at, dbMs: j.checks?.db?.ms, authMs: j.checks?.auth?.ms };
} catch (e) {
  health = { ok: false, error: String(e?.message ?? e).slice(0, 120) };
}

process.stdout.write(
  JSON.stringify({ fetchedAt: new Date().toISOString(), sinceIso, health, deploys, walks, merged, prs }, null, 1) + "\n",
);
console.error(`open PRs ${prs.length}, merged ${merged.length}, deploys ${deploys.length}, walks ${walks.length}`);
