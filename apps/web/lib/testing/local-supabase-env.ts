/**
 * Resolves the LOCAL Supabase connection for test helpers.
 *
 * It deliberately DOES NOT read `apps/web/.env.local`. That file points at the
 * production project (it is what `pnpm dev` needs), and every helper that
 * loaded it inherited a production target. Resolution order is instead:
 *
 *   1. Explicit `E2E_SUPABASE_*` variables — the documented override, see
 *      `.env.e2e.local.example`.
 *   2. `npx supabase status -o env` — the running local stack, authoritative.
 *
 * There is no third step. If neither yields a target the caller stops, rather
 * than silently falling back to whatever ambient config happens to exist.
 *
 * Two different failures, two different codes:
 *   - NOTHING resolved (Docker off, stack not started, `supabase status`
 *     failed) -> LocalStackUnavailableError, LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER.
 *     An availability problem: there is no target, so nothing can be touched.
 *   - a URL DID resolve -> always `assertLocalSupabaseTarget`, which refuses
 *     anything non-local with REFUSED_NON_LOCAL_E2E_SESSION_MINT, unchanged.
 *     So even a hand-set `E2E_SUPABASE_URL` cannot point at production.
 */
import { spawnSync } from "node:child_process";
import {
  LocalStackUnavailableError,
  assertLocalSupabaseTarget,
  redactKey,
  type LocalTarget,
} from "./local-supabase-guard";

export type LocalSupabaseEnv = {
  url: string;
  anonKey: string;
  serviceKey: string;
  target: LocalTarget;
  source: "E2E_SUPABASE_* env" | "npx supabase status";
};

/** Parse `KEY="value"` lines from `supabase status -o env`. */
export function parseSupabaseStatusEnv(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    const eq = line.indexOf("=");
    if (!line || eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function fromExplicitEnv(): Omit<LocalSupabaseEnv, "target" | "source"> | null {
  const url = process.env.E2E_SUPABASE_URL;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY;
  const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

/** What `npx supabase status -o env` produced. Only stderr is ever printed. */
export type SupabaseStatusResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Set when the command could not be started at all (e.g. no `npx`). */
  error?: Error;
};

/** `repoRoot -> result`. Injected only by the unit test. */
export type SupabaseStatusRunner = (repoRoot: string) => SupabaseStatusResult;

export const runSupabaseStatus: SupabaseStatusRunner = (repoRoot) => {
  const res = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    cwd: repoRoot,
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error,
  };
};

/**
 * First meaningful stderr line, bounded. stdout is deliberately NOT used here:
 * on a partial success it can carry keys, and this text is printed.
 *
 * `npx` prefixes its own `npm warn …` noise (e.g. the pnpm-only `node-linker`
 * config), which would otherwise be the line shown instead of the Docker cause.
 */
export function stderrExcerpt(stderr: string): string {
  const line = stderr
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !/^npm (warn|notice)\b/i.test(l));
  if (!line) return "";
  return `: ${line.length > 200 ? `${line.slice(0, 200)}…` : line}`;
}

function fromLocalStack(
  repoRoot: string,
  run: SupabaseStatusRunner,
): Omit<LocalSupabaseEnv, "target" | "source"> {
  const res = run(repoRoot);

  if (res.error) {
    throw new LocalStackUnavailableError(
      `could not run \`npx supabase status\` (${res.error.message}), so no ` +
        "local Supabase stack was found.",
    );
  }
  if (res.status !== 0 || !res.stdout) {
    throw new LocalStackUnavailableError(
      `\`npx supabase status\` exited ${res.status ?? "without a status"}` +
        `${stderrExcerpt(res.stderr)} — the local Supabase stack is not ` +
        "running (Docker Desktop off, or `npx supabase start` not run).",
    );
  }

  const env = parseSupabaseStatusEnv(res.stdout);
  const url = env.API_URL;
  const anonKey = env.ANON_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY;

  if (url && (!anonKey || !serviceKey)) {
    // A URL DID resolve, so the security question comes first: a non-local
    // URL refuses with REFUSED_NON_LOCAL_E2E_SESSION_MINT exactly as before,
    // whatever else is missing. Only a local URL with missing keys is an
    // incomplete stack.
    assertLocalSupabaseTarget({ url, anonKey, serviceKey });
  }
  if (!url || !anonKey || !serviceKey) {
    throw new LocalStackUnavailableError(
      "`npx supabase status` did not report API_URL, ANON_KEY and " +
        "SERVICE_ROLE_KEY — the local stack is not (fully) running.",
    );
  }
  return { url, anonKey, serviceKey };
}

/**
 * Resolve + validate the local Supabase target.
 *
 * Throws LocalStackUnavailableError when nothing resolved (no explicit
 * override and no running local stack), and NonLocalTargetError when the
 * resolved target is not demonstrably local.
 */
export function resolveLocalSupabaseEnv(
  repoRoot: string,
  deps: { runStatus?: SupabaseStatusRunner } = {},
): LocalSupabaseEnv {
  const explicit = fromExplicitEnv();
  const picked =
    explicit ?? fromLocalStack(repoRoot, deps.runStatus ?? runSupabaseStatus);
  const source: LocalSupabaseEnv["source"] = explicit
    ? "E2E_SUPABASE_* env"
    : "npx supabase status";

  const target = assertLocalSupabaseTarget({
    url: picked.url,
    anonKey: picked.anonKey,
    serviceKey: picked.serviceKey,
  });

  return { ...picked, target, source };
}

/** One-line, key-free description of the resolved target, safe to log. */
export function describeLocalTarget(env: LocalSupabaseEnv): string {
  return (
    `local Supabase target: host=${env.target.host} ` +
    `origin=${env.target.origin} projectRef=${env.target.projectRef} ` +
    `source="${env.source}" anonKey=${redactKey(env.anonKey)} ` +
    `serviceKey=${redactKey(env.serviceKey)}`
  );
}
