/**
 * 12-hour status report — the decision logic, with no I/O of its own (owner order 2026-11-14, P0).
 *
 * status-report-fetch.mjs (collection) and status-report.mjs (rendering) both import THIS module, and
 * apps/web/lib/guards/status-report.test.ts proves it, so what the tests cover is what the report runs.
 *
 * Rules (owner, 2026-11-14):
 *  1. CI is judged on every check run and commit status of the PR's CURRENT head, plus the checks the
 *     repository requires. A missing, stale, queued or unfinished check is never PASS.
 *  2. A review counts only when it names the FULL current head SHA, was written by a trusted author
 *     (repository OWNER / MEMBER / COLLABORATOR — never a bot or an outsider), was written after that
 *     head commit, and is the latest such verdict. Text alone never makes a PR mergeable: the report
 *     calls such a PR a merge CANDIDATE, re-checked by the coordinator before any merge.
 *  3. Every API failure is recorded per request; any failure makes the run PARTIAL, never SUCCESS.
 *  4. Requests have a timeout, bounded retries with backoff, rate-limit waits and explicit pagination.
 */

/** Checks the repository requires before merging into main (CLAUDE.md "Merge model"). Branch
 * protection cannot be read with the session's token (HTTP 403), so this policy list is the source;
 * the report names that source. */
export const POLICY_REQUIRED_CHECKS = Object.freeze(["quality", "migration-safety"]);

/** Check runs that are tooling, not a verdict on the code. */
export const IGNORED_CHECKS = Object.freeze(["ci-rerun-on-label"]);

export const TRUSTED_ASSOCIATIONS = Object.freeze(["OWNER", "MEMBER", "COLLABORATOR"]);

const FAIL_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
const PASS_CONCLUSIONS = new Set(["success", "neutral", "skipped"]);
const FULL_SHA = /^[0-9a-f]{40}$/;

// ------------------------------------------------------------------ CI

/** The latest run per check name (a re-run supersedes the earlier attempt). */
function latestByName(runs) {
  const by = new Map();
  for (const r of runs) {
    const key = r.name;
    const t = Date.parse(r.started_at ?? r.completed_at ?? "") || 0;
    const prev = by.get(key);
    const pt = prev ? Date.parse(prev.started_at ?? prev.completed_at ?? "") || 0 : -1;
    if (!prev || t > pt || (t === pt && (r.id ?? 0) > (prev.id ?? 0))) by.set(key, r);
  }
  return [...by.values()];
}

/**
 * One CI verdict for a head commit.
 * @param {{checkRuns?: any[]|null, statuses?: any[]|null, required?: string[], complete?: boolean}} input
 *   checkRuns: GitHub check runs of THIS head; statuses: legacy commit statuses of THIS head;
 *   complete: false when any of the reads failed or was truncated.
 * @returns {{state: "success"|"failure"|"pending"|"missing"|"unknown", failed: string[], pending: string[], missing: string[]}}
 */
export function ciVerdict({ checkRuns, statuses, required = POLICY_REQUIRED_CHECKS, complete = true }) {
  if (!complete || !Array.isArray(checkRuns) || !Array.isArray(statuses)) {
    return { state: "unknown", failed: [], pending: [], missing: [] };
  }
  const runs = latestByName(checkRuns.filter((r) => !IGNORED_CHECKS.includes(r.name)));
  const failed = [];
  const pending = [];
  const passed = new Set();
  for (const r of runs) {
    if (r.status !== "completed") pending.push(r.name);
    else if (FAIL_CONCLUSIONS.has(r.conclusion)) failed.push(r.name);
    else if (PASS_CONCLUSIONS.has(r.conclusion)) passed.add(r.name);
    else pending.push(r.name); // unknown conclusion: never a pass
  }
  // Legacy commit statuses: the newest per context wins.
  const ctx = new Map();
  for (const s of statuses) {
    const prev = ctx.get(s.context);
    if (!prev || Date.parse(s.updated_at ?? s.created_at) > Date.parse(prev.updated_at ?? prev.created_at)) ctx.set(s.context, s);
  }
  for (const s of ctx.values()) {
    if (s.state === "success") passed.add(s.context);
    else if (s.state === "pending") pending.push(s.context);
    else failed.push(s.context);
  }
  const missing = required.filter((n) => !passed.has(n) && !failed.includes(n) && !pending.includes(n));
  const state = failed.length
    ? "failure"
    : pending.length
      ? "pending"
      : missing.length || passed.size === 0
        ? "missing"
        : "success";
  return { state, failed: uniq(failed), pending: uniq(pending), missing };
}

