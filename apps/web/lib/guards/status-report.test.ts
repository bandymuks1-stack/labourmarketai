import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ciVerdict,
  collect,
  completeness,
  createGithubClient,
  mergeWalkLedger,
  narrativeDiscrepancies,
  migrationClaimDiscrepancies,
  finalCompleteness,
  parseParityLog,
  parseGhInclude,
  parseWalkTitle,
  prBlocker,
  privacyFindings,
  reviewVerdict,
  staleOverwriteReason,
  type CheckRun,
  type IssueComment,
  type TransportResponse,
  // The report scripts import THIS module — what these tests prove is what the 12-hour report runs.
} from "../../../../.github/scripts/status-report-lib.mjs";

/**
 * 12-HOUR STATUS REPORT — data-collection reliability (owner order 2026-11-14, P0).
 *
 * The owner's rules: a missing, stale or unfinished check is never PASS; a review counts only for the
 * full current head SHA, by a trusted author, written after that head; every API failure is logged and
 * makes the report PARTIAL, never SUCCESS; paging, timeouts, rate limits and retries are bounded.
 */

const REPO = resolve(__dirname, "..", "..", "..", "..");
const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);
const noSleep = async () => {};

const run = (name: string, conclusion: string | null, status = "completed", started = "2026-11-14T10:00:00Z", id = 1): CheckRun => ({
  id,
  name,
  status,
  conclusion,
  started_at: started,
});
const greenRequired = [run("quality", "success"), run("migration-safety", "success", "completed", "2026-11-14T10:00:00Z", 2)];

describe("CI verdict — never a false PASS", () => {
  it("passes only when every check finished green and every required check is present", () => {
    expect(ciVerdict({ checkRuns: greenRequired, statuses: [] }).state).toBe("success");
  });

  it("a required check that never ran is MISSING, not PASS, even when everything else is green", () => {
    const v = ciVerdict({ checkRuns: [run("quality", "success"), run("e2e-smoke", "success", "completed", undefined, 3)], statuses: [] });
    expect(v.state).toBe("missing");
    expect(v.missing).toEqual(["migration-safety"]);
  });

  it("no checks at all is MISSING", () => {
    expect(ciVerdict({ checkRuns: [], statuses: [] }).state).toBe("missing");
  });

  it("a queued or running check is PENDING, never PASS", () => {
    const v = ciVerdict({ checkRuns: [...greenRequired, run("signup-isolated", null, "in_progress", undefined, 9)], statuses: [] });
    expect(v.state).toBe("pending");
    expect(v.pending).toContain("signup-isolated");
  });

  it("an unknown conclusion is not a pass", () => {
    expect(ciVerdict({ checkRuns: [...greenRequired, run("odd", "weird", "completed", undefined, 4)], statuses: [] }).state).toBe("pending");
  });

  it("any failed, cancelled or timed-out check fails the PR", () => {
    for (const c of ["failure", "cancelled", "timed_out", "action_required", "startup_failure"]) {
      expect(ciVerdict({ checkRuns: [...greenRequired, run("x", c, "completed", undefined, 5)], statuses: [] }).state).toBe("failure");
    }
  });

  it("the LATEST attempt of a check wins: a re-run success replaces an old failure, a new failure replaces an old success", () => {
    const rerunGreen = [...greenRequired, run("signup-isolated", "failure", "completed", "2026-11-14T10:00:00Z", 10), run("signup-isolated", "success", "completed", "2026-11-14T11:00:00Z", 11)];
    expect(ciVerdict({ checkRuns: rerunGreen, statuses: [] }).state).toBe("success");
    const rerunRed = [...greenRequired, run("signup-isolated", "success", "completed", "2026-11-14T10:00:00Z", 10), run("signup-isolated", "failure", "completed", "2026-11-14T11:00:00Z", 11)];
    expect(ciVerdict({ checkRuns: rerunRed, statuses: [] }).state).toBe("failure");
  });

  it("a failing legacy commit status fails the PR; a pending one keeps it pending", () => {
    expect(ciVerdict({ checkRuns: greenRequired, statuses: [{ context: "vercel", state: "error", updated_at: "2026-11-14T10:00:00Z" }] }).state).toBe("failure");
    expect(ciVerdict({ checkRuns: greenRequired, statuses: [{ context: "vercel", state: "pending", updated_at: "2026-11-14T10:00:00Z" }] }).state).toBe("pending");
  });

  it("an incomplete or failed read is UNKNOWN, never PASS", () => {
    expect(ciVerdict({ checkRuns: greenRequired, statuses: [], complete: false }).state).toBe("unknown");
    expect(ciVerdict({ checkRuns: null, statuses: [] }).state).toBe("unknown");
  });

  it("the re-run tooling check is not a verdict on the code", () => {
    expect(ciVerdict({ checkRuns: [...greenRequired, run("ci-rerun-on-label", "failure", "completed", undefined, 7)], statuses: [] }).state).toBe("success");
  });
});

