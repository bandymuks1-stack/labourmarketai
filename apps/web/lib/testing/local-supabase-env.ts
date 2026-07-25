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
 * There is no third step. If neither yields a target the caller refuses, rather
 * than silently falling back to whatever ambient config happens to exist.
 *
 * The resolved target is always passed through `assertLocalSupabaseTarget`
 * before use, so even a hand-set `E2E_SUPABASE_URL` cannot point at production.
 */
import { spawnSync } from "node:child_process";
import {
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

function fromLocalStack(
  repoRoot: string,
): Omit<LocalSupabaseEnv, "target" | "source"> | null {
  const res = spawnSync("npx", ["supabase", "status", "-o", "env"], {
    cwd: repoRoot,
    shell: process.platform === "win32",
    encoding: "utf8",
  });
  if (res.status !== 0 || !res.stdout) return null;
  const env = parseSupabaseStatusEnv(res.stdout);
  const url = env.API_URL;
  const anonKey = env.ANON_KEY;
  const serviceKey = env.SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

/**
 * Resolve + validate the local Supabase target. Throws NonLocalTargetError when
 * the resolved target is not demonstrably local.
 */
export function resolveLocalSupabaseEnv(repoRoot: string): LocalSupabaseEnv {
  const explicit = fromExplicitEnv();
  const picked = explicit ?? fromLocalStack(repoRoot);
  const source: LocalSupabaseEnv["source"] = explicit
    ? "E2E_SUPABASE_* env"
    : "npx supabase status";

  if (!picked) {
    // Pass url:undefined so the guard produces the canonical refusal message.
    assertLocalSupabaseTarget({ url: undefined });
    throw new Error("unreachable");
  }

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
