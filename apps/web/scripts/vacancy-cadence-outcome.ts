/**
 * VACANCY CADENCE OUTCOME — provider-agnostic session classification, a
 * bounded multi-session loop and INCIDENT DE-DUPLICATION for the scheduled
 * supply workflows (first user: nav-supply-cadence.yml).
 *
 * Why this exists (2026-10-09): one transient listing timeout failed a
 * scheduled run, and because GitHub fires the cron only a handful of times a
 * day, one failure cost hours of catch-up and every further red run mailed the
 * owner about the SAME unresolved problem. The fix is not to mute anything; it
 * is to (1) recover on its own, and (2) notify ONCE per incident.
 *
 * Layers
 *   1. `classifyAccounting`   pure: accounting JSON -> ok | budget_exhausted |
 *                             transient_failure | hard_failure.
 *   2. `runCadenceLoop`       pure (all effects injected): up to N sessions per
 *                             workflow run, bounded wall clock, in-run retry of
 *                             a transient failure with jitter, stops on
 *                             caught up / failure / no progress.
 *   3. `decideIncident`       pure state machine: what to do with the final
 *                             outcome given the open-incident state.
 *   4. `main`                 thin CLI: spawns the canonical operator runner,
 *                             performs the `gh` effects, writes the job summary.
 *
 * What this does NOT touch: the per-session request budget (the operator
 * runner and the provider descriptor own it, unchanged), the kill switches
 * (VACANCY_SOURCE_<KEY>_ENABLED is read by the runner exactly as before; a
 * `blocked` result is a HARD failure here, never a skipped one), credentials.
 *
 * Failures stay visible: every non-ok outcome prints a `::warning::` /
 * `::error::` annotation and a job summary, the issue records the incident,
 * and the cursor row keeps its health columns. De-duplication only decides how
 * many NOTIFICATIONS (failed runs, new issues) one unresolved incident causes.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ── Bounds (pinned by nav-request-budget.test.ts) ────────────────────────────

/** Most operator-runner sessions one workflow run may START (retries count). */
export const MAX_SESSIONS_PER_RUN = 8;
/** Most in-run retries of one transient failure before giving up. */
export const MAX_IN_RUN_RETRIES = 2;
/** Jittered wait before the FIRST in-run retry; retry n waits n times this (30-60 s, then 60-120 s). */
export const RETRY_DELAY_MIN_MS = 30_000;
export const RETRY_DELAY_MAX_MS = 60_000;
/** No NEW session is started once the run is this old (job timeout is 20 min). */
export const NO_NEW_SESSION_AFTER_MS = 13 * 60_000;
/** Hard ceiling for any child session; also clipped to the remaining job time. */
export const SESSION_HARD_DEADLINE_MS = 18 * 60_000;
export const SESSION_CHILD_TIMEOUT_MS = 8 * 60_000;
/** Failed sessions one run can record on the cursor streak (1 + retries). */
export const ATTEMPTS_PER_RUN = 1 + MAX_IN_RUN_RETRIES;
/** Failed RUNS (not sessions) before a transient failure becomes an incident. */
export const INCIDENT_FAILED_RUNS = 3;
/** A failing source with no success for this long is an incident regardless. */
export const STALL_HOURS = 12;
/** A still-open incident gets a status comment at most this often. */
export const STATUS_COMMENT_INTERVAL_HOURS = 24;

export const INCIDENT_LABEL = "ingestion-incident";
export const STATUS_MARKER = "<!-- ingestion-incident-status -->";

// ── 1. Classification ───────────────────────────────────────────────────────

export type OutcomeKind =
  | "ok"
  | "budget_exhausted"
  | "transient_failure"
  | "hard_failure";