const comment = (body: string, at = "2026-11-14T12:00:00Z", association = "OWNER", login = "lane-r"): IssueComment => ({
  body,
  created_at: at,
  author_association: association,
  user: { login },
});
const rOk = (sha: string) => `Reviewed commit: \`${sha}\`\nBlocks merge: no`;

describe("Review verdicts — full current SHA, trusted author, written after the head", () => {
  it("a trusted no-block verdict on the full current SHA counts, with author and time", () => {
    const v = reviewVerdict({ comments: [comment(rOk(HEAD))], headSha: HEAD, headCommittedAt: "2026-11-14T11:00:00Z" });
    expect(v.review).toMatchObject({ state: "no-block", author: "lane-r", at: "2026-11-14T12:00:00Z", sha: HEAD });
  });

  it("a verdict for another head is STALE", () => {
    expect(reviewVerdict({ comments: [comment(rOk(OTHER))], headSha: HEAD }).review.state).toBe("stale");
  });

  it("a short SHA is not enough, even if it is a prefix of the head", () => {
    expect(reviewVerdict({ comments: [comment(rOk(HEAD.slice(0, 10)))], headSha: HEAD }).review.state).toBe("stale");
  });

  it("the head SHA mentioned elsewhere in the text does not count; only the Reviewed commit field does", () => {
    const body = `Reviewed commit: ${OTHER}\nBlocks merge: no\nNote: the next head will be ${HEAD}`;
    expect(reviewVerdict({ comments: [comment(body)], headSha: HEAD }).review.state).toBe("stale");
  });

  it("a verdict written before the head commit is STALE (a force-push back to an old SHA cannot reuse it)", () => {
    const v = reviewVerdict({ comments: [comment(rOk(HEAD), "2026-11-14T10:00:00Z")], headSha: HEAD, headCommittedAt: "2026-11-14T11:00:00Z" });
    expect(v.review.state).toBe("stale");
  });

  it("bots and outsiders are UNTRUSTED, whatever they write", () => {
    expect(reviewVerdict({ comments: [comment(rOk(HEAD), undefined, "NONE", "some-bot[bot]")], headSha: HEAD }).review.state).toBe("untrusted");
    expect(reviewVerdict({ comments: [comment(rOk(HEAD), undefined, "CONTRIBUTOR")], headSha: HEAD }).review.state).toBe("untrusted");
  });

  it("the latest current verdict wins: a later 'yes' blocks after an earlier 'no'", () => {
    const later = `Reviewed commit: ${HEAD}\nBlocks merge: yes — only until signup-isolated is green`;
    const v = reviewVerdict({ comments: [comment(rOk(HEAD), "2026-11-14T12:00:00Z"), comment(later, "2026-11-14T13:00:00Z")], headSha: HEAD });
    expect(v.review.state).toBe("blocks");
  });

  it("a verdict without a clear Blocks line is UNCLEAR, not a pass", () => {
    expect(reviewVerdict({ comments: [comment(`Reviewed commit: ${HEAD}\nLooks fine overall.`)], headSha: HEAD }).review.state).toBe("unclear");
  });

  it("a formal request for changes on the head blocks even after a no-block comment", () => {
    const v = reviewVerdict({
      comments: [comment(rOk(HEAD))],
      reviews: [{ state: "CHANGES_REQUESTED", commit_id: HEAD, submitted_at: "2026-11-14T13:00:00Z", author_association: "OWNER", user: { login: "x" } }],
      headSha: HEAD,
    });
    expect(v.review.state).toBe("blocks");
  });

  it("the security review is separate: an R verdict never stands in for R2", () => {
    const v = reviewVerdict({ comments: [comment(rOk(HEAD))], headSha: HEAD });
    expect(v.security.state).toBe("none");
    const r2 = reviewVerdict({ comments: [comment(`## Independent security review\n**Reviewed commit:** \`${HEAD}\`\n**Result: NO BLOCKING FINDINGS**`)], headSha: HEAD });
    expect(r2.security.state).toBe("no-block");
    expect(r2.review.state).toBe("none");
  });
});