const uniq = (a) => [...new Set(a)];

// ------------------------------------------------------------------ reviews

/** The SHA written in the verdict's "Reviewed commit:" field (not any SHA mentioned elsewhere). */
export function reviewedSha(body) {
  const m = String(body ?? "").match(/Reviewed commit:\**\s*`?([0-9a-f]{7,40})`?/i);
  return m ? m[1].toLowerCase() : null;
}

/** "no-block" | "blocks" | "unclear" from a verdict body. */
export function verdictOf(body) {
  const b = String(body ?? "");
  const m = b.match(/Blocks merge:?\**\s*\**\s*(no|yes)\b/i);
  if (m) return m[1].toLowerCase() === "no" ? "no-block" : "blocks";
  if (/\bNO BLOCKING FINDINGS\b/i.test(b)) return "no-block";
  if (/\bBLOCKING FINDINGS\b/i.test(b) || /Result:\**\s*\**\s*BLOCK/i.test(b)) return "blocks";
  return "unclear";
}

const isSecurityReview = (b) => /Independent security review/i.test(b ?? "");
const isCodeReview = (b) => !isSecurityReview(b) && /Reviewed commit:/i.test(b ?? "");

/**
 * Review and security-review verdicts for the PR's current head.
 * @param {{comments: any[], reviews?: any[], headSha: string, headCommittedAt?: string|null}} input
 * @returns {{review: Verdict, security: Verdict}} with Verdict = {state, author, at, sha}
 *   state: "no-block" | "blocks" | "unclear" | "stale" (only verdicts for another head or older than it)
 *          | "untrusted" (only verdicts by untrusted authors) | "none"
 */
export function reviewVerdict({ comments = [], reviews = [], headSha, headCommittedAt = null }) {
  const head = String(headSha ?? "").toLowerCase();
  const headAt = headCommittedAt ? Date.parse(headCommittedAt) : null;
  const trusted = (c) => TRUSTED_ASSOCIATIONS.includes(c.author_association);
  const pick = (kind) => {
    const all = comments.filter((c) => kind(c.body));
    if (!all.length) return { state: "none" };
    const byTrusted = all.filter(trusted);
    if (!byTrusted.length) return { state: "untrusted" };
    const current = byTrusted
      .filter((c) => FULL_SHA.test(head) && reviewedSha(c.body) === head)
      .filter((c) => headAt === null || Date.parse(c.created_at) >= headAt)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    if (!current.length) return { state: "stale" };
    const c = current[current.length - 1];
    return { state: verdictOf(c.body), author: c.user?.login ?? null, at: c.created_at, sha: head };
  };
  const review = pick(isCodeReview);
  // A formal GitHub review on the current head by a trusted author is also a verdict; a request for
  // changes always blocks, whatever a comment says.
  const formal = reviews
    .filter((r) => TRUSTED_ASSOCIATIONS.includes(r.author_association) && String(r.commit_id).toLowerCase() === head)
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at));
  const lastFormal = formal.filter((r) => r.state === "APPROVED" || r.state === "CHANGES_REQUESTED").pop();
  let finalReview = review;
  if (lastFormal?.state === "CHANGES_REQUESTED") {
    finalReview = { state: "blocks", author: lastFormal.user?.login ?? null, at: lastFormal.submitted_at, sha: head };
  } else if (lastFormal?.state === "APPROVED" && review.state !== "blocks" && review.state !== "no-block") {
    finalReview = { state: "no-block", author: lastFormal.user?.login ?? null, at: lastFormal.submitted_at, sha: head };
  }
  return { review: finalReview, security: pick(isSecurityReview) };
}