export interface Classification {
  readonly kind: OutcomeKind;
  /** Stable machine code, never a payload or secret. */
  readonly code: string;
  /** In-run retry is worthwhile (transient, or an exception that may be a blip). */
  readonly retryInRun: boolean;
  readonly caughtUp: boolean | null;
  readonly cursorAdvanced: boolean;
  /** `after.cursor.consecutive_failures` (0 when absent). */
  readonly dbStreak: number;
  /** `before.cursor.consecutive_failures` (0 when absent). */
  readonly dbStreakBefore: number;
  /** `after.cursor.last_success_at`, if the row has one. */
  readonly lastSuccessAt: string | null;
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** One bounded error string -> transient / hard. Unknown is HARD (fail visible). */
export function classifyErrorCode(raw: string): { transient: boolean; code: string } {
  // Strip the optional `<channel>:` and `page_fetch_failed:` prefixes.
  const parts = raw
    .split(":")
    .filter((p) => p !== "" && p !== "page_fetch_failed" && p !== "stream" && p !== "snapshot" && p !== "links");
  const head = parts[0] ?? "unknown";
  if (head === "http_error") {
    const status = Number(parts[1]);
    if (Number.isInteger(status)) {
      const transient = (status >= 500 && status <= 599) || status === 429 || status === 408;
      return { transient, code: `http_error:${status}` };
    }
    return { transient: false, code: "http_error" };
  }
  if (head === "detail_fetch_failed") {
    // `detail_fetch_failed:<cause>`; a bare code (older accounting) is unknown
    // cause and treated as transient. A refused ad (4xx), bad JSON or an
    // over-budget page is deterministic: retrying cannot change the answer.
    const cause = parts[1];
    if (cause === undefined) return { transient: true, code: head };
    const status = /^http_(\d{3})$/.exec(cause);
    const transient = status
      ? Number(status[1]) >= 500 || status[1] === "429" || status[1] === "408"
      : cause === "timeout" || cause === "network_error";
    return { transient, code: `${head}:${cause}` };
  }
  if (head === "timeout" || head === "network_error" || head === "stream_interrupted") {
    return { transient: true, code: head };
  }
  // 401/403/400 land in http_error above; everything below is deterministic.
  return { transient: false, code: head.slice(0, 60) };
}

export function classifyAccounting(acc: unknown): Classification {
  const session = isObj(acc) && isObj(acc.session) ? acc.session : null;
  const after = isObj(acc) && isObj(acc.after) && isObj(acc.after.cursor) ? acc.after.cursor : null;
  const before = isObj(acc) && isObj(acc.before) && isObj(acc.before.cursor) ? acc.before.cursor : null;
  const base = {
    caughtUp: session && typeof session.caughtUp === "boolean" ? session.caughtUp : null,
    cursorAdvanced: session?.cursorAdvanced === true,
    dbStreak: num(after?.consecutive_failures),
    dbStreakBefore: num(before?.consecutive_failures),
    lastSuccessAt: typeof after?.last_success_at === "string" ? after.last_success_at : null,
  };
  if (session === null) {
    // The runner died before printing accounting: nothing was recorded on the
    // cursor row, so only a retry and an issue can surface it.
    return { ...base, kind: "hard_failure", code: "runner_no_accounting", retryInRun: true };
  }
  const errors = Array.isArray(session.errors) ? session.errors.filter((e): e is string => typeof e === "string") : [];
  switch (session.status) {
    case "imported":
    case "dry_run_complete":
      return {
        ...base,
        kind: base.caughtUp === false ? "budget_exhausted" : "ok",
        code: base.caughtUp === false ? "budget_exhausted" : "ok",
        retryInRun: false,
      };
    case "fetch_failed": {
      const classified = (errors.length > 0 ? errors : ["page_fetch_failed"]).map(classifyErrorCode);
      const hard = classified.find((c) => !c.transient);
      const picked = hard ?? classified[0];
      return {
        ...base,
        kind: hard ? "hard_failure" : "transient_failure",
        code: picked.code,
        retryInRun: !hard,
      };
    }
    case "blocked":
      // Kill switch / governance said no while the workflow gate said go: the
      // environment is misconfigured. Never retried, never silent.
      return { ...base, kind: "hard_failure", code: `blocked:${String(session.blockedReason ?? "unknown").slice(0, 60)}`, retryInRun: false };
    case "runner_exception":
      // Leaves the cursor row untouched (streak stays 0) — may be a DB blip
      // (e.g. 57014), so one in-run retry is cheap, but it is an incident
      // candidate immediately because no streak will ever count it.
      return { ...base, kind: "hard_failure", code: `runner_exception:${(errors[0] ?? "unknown").slice(0, 60)}`, retryInRun: true };
    default:
      return { ...base, kind: "hard_failure", code: "unknown_status", retryInRun: false };
  }
}

/** Failed RUNS implied by the cursor streak (each run records <= ATTEMPTS_PER_RUN). */
export function failedRunStreak(dbStreak: number): number {
  return Math.max(1, Math.ceil(dbStreak / ATTEMPTS_PER_RUN));
}

// ── 2. Bounded session loop ─────────────────────────────────────────────────

export interface SessionRun {
  readonly classification: Classification;
  readonly accounting: unknown;
  readonly elapsedMs: number;
}

export interface LoopDeps {
  runSession(timeoutMs: number): Promise<SessionRun>;
  sleep(ms: number): Promise<void>;
  now(): number;
  /** 0 <= x < 1 */
  random(): number;
  log(line: string): void;
}

export type StopReason =
  | "caught_up"
  | "failure"
  | "no_progress"
  | "max_sessions"
  | "wall_clock"
  | "single_session";

export interface LoopResult {
  readonly sessions: readonly SessionRun[];
  readonly final: Classification;
  readonly stopReason: StopReason;
  readonly retries: number;
}

export interface LoopLimits {
  readonly maxSessions: number;
  readonly maxRetries: number;
  readonly noNewSessionAfterMs: number;
  readonly hardDeadlineMs: number;
  readonly childTimeoutMs: number;
  readonly retryDelayMinMs: number;
  readonly retryDelayMaxMs: number;
}

export const DEFAULT_LIMITS: LoopLimits = {
  maxSessions: MAX_SESSIONS_PER_RUN,
  maxRetries: MAX_IN_RUN_RETRIES,
  noNewSessionAfterMs: NO_NEW_SESSION_AFTER_MS,
  hardDeadlineMs: SESSION_HARD_DEADLINE_MS,
  childTimeoutMs: SESSION_CHILD_TIMEOUT_MS,
  retryDelayMinMs: RETRY_DELAY_MIN_MS,
  retryDelayMaxMs: RETRY_DELAY_MAX_MS,
};

export async function runCadenceLoop(
  deps: LoopDeps,
  opts: { multiSession: boolean; limits?: LoopLimits },
): Promise<LoopResult> {
  const limits = opts.limits ?? DEFAULT_LIMITS;
  const startedAt = deps.now();
  const sessions: SessionRun[] = [];
  let retries = 0;
  let retriesThisEpisode = 0;
  let launched = 0;

  for (;;) {
    const elapsed = deps.now() - startedAt;
    const timeoutMs = Math.min(limits.childTimeoutMs, limits.hardDeadlineMs - elapsed);
    const run = await deps.runSession(Math.max(1_000, timeoutMs));
    launched += 1;
    sessions.push(run);
    const c = run.classification;
    deps.log(`session ${launched}: ${c.kind} (${c.code}) caughtUp=${String(c.caughtUp)} cursorAdvanced=${String(c.cursorAdvanced)}`);

    const done = (stopReason: StopReason): LoopResult => ({ sessions, final: c, stopReason, retries });

    if (c.kind === "transient_failure" || (c.kind === "hard_failure" && c.retryInRun)) {
      if (retriesThisEpisode >= limits.maxRetries || launched >= limits.maxSessions) return done("failure");
      const delay = Math.round((limits.retryDelayMinMs + deps.random() * (limits.retryDelayMaxMs - limits.retryDelayMinMs)) * (retriesThisEpisode + 1));
      if (deps.now() - startedAt + delay >= limits.noNewSessionAfterMs) return done("failure");
      retriesThisEpisode += 1;
      retries += 1;
      deps.log(`retrying in ${Math.round(delay / 1000)}s (retry ${retriesThisEpisode}/${limits.maxRetries})`);
      await deps.sleep(delay);
      continue;
    }
    if (c.kind === "hard_failure") return done("failure");

    // A session that completed: the episode of failures (if any) is over.
    retriesThisEpisode = 0;
    if (!opts.multiSession) return done("single_session");
    if (c.caughtUp === true || c.caughtUp === null) return done("caught_up");
    if (!c.cursorAdvanced) return done("no_progress"); // behind but not moving: do not hammer the source
    if (launched >= limits.maxSessions) return done("max_sessions");
    if (deps.now() - startedAt >= limits.noNewSessionAfterMs) return done("wall_clock");
  }
}

// ── 3. Incident state machine ───────────────────────────────────────────────

export interface OpenIncident {
  readonly number: number;
  /** ISO time of the last status comment (or issue creation). */
  readonly lastStatusAt: string;
}

export type IncidentAction =
  | { readonly action: "none" }
  | { readonly action: "warn"; readonly reason: string }
  | { readonly action: "open_issue"; readonly failRun: true }
  | { readonly action: "quiet"; readonly number: number }
  | { readonly action: "status_comment"; readonly number: number }
  | { readonly action: "recover"; readonly number: number };

export function decideIncident(input: {
  final: Classification;
  open: OpenIncident | null;
  nowMs: number;
}): IncidentAction {
  const { final, open, nowMs } = input;
  if (final.kind === "ok" || final.kind === "budget_exhausted") {
    return open ? { action: "recover", number: open.number } : { action: "none" };
  }
  const runs = failedRunStreak(final.dbStreak);
  const lastSuccessMs = final.lastSuccessAt ? Date.parse(final.lastSuccessAt) : Number.NaN;
  const stalled = Number.isFinite(lastSuccessMs) && nowMs - lastSuccessMs >= STALL_HOURS * 3_600_000;
  const isIncident = final.kind === "hard_failure" || runs >= INCIDENT_FAILED_RUNS || stalled;

  if (!isIncident) {
    return { action: "warn", reason: `${final.code}: failed run ${runs} of ${INCIDENT_FAILED_RUNS - 1} tolerated quietly` };
  }
  if (!open) return { action: "open_issue", failRun: true };
  const sinceStatus = nowMs - Date.parse(open.lastStatusAt);
  if (!Number.isFinite(sinceStatus) || sinceStatus >= STATUS_COMMENT_INTERVAL_HOURS * 3_600_000) {
    return { action: "status_comment", number: open.number };
  }
  return { action: "quiet", number: open.number };
}

/** The exit code a final action implies: ONLY a newly opened incident fails the run. */
export function exitCodeFor(action: IncidentAction): 0 | 1 {
  return action.action === "open_issue" ? 1 : 0;
}

export function incidentTitle(provider: string, channel: string, code: string): string {
  return `Ingestion incident: ${provider}/${channel}: ${code}`;
}
export function incidentTitlePrefix(provider: string, channel: string): string {
  return `Ingestion incident: ${provider}/${channel}:`;
}

// ── 4. CLI ──────────────────────────────────────────────────────────────────

/** One-line evidence from a session's fetch diagnostics (numbers + public ad id). */
export function describeDiagnostics(acc: unknown): string {
  const session = isObj(acc) && isObj(acc.session) ? acc.session : null;
  const list = session && Array.isArray(session.fetchDiagnostics) ? session.fetchDiagnostics : [];
  const parts: string[] = [];
  for (const d of list) {
    if (!isObj(d)) continue;
    const det = isObj(d.detail) ? d.detail : null;
    const ff = det && isObj(det.firstFailure) ? det.firstFailure : null;
    const el = det && isObj(det.elapsedMs) ? det.elapsedMs : null;
    parts.push(
      `listing ${String(d.listingElapsedMs)} ms` +
        (det
          ? `; details ${String(det.succeeded)}/${String(det.attempted)} ok` +
            (el ? ` (${String(el.min)}/${String(el.median)}/${String(el.max)} ms min/median/max)` : "") +
            (ff ? `; first failing entry ${String(ff.uuid)} at #${String(ff.position)} (${String(ff.cause)})` : "")
          : ""),
    );
  }
  return parts.join(" | ");
}

export function parseAccountingStdout(stdout: string): unknown {
  const text = stdout.trim();
  if (text === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    const a = text.indexOf("{");
    const b = text.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        return JSON.parse(text.slice(a, b + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function runOperatorSession(provider: string, channel: string, timeoutMs: number): Promise<SessionRun> {
  const started = Date.now();
  return new Promise((resolve) => {
    const args = [
      "tsx", "--conditions=react-server", "scripts/vacancy-operator-run.ts",
      "--provider", provider, "--channel", channel, "--mode", "persist",
      "--apply", "--i-understand-this-writes-production",
    ];
    const child = spawn("pnpm", args, { stdio: ["ignore", "pipe", "inherit"], shell: process.platform === "win32" });
    let out = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
      process.stdout.write(d);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const accounting = parseAccountingStdout(out);
      const classification = timedOut
        ? ({ ...classifyAccounting(null), kind: "transient_failure", code: "session_timeout", retryInRun: true } as Classification)
        : classifyAccounting(accounting);
      resolve({ classification, accounting, elapsedMs: Date.now() - started });
    });
  });
}

function gh(args: string[], input?: string): { ok: boolean; stdout: string } {
  const r = spawnSync("gh", args, { input, encoding: "utf8", shell: process.platform === "win32" });
  return { ok: r.status === 0, stdout: r.stdout ?? "" };
}

function findOpenIncident(provider: string, channel: string): OpenIncident | null | "unavailable" {
  const list = gh(["issue", "list", "--label", INCIDENT_LABEL, "--state", "open", "--limit", "50", "--json", "number,title,createdAt"]);
  if (!list.ok) return "unavailable";
  let issues: Array<{ number: number; title: string; createdAt: string }> = [];
  try {
    issues = JSON.parse(list.stdout);
  } catch {
    return "unavailable";
  }
  const prefix = incidentTitlePrefix(provider, channel);
  const hit = issues.find((i) => i.title.startsWith(prefix));
  if (!hit) return null;
  let lastStatusAt = hit.createdAt;
  const view = gh(["issue", "view", String(hit.number), "--json", "comments"]);
  if (view.ok) {
    try {
      const comments = (JSON.parse(view.stdout).comments ?? []) as Array<{ body: string; createdAt: string }>;
      for (const c of comments) if (c.body.includes(STATUS_MARKER) && c.createdAt > lastStatusAt) lastStatusAt = c.createdAt;
    } catch {
      /* keep creation time */
    }
  }
  return { number: hit.number, lastStatusAt };
}

function runUrl(): string {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  return GITHUB_RUN_ID && GITHUB_REPOSITORY ? `${GITHUB_SERVER_URL ?? "https://github.com"}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}` : "(local run)";
}

function summary(markdown: string): void {
  const f = process.env.GITHUB_STEP_SUMMARY;
  if (f) appendFileSync(f, `${markdown}\n`);
  console.error(markdown);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i >= 0 ? (argv[i + 1] ?? null) : null;
  };
  const provider = arg("--provider");
  const channel = arg("--channel");
  if (!provider || !channel) {
    console.error("usage: vacancy-cadence-outcome.ts --provider <key> --channel <channel>");
    process.exitCode = 2;
    return;
  }

  const result = await runCadenceLoop(
    {
      runSession: (t) => runOperatorSession(provider, channel, t),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      now: () => Date.now(),
      random: Math.random,
      log: (l) => console.error(`[cadence] ${l}`),
    },
    { multiSession: true },
  );

  const last = result.sessions[result.sessions.length - 1];
  writeFileSync("run-accounting.json", JSON.stringify(last.accounting, null, 2));
  writeFileSync(
    "run-sessions.json",
    JSON.stringify({ stopReason: result.stopReason, retries: result.retries, sessions: result.sessions.map((s) => ({ ...s.classification, elapsedMs: s.elapsedMs })) }, null, 2),
  );

  const final = result.final;
  const open = findOpenIncident(provider, channel);
  const nowMs = Date.now();
  const rows = result.sessions
    .map((s, i) => `| ${i + 1} | ${s.classification.kind} | ${s.classification.code} | ${String(s.classification.caughtUp)} | ${String(s.classification.cursorAdvanced)} | ${Math.round(s.elapsedMs / 1000)}s |`)
    .join("\n");
  const head = `### ${provider}/${channel} cadence: ${final.kind} (${final.code})\nSessions: ${result.sessions.length}, in-run retries: ${result.retries}, stop: ${result.stopReason}\n\n| # | outcome | code | caughtUp | cursorAdvanced | time |\n|---|---|---|---|---|---|\n${rows}\n`;

  if (open === "unavailable") {
    // Cannot read incident state: fail-safe is visibility. A failure fails the run.
    summary(`${head}\nIncident state unavailable (gh).`);
    if (final.kind === "hard_failure" || final.kind === "transient_failure") {
      console.log(`::error::${provider}/${channel} ${final.code}: incident state unavailable, failing the run so it is not silent`);
      process.exitCode = 1;
    }
    return;
  }

  const action = decideIncident({ final, open, nowMs });
  const evidence = describeDiagnostics(last.accounting);
  const detail = `${evidence ? `Evidence: ${evidence}
` : ""}Failed-run streak ${failedRunStreak(final.dbStreak)} (cursor consecutive_failures=${final.dbStreak}), last success: ${final.lastSuccessAt ?? "never"}.\nRun: ${runUrl()}`;
  switch (action.action) {
    case "none":
      summary(head);
      break;
    case "warn":
      console.log(`::warning::${provider}/${channel} ${final.code}. ${action.reason}. The next scheduled run retries automatically.`);
      summary(`${head}\n${action.reason}\n${detail}`);
      break;
    case "quiet":
      console.log(`::warning::${provider}/${channel} ${final.code}: known incident #${action.number} still unresolved (no new notification).`);
      summary(`${head}\nKnown incident #${action.number} still unresolved; no new notification.\n${detail}`);
      break;
    case "status_comment":
      gh(["issue", "comment", String(action.number), "--body-file", "-"], `${STATUS_MARKER}\nStill unresolved: \`${final.code}\`.\n${detail}`);
      console.log(`::warning::${provider}/${channel} ${final.code}: incident #${action.number} still unresolved (daily status comment posted).`);
      summary(`${head}\nDaily status comment posted on #${action.number}.\n${detail}`);
      break;
    case "recover": {
      gh(["issue", "comment", String(action.number), "--body-file", "-"], `${STATUS_MARKER}\nRecovered: the latest ${provider}/${channel} session finished ${final.kind} (caughtUp=${String(final.caughtUp)}). Closing automatically.\nRun: ${runUrl()}`);
      gh(["issue", "close", String(action.number), "--reason", "completed"]);
      summary(`${head}\nRECOVERED: incident #${action.number} commented and closed.`);
      break;
    }
    case "open_issue": {
      gh(["label", "create", INCIDENT_LABEL, "--color", "B60205", "--description", "Unresolved scheduled-ingestion incident (one issue per incident)", "--force"]);
      const body = [
        `The scheduled ${provider}/${channel} ingestion run is failing: \`${final.code}\` (${final.kind}).`,
        "",
        detail,
        "",
        "This is the ONE notification for this incident. Further failing runs stay quiet (a status comment at most once per 24 h); the next successful session comments and closes this issue automatically. The kill switch (`VACANCY_SOURCE_*_ENABLED`) is unchanged.",
        "",
        "Evidence: job summary and the `run-accounting` artifact of the run above; cursor row `vacancy_import_cursors` (last_failure_code, consecutive_failures).",
      ].join("\n");
      const created = gh(["issue", "create", "--title", incidentTitle(provider, channel, final.code), "--label", INCIDENT_LABEL, "--body-file", "-"], body);
      console.log(`::error::${provider}/${channel} ${final.code}: new incident opened${created.ok ? ` (${created.stdout.trim()})` : " (issue creation failed; this failed run is the notification)"}.`);
      summary(`${head}\nNEW INCIDENT: ${created.stdout.trim() || "issue creation failed"}\n${detail}`);
      break;
    }
  }
  process.exitCode = exitCodeFor(action);
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