describe("PR blocker — the report never calls a PR mergeable on text alone", () => {
  const ok = { state: "no-block" as const, sha: HEAD };
  const green = { state: "success" as const, failed: [], pending: [], missing: [] };
  it("only green CI + current verdicts + clean merge make a merge CANDIDATE (re-checked before merging)", () => {
    expect(prBlocker({ ci: green, review: ok, mergeableState: "clean" })).toMatch(/^kandidatas jungti/);
  });
  it("missing or pending CI is never a candidate", () => {
    expect(prBlocker({ ci: { ...green, state: "missing", missing: ["quality"] }, review: ok, mergeableState: "clean" })).toMatch(/trūksta privalomų/);
    expect(prBlocker({ ci: { ...green, state: "pending", pending: ["quality"] }, review: ok, mergeableState: "clean" })).toMatch(/nebaigtas/);
  });
  it("a RED PR needs a current R2 verdict too", () => {
    expect(prBlocker({ title: "feat: x (migration)", ci: green, review: ok, mergeableState: "clean" })).toMatch(/R2/);
    expect(prBlocker({ title: "feat: x (migration)", ci: green, review: ok, security: ok, mergeableState: "clean" })).toMatch(/^kandidatas/);
  });
  it("incomplete data is UNKNOWN, never a candidate", () => {
    expect(prBlocker({ incomplete: true, ci: green, review: ok, mergeableState: "clean" })).toMatch(/nežinoma/);
  });
  it("unconfirmed mergeability is not a candidate", () => {
    expect(prBlocker({ ci: green, review: ok, mergeableState: "unknown" })).toMatch(/nepatvirtintas/);
  });
});

/** A scripted transport: each path maps to a list of responses, consumed in order (the last repeats). */
function scripted(routes: Record<string, Array<TransportResponse | Error>>) {
  const calls: string[] = [];
  const transport = async (path: string): Promise<TransportResponse> => {
    calls.push(path);
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) return { status: 404, headers: {}, body: { message: "Not Found" } };
    const list = routes[key];
    const next = list.length > 1 ? list.shift()! : list[0];
    if (next instanceof Error) throw next;
    return next;
  };
  return { transport, calls };
}
const ok200 = (body: unknown, headers: Record<string, string> = {}): TransportResponse => ({ status: 200, headers, body });