// ------------------------------------------------------------------ PR classification

export const isRedPr = (p) =>
  (p.labels ?? []).includes("needs-human-gate") || /migration|\brls\b|\bRED\b/i.test(p.title ?? "");

/**
 * The first concrete blocker of an open PR, in Lithuanian. "kandidatas jungti" is the strongest
 * statement the report makes: the coordinator re-checks CI, head and verdicts before any merge.
 */
export function prBlocker(p) {
  if (p.incomplete) return "duomenys nepilni (API klaida) — būsena nežinoma";
  const v = { review: p.review ?? { state: "none" }, security: p.security ?? { state: "none" } };
  const red = isRedPr(p);
  if (p.mergeableState === "dirty") return "konfliktas su main (reikia atnaujinti šaką)";
  if (p.ci.state === "failure") return `CI nepraėjo: ${p.ci.failed.join(", ")}`;
  if (p.ci.state === "pending") return `CI nebaigtas: ${p.ci.pending.join(", ")}`;
  if (p.ci.state === "missing") return `trūksta privalomų patikrų: ${p.ci.missing.join(", ") || "jokia patikra nepaleista"}`;
  if (p.ci.state === "unknown") return "CI būsena nežinoma (API klaida)";
  if (v.review.state === "blocks") return "R peržiūra: blokuoja";
  if (red && v.security.state === "blocks") return "R2 saugumo peržiūra: blokuoja";
  if (v.review.state === "stale") return "R peržiūra ne dabartinei versijai (reikia naujos)";
  if (v.review.state === "untrusted") return "peržiūra tik nepatikimo autoriaus (botas / išorinis)";
  if (v.review.state === "unclear") return "peržiūros išvada neaiški";
  if (v.review.state === "none") return "laukia peržiūros";
  if (red && v.security.state !== "no-block") return "RED: laukia R2 saugumo peržiūros dabartinei versijai";
  if (p.mergeableState === "behind") return "atsilieka nuo main (atnaujinti)";
  if (p.mergeableState === "blocked" || p.mergeableState === "unknown" || p.mergeableState == null)
    return "GitHub sujungiamumas nepatvirtintas";
  if (p.mergeableState !== "clean" && p.mergeableState !== "has_hooks" && p.mergeableState !== "unstable")
    return `sujungiamumas: ${p.mergeableState}`;
  return p.draft ? "kandidatas jungti (juodraštis; prieš jungimą tikrinama iš naujo)" : "kandidatas jungti (prieš jungimą tikrinama iš naujo)";
}

// ------------------------------------------------------------------ completeness

/** COMPLETE only when no request failed and nothing was truncated; otherwise PARTIAL. */
export function completeness({ errors = [], registerProblems = [] }) {
  return errors.length || registerProblems.length ? "PARTIAL" : "COMPLETE";
}

// ------------------------------------------------------------------ GitHub request layer

/**
 * A GitHub REST client over an injected transport, with timeout, retry, rate-limit waits, explicit
 * pagination and a per-request error log. The transport is `(path) => Promise<{status, headers, body}>`
 * (it must not throw for HTTP errors; a thrown error means a network failure or timeout).
 */