describe("GitHub client — retries, rate limits, timeouts, paging, error log", () => {
  it("retries a 502 and a network timeout, then succeeds without logging an error", async () => {
    const { transport, calls } = scripted({ x: [{ status: 502, body: { message: "Bad Gateway" } }, new Error("timeout after 30000 ms"), ok200({ a: 1 })] });
    const c = createGithubClient({ transport, sleep: noSleep });
    expect((await c.get("x")).ok).toBe(true);
    expect(calls).toHaveLength(3);
    expect(c.errors).toEqual([]);
  });

  it("does not retry a plain 403/404 and logs it with path and status", async () => {
    const { transport, calls } = scripted({ x: [{ status: 403, body: { message: "Resource not accessible by integration" } }] });
    const c = createGithubClient({ transport, sleep: noSleep });
    expect((await c.get("x")).ok).toBe(false);
    expect(calls).toHaveLength(1);
    expect(c.errors[0]).toMatchObject({ path: "x", status: 403 });
  });

  it("waits out a rate limit (Retry-After) and retries", async () => {
    const waits: number[] = [];
    const { transport } = scripted({ x: [{ status: 429, headers: { "Retry-After": "7" }, body: { message: "secondary rate limit" } }, ok200([])] });
    const c = createGithubClient({ transport, sleep: async (ms) => void waits.push(ms) });
    expect((await c.get("x")).ok).toBe(true);
    expect(waits).toEqual([7000]);
  });

  it("gives up on a rate-limit reset that is too far away and logs it instead of stalling", async () => {
    const { transport } = scripted({ x: [{ status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(2_000_000_000) }, body: { message: "API rate limit exceeded" } }] });
    const c = createGithubClient({ transport, sleep: noSleep, now: () => 1_000_000_000_000 });
    expect((await c.get("x")).ok).toBe(false);
    expect(c.errors[0].status).toBe(403);
  });

  it("a request that keeps failing is logged after the bounded number of attempts", async () => {
    const { transport, calls } = scripted({ x: [new Error("ECONNRESET")] });
    const c = createGithubClient({ transport, sleep: noSleep, maxAttempts: 4 });
    expect((await c.get("x")).ok).toBe(false);
    expect(calls).toHaveLength(4);
    expect(c.errors[0]).toMatchObject({ status: "network", attempts: 4 });
  });

  it("pages until a short page, and records a truncated read as an error", async () => {
    const full = Array.from({ length: 2 }, (_, i) => i);
    const { transport, calls } = scripted({ "list?per_page=2&page=1": [ok200(full)], "list?per_page=2&page=2": [ok200([9])] });
    const c = createGithubClient({ transport, sleep: noSleep });
    const r = await c.getAll("list", { perPage: 2 });
    expect(r).toMatchObject({ ok: true, items: [0, 1, 9] });
    expect(calls).toHaveLength(2);

    const endless = scripted({ list: [ok200(full)] });
    const c2 = createGithubClient({ transport: endless.transport, sleep: noSleep });
    expect((await c2.getAll("list", { perPage: 2, maxPages: 3 })).ok).toBe(false);
    expect(c2.errors[0].status).toBe("truncated");
  });

  it("counted endpoints page until total_count", async () => {
    const { transport } = scripted({
      "runs?per_page=2&page=1": [ok200({ total_count: 3, check_runs: [1, 2] })],
      "runs?per_page=2&page=2": [ok200({ total_count: 3, check_runs: [3] })],
    });
    const c = createGithubClient({ transport, sleep: noSleep });
    expect(await c.getCounted("runs", "check_runs", { perPage: 2 })).toMatchObject({ ok: true, items: [1, 2, 3], total: 3 });
  });

  it("parses gh api -i output, including an error status", () => {
    expect(parseGhInclude('HTTP/2.0 200 OK\r\nX-Ratelimit-Remaining: 42\r\n\r\n{"a":1}')).toEqual({ status: 200, headers: { "x-ratelimit-remaining": "42" }, body: { a: 1 } });
    expect(parseGhInclude('HTTP/2.0 403 Forbidden\nContent-Type: application/json\n\n{"message":"no"}').status).toBe(403);
    expect(parseGhInclude("").status).toBe(0);
  });
});

describe("Collection — one failed request makes the run PARTIAL, never SUCCESS", () => {
  const repo = "o/r";
  const R = `repos/${repo}`;
  const pr = { number: 7, title: "fix: x", head: { sha: HEAD, ref: "fix/x" }, draft: false, labels: [], created_at: "", updated_at: "" };
  const base = (): Record<string, Array<TransportResponse | Error>> => ({
    [`${R}/pulls?state=open`]: [ok200([pr])],
    [`${R}/pulls/7/reviews`]: [ok200([])],
    [`${R}/pulls/7`]: [ok200({ mergeable_state: "clean" })],
    [`${R}/commits/${HEAD}/check-runs`]: [ok200({ total_count: 2, check_runs: greenRequired })],
    [`${R}/commits/${HEAD}/statuses`]: [ok200([])],
    [`${R}/commits/${HEAD}`]: [ok200({ commit: { committer: { date: "2026-11-14T11:00:00Z" } } })],
    [`${R}/issues/7/comments`]: [ok200([comment(rOk(HEAD))])],
    "search/issues": [ok200({ total_count: 0, items: [] })],
    [`${R}/actions/workflows/deploy-vps.yml/runs`]: [ok200({ total_count: 0, workflow_runs: [] })],
    [`${R}/actions/workflows/prod-qa-walk.yml/runs`]: [ok200({ total_count: 0, workflow_runs: [] })],
  });
  const health = async () => ({ ok: true, build: "abc" });

  it("everything read: COMPLETE, and the PR is a merge candidate", async () => {
    const client = createGithubClient({ transport: scripted(base()).transport, sleep: noSleep });
    const d = await collect({ client, repo, sinceIso: "2026-11-14T00:00:00Z", fetchHealth: health, sleep: noSleep });
    expect(d.completeness).toBe("COMPLETE");
    expect(d.prs[0].incomplete).toBe(false);
    expect(prBlocker(d.prs[0])).toMatch(/^kandidatas/);
  });

  it("a failed check-runs read: PARTIAL, the PR is incomplete with CI UNKNOWN, and the error names the path", async () => {
    const routes = base();
    routes[`${R}/commits/${HEAD}/check-runs`] = [{ status: 500, body: { message: "boom" } }];
    const client = createGithubClient({ transport: scripted(routes).transport, sleep: noSleep });
    const d = await collect({ client, repo, sinceIso: "2026-11-14T00:00:00Z", fetchHealth: health, sleep: noSleep });
    expect(d.completeness).toBe("PARTIAL");
    expect(d.prs[0].incomplete).toBe(true);
    expect(d.prs[0].ci.state).toBe("unknown");
    expect(prBlocker(d.prs[0])).not.toMatch(/^kandidatas/);
    expect(d.errors.some((e) => e.path.includes("check-runs") && e.status === 500)).toBe(true);
  });

  it("an unreachable production health check is logged and makes the run PARTIAL", async () => {
    const client = createGithubClient({ transport: scripted(base()).transport, sleep: noSleep });
    const d = await collect({ client, repo, sinceIso: "2026-11-14T00:00:00Z", fetchHealth: async () => { throw new Error("fetch failed"); }, sleep: noSleep });
    expect(d.completeness).toBe("PARTIAL");
    expect(d.errors.some((e) => e.path.includes("/api/health"))).toBe(true);
  });

  it("completeness is COMPLETE only with no errors and no register problems", () => {
    expect(completeness({ errors: [] })).toBe("COMPLETE");
    expect(completeness({ errors: [], registerProblems: ["x"] })).toBe("PARTIAL");
  });
});