export function createGithubClient({ transport, sleep, maxAttempts = 4, baseDelayMs = 2000, maxWaitMs = 120_000, now = () => Date.now() }) {
  const errors = [];
  let requests = 0;

  async function get(path) {
    let lastMessage = "";
    let lastStatus = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      requests++;
      let res;
      try {
        res = await transport(path);
      } catch (e) {
        lastMessage = String(e?.message ?? e).slice(0, 200);
        lastStatus = "network";
        if (attempt < maxAttempts) await sleep(baseDelayMs * 2 ** (attempt - 1));
        continue;
      }
      const { status, headers = {}, body } = res;
      const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
      if (status >= 200 && status < 300) {
        // Pace ourselves before the primary limit runs out.
        const remaining = Number(h["x-ratelimit-remaining"]);
        const reset = Number(h["x-ratelimit-reset"]);
        if (Number.isFinite(remaining) && remaining < 25 && Number.isFinite(reset)) {
          const wait = Math.max(0, reset * 1000 - now());
          if (wait > 0) await sleep(Math.min(wait, maxWaitMs));
        }
        return { ok: true, body };
      }
      lastStatus = status;
      lastMessage = typeof body === "object" && body?.message ? String(body.message).slice(0, 200) : `HTTP ${status}`;
      const rateLimited =
        status === 429 ||
        (status === 403 && (h["x-ratelimit-remaining"] === "0" || /rate limit/i.test(lastMessage)));
      const retryable = rateLimited || status >= 500;
      if (!retryable || attempt === maxAttempts) break;
      let wait = baseDelayMs * 2 ** (attempt - 1);
      if (rateLimited) {
        const retryAfter = Number(h["retry-after"]);
        const reset = Number(h["x-ratelimit-reset"]);
        if (Number.isFinite(retryAfter)) wait = retryAfter * 1000;
        else if (Number.isFinite(reset)) wait = Math.max(wait, reset * 1000 - now());
        if (wait > maxWaitMs) break; // do not stall the report for a long reset
      }
      await sleep(wait);
    }
    errors.push({ path, status: lastStatus, attempts: maxAttempts, message: lastMessage });
    return { ok: false };
  }

  /** Array endpoints paged with ?page=N until a short page; truncated reads are errors. */
  async function getAll(path, { perPage = 100, maxPages = 30 } = {}) {
    const items = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await get(`${path}${sep}per_page=${perPage}&page=${page}`);
      if (!r.ok) return { ok: false, items };
      if (!Array.isArray(r.body)) {
        errors.push({ path, status: "shape", attempts: 1, message: "expected an array" });
        return { ok: false, items };
      }
      items.push(...r.body);
      if (r.body.length < perPage) return { ok: true, items };
    }
    errors.push({ path, status: "truncated", attempts: 1, message: `more than ${maxPages} pages` });
    return { ok: false, items };
  }

  /** Object endpoints with {total_count, <key>: [...]} (check runs, search, workflow runs). */
  async function getCounted(path, key, { perPage = 100, maxPages = 10, limit = Infinity } = {}) {
    const items = [];
    let total = null;
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await get(`${path}${sep}per_page=${perPage}&page=${page}`);
      if (!r.ok) return { ok: false, items, total };
      const chunk = r.body?.[key];
      if (!Array.isArray(chunk)) {
        errors.push({ path, status: "shape", attempts: 1, message: `expected ${key}[]` });
        return { ok: false, items, total };
      }
      total = Number(r.body.total_count ?? chunk.length);
      items.push(...chunk);
      if (items.length >= Math.min(total, limit) || chunk.length < perPage) return { ok: true, items, total };
    }
    if (items.length < Math.min(total ?? 0, limit)) {
      errors.push({ path, status: "truncated", attempts: 1, message: `${items.length} of ${total}` });
      return { ok: false, items, total };
    }
    return { ok: true, items, total };
  }

  return { get, getAll, getCounted, errors, stats: () => ({ requests }) };
}