describe("Rendered report — PARTIAL is shown, and the named register is the basis", () => {
  const dir = mkdtempSync(join(tmpdir(), "status-report-"));
  const render = (data: object) => {
    const dataPath = join(dir, `data-${Math.random()}.json`);
    const out = join(dir, `out-${Math.random()}.md`);
    writeFileSync(dataPath, JSON.stringify(data));
    const r = spawnSync(process.execPath, [join(REPO, ".github", "scripts", "status-report.mjs"), "--data", dataPath, "--out", out], { encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    return readFileSync(out, "utf8");
  };
  const data = (errors: object[]) => ({
    schema: 2,
    migrationParity: { applied: 1, files: 1, notApplied: [], passed: true, run: 1, headSha: "f461497e" },
    fetchedAt: "2026-11-14T21:00:00Z",
    sinceIso: "2026-11-14T09:00:00Z",
    completeness: errors.length ? "PARTIAL" : "COMPLETE",
    errors,
    requiredChecks: { names: ["quality", "migration-safety"], source: "policy" },
    health: { ok: true, build: "abc12345" },
    deploys: [],
    walks: [],
    merged: [],
    prs: [
      { number: 1, title: "fix: green", labels: [], draft: false, mergeableState: "clean", ci: { state: "missing", failed: [], pending: [], missing: ["quality"] }, review: { state: "no-block" }, security: { state: "none" }, incomplete: false },
    ],
  });

  it("a run with an API error is marked PARTIAL and lists the failed request", () => {
    const md = render(data([{ path: "repos/o/r/pulls/9/reviews", status: 502, attempts: 4, message: "Bad Gateway" }]));
    expect(md).toContain("**Ataskaitos būsena: PARTIAL**");
    expect(md).toContain("repos/o/r/pulls/9/reviews");
    expect(md).not.toContain("**Ataskaitos būsena: COMPLETE**");
  });

  it("fetch data without an error log is PARTIAL, not SUCCESS", () => {
    const d = data([]) as Record<string, unknown>;
    delete d.errors;
    expect(render(d)).toContain("**Ataskaitos būsena: PARTIAL**");
  });

  it("a clean run is COMPLETE, carries every register function by name, and never calls a missing-CI PR a candidate", () => {
    const md = render(data([]));
    expect(md).toContain("**Ataskaitos būsena: COMPLETE**");
    const a7 = md.slice(md.indexOf("## A7."));
    const rows = a7.split("\n").filter((l) => /^\| \d+\.\d+ \|/.test(l));
    expect(rows.length).toBeGreaterThanOrEqual(288);
    expect(md).toContain("trūksta privalomų patikrų: quality");
    expect(md).not.toMatch(/\[#1\][^\n]*kandidatas jungti/);
  });
});

describe("Report synchronisation — one latest confirmed state, never overwritten by older facts (owner order 2026-11-15)", () => {
  const walk = (id: number, title: string, conclusion: string, at: string) => ({ id, title, sha: "abcdef12", conclusion, status: "completed", at });

  it("reads the walk and screen from the run name; automatic walks are desktop; an old dispatch title has no screen", () => {
    expect(parseWalkTitle("prod-qa-walk agency-chain phone-375")).toEqual({ spec: "agency-chain", device: "phone-375" });
    expect(parseWalkTitle("prod-qa-walk company-chain desktop")).toEqual({ spec: "company-chain", device: "desktop" });
    expect(parseWalkTitle("prod-qa-walk push")).toEqual({ spec: "push", device: "desktop" });
    expect(parseWalkTitle("prod-qa-walk agency-chain")).toEqual({ spec: "agency-chain", device: null });
    expect(parseWalkTitle("something else")).toEqual({ spec: null, device: null });
  });

  it("keeps the newest run per walk and screen; an older run never replaces a newer one", () => {
    const ledger = { schema: 1, walks: { "agency-chain|phone-375": { spec: "agency-chain", device: "phone-375", run: 2, result: "success", build: "d225f58a", at: "2026-11-15T17:55:58Z" } } };
    const r = mergeWalkLedger(ledger, [walk(1, "prod-qa-walk agency-chain phone-375", "failure", "2026-11-15T14:32:00Z")]);
    expect(r.ledger.walks["agency-chain|phone-375"]).toMatchObject({ run: 2, result: "success" });
    const r2 = mergeWalkLedger(ledger, [walk(3, "prod-qa-walk agency-chain phone-375", "failure", "2026-11-16T08:00:00Z")]);
    expect(r2.ledger.walks["agency-chain|phone-375"]).toMatchObject({ run: 3, result: "failure" });
  });

  it("reads the tablet and wide-desktop screens, and never lets a dark-scheme run stand in for the light one", () => {
    expect(parseWalkTitle("prod-qa-walk ux-metrics tablet-768")).toEqual({ spec: "ux-metrics", device: "tablet-768" });
    expect(parseWalkTitle("prod-qa-walk ux-metrics desktop-1440 dark")).toEqual({ spec: "ux-metrics", device: "desktop-1440" });
    const ledger = { schema: 1, walks: { "ux-metrics|phone": { spec: "ux-metrics", device: "phone", run: 2, result: "success", build: "d", at: "2026-11-15T17:55:58Z" } } };
    const r = mergeWalkLedger(ledger, [walk(3, "prod-qa-walk ux-metrics phone dark", "failure", "2026-11-16T08:00:00Z")]);
    expect(r.ledger.walks["ux-metrics|phone"]).toMatchObject({ run: 2, result: "success" });
    expect(r.unknownDevice).toEqual([]);
  });

  it("does not guess a screen, skips unfinished or cancelled runs, and flags the same run with a different result", () => {
    const r = mergeWalkLedger({ schema: 1, walks: {} }, [
      walk(1, "prod-qa-walk agency-chain", "success", "2026-11-15T10:00:00Z"),
      { ...walk(2, "prod-qa-walk company-chain phone", "success", "2026-11-15T10:00:00Z"), status: "in_progress", conclusion: null },
      walk(3, "prod-qa-walk company-chain phone", "cancelled", "2026-11-15T10:00:00Z"),
    ]);
    expect(r.ledger.walks).toEqual({});
    expect(r.unknownDevice.map((w: { id: number }) => w.id)).toEqual([1]);
    const ledger = { schema: 1, walks: { "x|phone": { spec: "x", device: "phone", run: 9, result: "success", build: "a", at: "2026-11-15T10:00:00Z" } } };
    const c = mergeWalkLedger(ledger, [walk(9, "prod-qa-walk x phone", "failure", "2026-11-15T10:00:00Z")]);
    expect(c.conflicts).toHaveLength(1);
    // A run already recorded with its screen is not reported again as "screen unknown".
    expect(mergeWalkLedger(ledger, [walk(9, "prod-qa-walk x", "success", "2026-11-15T10:00:00Z")]).unknownDevice).toEqual([]);
    expect(c.ledger.walks["x|phone"].result).toBe("success");
  });

  it("refuses to overwrite a report generated after the data being rendered", () => {
    expect(staleOverwriteReason("2026-11-15T21:41:00Z", "2026-11-15T09:40:00Z")).toMatch(/after this data was fetched/);
    expect(staleOverwriteReason("2026-11-15T09:40:00Z", "2026-11-15T21:41:00Z")).toBeNull();
    expect(staleOverwriteReason(null, "2026-11-15T21:41:00Z")).toBeNull();
  });

  it("flags a merged PR named as blocking and phone walks called 'not run' when the ledger has them", () => {
    const ledger = { schema: 1, walks: { "agency-chain|phone-375": { spec: "agency-chain", device: "phone-375", run: 2, result: "success", build: "d", at: "2026-11-15T17:55:58Z" } } };
    const d = narrativeDiscrepancies(
      "- **Blokuoja:** #3349 – reikia RED patikrų; #3302 laukia sprendimo; #3354 laukia įrodymo\n- prisijungusių naudotojų bandymai telefonu produkcijoje – duomenyse paleidimo nėra",
      { openPrNumbers: [3302], closedPrNumbers: [3349], ledger },
    );
    expect(d.some((x: string) => x.startsWith("#3349"))).toBe(true);
    // #3354 is an issue, not a closed PR: never flagged.
    expect(d.some((x: string) => x.startsWith("#3354"))).toBe(false);
    expect(d.some((x: string) => x.startsWith("#3302"))).toBe(false);
    expect(d.some((x: string) => /telefono bandymų/.test(x))).toBe(true);
  });

  it("keeps contact data and money amounts out of the public report", () => {
    expect(privacyFindings("contact jonas@company.lt")).toHaveLength(1);
    expect(privacyFindings("walk user qa@example.invalid")).toHaveLength(0);
    expect(privacyFindings("turnover €60 000")).toHaveLength(1);
    expect(privacyFindings("run 43743349514 on build d225f58a")).toHaveLength(0);
  });

  it("the rendered report shows the confirmed state, the coverage meaning, and refuses an older overwrite", () => {
    const dir = mkdtempSync(join(tmpdir(), "status-sync-"));
    const out = join(dir, "STATUS_REPORT.md");
    const dataPath = join(dir, "data.json");
    writeFileSync(
      join(dir, "STATUS_EVIDENCE.json"),
      JSON.stringify({ schema: 1, walks: { "agency-chain|phone-375": { spec: "agency-chain", device: "phone-375", run: 43743349514, result: "success", build: "d225f58a", at: "2026-11-15T17:55:58Z" } } }),
    );
    const base = { schema: 2, migrationParity: { applied: 1, files: 1, notApplied: [], passed: true, run: 1, headSha: "f461497e" }, sinceIso: "2026-11-15T09:40:00Z", errors: [], requiredChecks: { names: [], source: "policy" }, health: { ok: true, build: "f461497e" }, deploys: [], merged: [], prs: [] };
    const run = (fetchedAt: string, walks: object[]) => {
      writeFileSync(dataPath, JSON.stringify({ ...base, fetchedAt, walks }));
      return spawnSync(process.execPath, [join(REPO, ".github", "scripts", "status-report.mjs"), "--data", dataPath, "--out", out], { encoding: "utf8" });
    };
    const first = run("2026-11-15T21:41:00Z", [walk(43724558463, "prod-qa-walk agency-chain phone-375", "failure", "2026-11-15T14:32:00Z")]);
    expect(first.status, first.stderr).toBe(0);
    const md = readFileSync(out, "utf8");
    expect(md).toContain("## Patvirtinta naujausia būsena");
    expect(md).toMatch(/\| agency-chain \| telefonas 375 px \| sėkmingas \| `d225f58a`/);
    expect(md).toContain("nereiškia, kad likusios");
    expect(JSON.parse(readFileSync(join(dir, "STATUS_EVIDENCE.json"), "utf8")).walks["agency-chain|phone-375"].run).toBe(43743349514);
    const older = run("2026-11-15T09:40:00Z", []);
    expect(older.status).toBe(4);
    expect(readFileSync(out, "utf8")).toBe(md);
    // A run that commits only the report still carries the confirmed results forward.
    rmSync(join(dir, "STATUS_EVIDENCE.json"));
    const next = run("2026-11-16T09:40:00Z", []);
    expect(next.status, next.stderr).toBe(0);
    expect(readFileSync(out, "utf8")).toMatch(/\| agency-chain \| telefonas 375 px \| sėkmingas \| `d225f58a`/);
  });
});

describe("migration truth (owner order 2026-11-20): the production ledger, never a PR body", () => {
  const LOG = [
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z check-migration-parity: 481 applied in production, 481 files in repo.",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z   matched by name: 472   reviewed split/union/follow-up: 9   not yet applied: 2",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z ",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z Repo files with no production ledger row (informational):",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z   - 20260713120000_company_locations_v1",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z   - 20261120190000_not_applied_yet_v1",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z ",
    "quality\tMigration parity (live ledger gate)\t2026-11-20T20:00:00.0000000Z PASS — every production migration has a repository file.",
  ].join("\n");

  it("reads the live parity step: counts, the not-applied list and the verdict", () => {
    expect(parseParityLog(LOG)).toEqual({
      applied: 481,
      files: 481,
      notApplied: ["20260713120000_company_locations_v1", "20261120190000_not_applied_yet_v1"],
      passed: true,
    });
    expect(parseParityLog("no parity step here")).toBeNull();
  });

  it("flags a merged PR called not applied when its migration is in the ledger, and nothing else", () => {
    const notApplied = parseParityLog(LOG)!.notApplied;
    const prMigrations = {
      2816: ["20261118143000_training_assignment_engaged_groups_v1"],
      3474: ["20261118164500_former_employer_limited_access_v1"],
      3600: ["20261120190000_not_applied_yet_v1"],
    };
    const text = [
      "- #2816 (RED, 11.8) – ar pritaikyta produkcijoje, šiais duomenimis neįrodyta;",
      "- #3474 – PR aprašyme „not applied“; pritaikymas – atskiras savininko leidimas;",
      "- #3600 – migracija laukia savininko leidimo;",
      "- #3489 sujungtas.",
    ].join("\n");
    const d = migrationClaimDiscrepancies(text, { prMigrations, notApplied });
    expect(d).toHaveLength(2);
    expect(d.join(" ")).toMatch(/#2816/);
    expect(d.join(" ")).toMatch(/#3474/);
    expect(d.join(" ")).not.toMatch(/#3600/);
  });

  it("COMPLETE needs all data, the migration ledger and no open contradiction", () => {
    const parity = { applied: 1, files: 1, notApplied: [], passed: true };
    expect(finalCompleteness({ migrationParity: parity })).toBe("COMPLETE");
    expect(finalCompleteness({ migrationParity: parity, discrepancies: ["x"] })).toBe("PARTIAL");
    expect(finalCompleteness({})).toBe("PARTIAL");
    expect(finalCompleteness({ migrationParity: parity, errors: [{}] })).toBe("PARTIAL");
  });
});