/** Parse `gh api -i` output (status line, headers, blank line, JSON body). */
export function parseGhInclude(stdout) {
  const text = String(stdout ?? "");
  const split = text.search(/\r?\n\r?\n/);
  const head = split >= 0 ? text.slice(0, split) : text;
  const rawBody = split >= 0 ? text.slice(split).trim() : "";
  const lines = head.split(/\r?\n/);
  const status = Number((lines[0].match(/^HTTP\/[\d.]+\s+(\d{3})/) ?? [])[1]);
  const headers = {};
  for (const l of lines.slice(1)) {
    const i = l.indexOf(":");
    if (i > 0) headers[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  let body = null;
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { message: rawBody.slice(0, 200) };
    }
  }
  return { status: Number.isFinite(status) ? status : 0, headers, body };
}

// ------------------------------------------------------------------ collection

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

/**
 * Collect everything the report needs. Never throws for an API failure: each failure is in
 * `errors`, the affected PR is `incomplete`, and the whole result is PARTIAL.
 */
export async function collect({ client, repo, sinceIso, fetchHealth, sleep, concurrency = 4, mergeableRetryMs = 3000 }) {
  const R = `repos/${repo}`;
  const open = await client.getAll(`${R}/pulls?state=open`);
  const prs = await pool(open.items, concurrency, async (p) => {
    const head = p.head.sha;
    let detail = await client.get(`${R}/pulls/${p.number}`);
    if (detail.ok && detail.body?.mergeable_state === "unknown") {
      await sleep(mergeableRetryMs); // GitHub computes mergeability lazily
      detail = await client.get(`${R}/pulls/${p.number}`);
    }
    const [commit, runs, statuses, comments, reviews] = await Promise.all([
      client.get(`${R}/commits/${head}`),
      client.getCounted(`${R}/commits/${head}/check-runs`, "check_runs"),
      client.getAll(`${R}/commits/${head}/statuses`),
      client.getAll(`${R}/issues/${p.number}/comments`),
      client.getAll(`${R}/pulls/${p.number}/reviews`),
    ]);
    const incomplete = !(detail.ok && commit.ok && runs.ok && statuses.ok && comments.ok && reviews.ok);
    const headCommittedAt = commit.ok ? commit.body?.commit?.committer?.date ?? null : null;
    const ci = ciVerdict({ checkRuns: runs.items, statuses: statuses.items, complete: runs.ok && statuses.ok });
    const verdicts = comments.ok && reviews.ok
      ? reviewVerdict({ comments: comments.items, reviews: reviews.items, headSha: head, headCommittedAt })
      : { review: { state: "unknown" }, security: { state: "unknown" } };
    return {
      number: p.number,
      title: p.title,
      branch: p.head.ref,
      head,
      headCommittedAt,
      draft: p.draft,
      labels: (p.labels ?? []).map((l) => l.name),
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      mergeableState: detail.ok ? detail.body?.mergeable_state ?? null : null,
      ci,
      review: verdicts.review,
      security: verdicts.security,
      incomplete,
    };
  });

  const merged = await client.getCounted(
    `search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:merged merged:>=${sinceIso}`)}`,
    "items",
  );
  // PRs closed (merged or not) in the last 30 days: lets the report tell a PR that was merged long ago
  // from an issue number when the narrative still calls it blocking. Only numbers are kept.
  const closedSince = new Date(Date.parse(sinceIso) - 30 * 86400_000).toISOString().slice(0, 10);
  const closed = await client.getCounted(
    `search/issues?q=${encodeURIComponent(`repo:${repo} is:pr is:closed closed:>=${closedSince}`)}`,
    "items",
  );
  const deploys = await client.getCounted(`${R}/actions/workflows/deploy-vps.yml/runs?created=>=${sinceIso}`, "workflow_runs");
  const walks = await client.getCounted(`${R}/actions/workflows/prod-qa-walk.yml/runs?created=>=${sinceIso}`, "workflow_runs");

  let health;
  try {
    health = await fetchHealth();
  } catch (e) {
    health = { ok: false, error: String(e?.message ?? e).slice(0, 120) };
    client.errors.push({ path: "production /api/health", status: "network", attempts: 1, message: health.error });
  }

  const errors = [...client.errors];
  return {
    schema: 2,
    sinceIso,
    completeness: completeness({ errors }),
    errors,
    requests: client.stats().requests,
    requiredChecks: { names: [...POLICY_REQUIRED_CHECKS], source: "repository policy (CLAUDE.md); branch protection is not readable with this token" },
    openPrsComplete: open.ok,
    health,
    deploys: deploys.items
      .filter((r) => r.conclusion !== "skipped")
      .map((r) => ({ sha: r.head_sha.slice(0, 8), conclusion: r.conclusion, status: r.status, at: r.updated_at, url: r.html_url })),
    walks: walks.items.map((r) => ({ id: r.id, title: r.display_title, sha: r.head_sha.slice(0, 8), conclusion: r.conclusion, status: r.status, at: r.updated_at })),
    merged: merged.items.map((i) => ({ number: i.number, title: i.title, closedAt: i.closed_at })),
    closedPrNumbers: closed.items.map((i) => i.number),
    prs,
  };
}

// ---------------------------------------------------------------- report synchronisation (owner order 2026-11-15)
//
// The 12-hour report showed results that were already out of date: phone walks that had passed were
// reported as "not run", a merged PR was listed as blocking, and "what changed" compared a report with
// itself. The rules below keep ONE latest confirmed state, never let an older fact overwrite a newer
// one, and flag a contradiction instead of guessing.

/** Screens a production walk can run on (.github/workflows/prod-qa-walk.yml input `device`). */
export const WALK_DEVICES = Object.freeze(["desktop", "phone", "phone-375"]);

/**
 * "prod-qa-walk <spec> [<device>]" -> { spec, device }. Automatic walks (push, schedule) are always
 * desktop (the workflow says so). A dispatch title from before the device was added to the run name
 * has no device: `device` is then null (unknown), never guessed.
 */
export function parseWalkTitle(title) {
  const parts = String(title ?? "").trim().split(/\s+/);
  if (parts[0] !== "prod-qa-walk" || !parts[1]) return { spec: null, device: null };
  const spec = parts[1];
  if (spec === "push" || spec === "schedule") return { spec, device: "desktop" };
  const device = parts[2] && WALK_DEVICES.includes(parts[2]) ? parts[2] : null;
  return { spec, device };
}

const walkKey = (spec, device) => `${spec}|${device}`;

/**
 * Merge this period's walk runs into the confirmed-results ledger. Per (walk, screen) only the NEWEST
 * finished run is kept; an older run never replaces a newer entry. A run whose screen is unknown is
 * not merged (it is returned in `unknownDevice`). The same run id recorded with a different result is
 * a contradiction (returned in `conflicts`) and the ledger entry is left unchanged.
 */
export function mergeWalkLedger(ledger, walks) {
  const entries = { ...(ledger?.walks ?? {}) };
  const unknownDevice = [];
  const conflicts = [];
  const knownRuns = new Set(Object.values(entries).map((e) => Number(e.run)));
  for (const w of walks ?? []) {
    if (w.status && w.status !== "completed") continue;
    if (!w.conclusion || w.conclusion === "cancelled" || w.conclusion === "skipped") continue;
    const { spec, device } = parseWalkTitle(w.title);
    if (!spec || spec === "push" || spec === "schedule") continue;
    if (!device) {
      // Already recorded with its screen (e.g. seeded from the walk report): nothing is unknown.
      if (!knownRuns.has(Number(w.id))) unknownDevice.push(w);
      continue;
    }
    const key = walkKey(spec, device);
    const cur = entries[key];
    if (cur && Number(cur.run) === Number(w.id)) {
      if (cur.result !== w.conclusion) conflicts.push({ key, run: w.id, ledger: cur.result, github: w.conclusion });
      continue;
    }
    if (cur && Date.parse(cur.at) >= Date.parse(w.at)) continue;
    entries[key] = { spec, device, run: w.id, result: w.conclusion, build: w.sha, at: w.at };
  }
  return { ledger: { schema: 1, walks: entries }, unknownDevice, conflicts };
}

/**
 * Never overwrite a report with an older one: the data being rendered must be newer than the report
 * already on file. Returns null when writing is safe, or the reason it is not.
 */
export function staleOverwriteReason(existingGeneratedAt, newFetchedAt) {
  if (!existingGeneratedAt) return null;
  const a = Date.parse(existingGeneratedAt);
  const b = Date.parse(newFetchedAt);
  if (!Number.isFinite(b)) return "the new data has no fetch time";
  if (Number.isFinite(a) && a > b)
    return `the report on file was generated at ${existingGeneratedAt}, after this data was fetched (${newFetchedAt})`;
  return null;
}

const BLOCKING_WORDS = /\b(blokuoja|blokuot\w*|laukia|reikia|užblokuot\w*|stabdo|blocks?|blocked|waiting)\b/i;
const NOT_RUN_WORDS = /(nepaleist\w*|neužfiksuot\w*|paleidimo nėra|nebuvo atlikt\w*|not run)/i;

/**
 * Contradictions between the coordinator's narrative and the facts the report holds. Each finding is a
 * line to show and check, never an automatic rewrite of the narrative.
 *  - a PR named as blocking / waiting that is closed (merged or not) and no longer open;
 *  - phone walks called "not run" while the ledger holds a finished phone walk.
 */
export function narrativeDiscrepancies(text, { openPrNumbers, closedPrNumbers, ledger }) {
  const open = new Set(openPrNumbers ?? []);
  // Only a number known to be a CLOSED PR is flagged: an issue number (e.g. #3354) is never a PR.
  const closed = new Set(closedPrNumbers ?? []);
  const out = [];
  const lines = String(text ?? "").split("\n");
  for (const line of lines) {
    if (!BLOCKING_WORDS.test(line)) continue;
    for (const m of line.matchAll(/#(\d{3,5})\b/g)) {
      const n = Number(m[1]);
      if (!open.has(n) && closed.has(n)) out.push(`#${n} tekste minimas kaip blokuojantis ar laukiantis, bet jis nebėra atviras PR (sujungtas arba uždarytas).`);
    }
  }
  const phone = Object.values(ledger?.walks ?? {}).filter((e) => e.device !== "desktop");
  if (phone.length) {
    for (const line of lines) {
      if (/telefon|phone/i.test(line) && NOT_RUN_WORDS.test(line)) {
        const ok = phone.filter((e) => e.result === "success").length;
        out.push(
          `Tekste teigiama, kad telefono bandymų nėra, bet patvirtintų rezultatų sąraše yra ${phone.length} telefono bandymų (${ok} sėkmingi): „${line.trim().slice(0, 120)}“.`,
        );
        break;
      }
    }
  }
  return [...new Set(out)];
}

/**
 * Text that must not reach the public report (AGENTS.md: no personal or partner contact data, money
 * amounts or production volumes). The coordinator's narrative is checked before anything is written.
 */
export function privacyFindings(text) {
  const t = String(text ?? "");
  const out = [];
  for (const m of t.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (/@(example\.invalid|e2e-proof\.local|users\.noreply\.github\.com|anthropic\.com)$/i.test(m[0])) continue;
    out.push(`e-mail address: ${m[0].replace(/^[^@]+/, "***")}`);
  }
  for (const m of t.matchAll(/(?:€\s?\d[\d\s.,]*|\b\d[\d\s.,]*\s?(?:€|EUR|eur)\b)/g)) out.push(`money amount: ${m[0].trim()}`);
  for (const m of t.matchAll(/\+\d[\d\s-]{7,}\d/g)) out.push(`phone number: ${m[0].slice(0, 4)}…`);
  return out;
}
