import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALLOWED_LOCAL_ORIGINS,
  LOCAL_STACK_UNAVAILABLE_CODE,
  LOCAL_STACK_UNAVAILABLE_EXIT_CODE,
  LocalStackUnavailableError,
  NonLocalTargetError,
  PRODUCTION_PROJECT_REF,
  REFUSAL_CODE,
  formatLocalStackUnavailable,
} from "./local-supabase-guard";
import {
  resolveLocalSupabaseEnv,
  type SupabaseStatusResult,
  type SupabaseStatusRunner,
} from "./local-supabase-env";

/**
 * AVAILABILITY vs SECURITY — the two failures the resolver must never confuse.
 *
 * Until 2026-09-23 a developer with Docker Desktop off ran the local mint and
 * was told REFUSED_NON_LOCAL_E2E_SESSION_MINT: "nothing resolved" was routed
 * through the production-target refusal. These tests pin the split:
 *
 *   - nothing resolved      -> LocalStackUnavailableError
 *                              (LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER);
 *   - a URL DID resolve     -> the security guard, unchanged, and a non-local
 *                              one still refuses with REFUSAL_CODE.
 *
 * No Docker, no network: `npx supabase status` is replaced by an injected
 * runner, and E2E_SUPABASE_* is blanked so a developer's shell cannot leak in.
 */

/** Build an unsigned JWT with the given claims (signature is never checked). */
function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) =>
    Buffer.from(JSON.stringify(o))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.sig`;
}

const LOCAL_ANON = jwt({ iss: "supabase-demo", role: "anon" });
const LOCAL_SERVICE = jwt({ iss: "supabase-demo", role: "service_role" });
const PROD_SERVICE = jwt({
  iss: "supabase",
  ref: PRODUCTION_PROJECT_REF,
  role: "service_role",
});
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
const LOCAL_URL = ALLOWED_LOCAL_ORIGINS[0];

/**
 * What `npx supabase status` printed on the owner's Windows PC with Docker
 * Desktop stopped (captured 2026-09-23) — including the `npm warn` line npx
 * puts FIRST, which is not the cause and must not be the line shown.
 */
const DOCKER_OFF_STDERR =
  'npm warn Unknown project config "node-linker". This will stop working in ' +
  "the next major version of npm.\n" +
  "failed to inspect container health: failed to connect to the docker API " +
  "at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is " +
  "correct and if the daemon is running: open " +
  "//./pipe/dockerDesktopLinuxEngine: The system cannot find the file " +
  "specified.\n" +
  "Try rerunning the command with --debug to troubleshoot the error.\n";

function statusEnv(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}="${v}"`)
    .join("\n");
}

function runnerReturning(result: Partial<SupabaseStatusResult>) {
  return vi.fn<SupabaseStatusRunner>(() => ({
    status: 0,
    stdout: "",
    stderr: "",
    ...result,
  }));
}

/** The error a call threw — fails the test if it did not throw. */
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to throw");
}

const REPO_ROOT = "/not-used-the-runner-is-injected";

beforeEach(() => {
  // Empty is "unset" to the resolver. Without this, a developer who exported
  // E2E_SUPABASE_* would silently turn every case below into the override.
  vi.stubEnv("E2E_SUPABASE_URL", "");
  vi.stubEnv("E2E_SUPABASE_ANON_KEY", "");
  vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("local stack UNAVAILABLE — reported as availability, never as a security refusal", () => {
  it("`supabase status` failing (Docker Desktop off) -> LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER", () => {
    const run = runnerReturning({ status: 1, stderr: DOCKER_OFF_STDERR });

    const err = thrown(() =>
      resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run }),
    );

    expect(err).toBeInstanceOf(LocalStackUnavailableError);
    // THE DEFECT: this used to be a NonLocalTargetError.
    expect(err).not.toBeInstanceOf(NonLocalTargetError);
    const e = err as LocalStackUnavailableError;
    expect(e.code).toBe(LOCAL_STACK_UNAVAILABLE_CODE);
    expect(e.code).toBe("LOCAL_INTEGRATION_TEST_REQUIRES_DOCKER");
    expect(e.message).not.toContain(REFUSAL_CODE);
    // The operator sees WHY, from stderr — the Docker cause, not npm's noise.
    expect(e.message).toContain("failed to inspect container health");
    expect(e.message).not.toContain("npm warn");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("`npx` itself failing to start -> unavailable", () => {
    const run = runnerReturning({
      status: null,
      error: new Error("spawnSync npx ENOENT"),
    });

    const err = thrown(() =>
      resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run }),
    );

    expect(err).toBeInstanceOf(LocalStackUnavailableError);
    expect((err as Error).message).toContain("ENOENT");
  });

  it("status exits 0 but reports no API_URL (stack not running) -> unavailable", () => {
    const run = runnerReturning({
      stdout: statusEnv({ DB_URL: "postgresql://postgres@127.0.0.1:54322/x" }),
    });

    expect(
      thrown(() => resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run })),
    ).toBeInstanceOf(LocalStackUnavailableError);
  });

  it("a LOCAL URL with missing keys is an incomplete stack, not a refusal", () => {
    const run = runnerReturning({
      stdout: statusEnv({ API_URL: LOCAL_URL, ANON_KEY: LOCAL_ANON }),
    });

    expect(
      thrown(() => resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run })),
    ).toBeInstanceOf(LocalStackUnavailableError);
  });

  it("never echoes stdout, which can carry keys", () => {
    const run = runnerReturning({
      status: 1,
      stdout: statusEnv({ SERVICE_ROLE_KEY: LOCAL_SERVICE }),
      stderr: "",
    });

    const err = thrown(() =>
      resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run }),
    ) as Error;

    expect(err).toBeInstanceOf(LocalStackUnavailableError);
    expect(err.message).not.toContain(LOCAL_SERVICE);
  });

  it("says what to do instead: Docker for LOCAL INTEGRATION, none for unit tests, prod-qa for production", () => {
    const e = new LocalStackUnavailableError("no stack");
    expect(e.message).toContain("LOCAL INTEGRATION");
    expect(e.message).toContain("Docker Desktop");
    expect(e.message).toContain("npx supabase start");
    expect(e.message).toContain("pnpm -F web test");
    expect(e.message).toContain("pnpm -C apps/web prod-qa:gate");
    expect(e.message).toMatch(/never by pointing local tooling at production/);

    // The printed line is `<CODE> — <message>`, and the exit code differs from
    // the security refusal's exit 1 so a wrapper can tell them apart.
    expect(formatLocalStackUnavailable(e)).toBe(
      `${LOCAL_STACK_UNAVAILABLE_CODE} — ${e.message}`,
    );
    expect(LOCAL_STACK_UNAVAILABLE_EXIT_CODE).not.toBe(1);
    expect(LOCAL_STACK_UNAVAILABLE_EXIT_CODE).not.toBe(0);
  });
});

describe("NEGATIVE CONTROL — a RESOLVED non-local target still refuses with the security code", () => {
  function expectRefusal(err: unknown): void {
    expect(err).toBeInstanceOf(NonLocalTargetError);
    expect(err).not.toBeInstanceOf(LocalStackUnavailableError);
    expect((err as Error).message).toContain(REFUSAL_CODE);
    expect((err as Error).message).toContain(
      "REFUSED_NON_LOCAL_E2E_SESSION_MINT",
    );
  }

  it("`supabase status` resolving the PRODUCTION URL refuses", () => {
    const run = runnerReturning({
      stdout: statusEnv({
        API_URL: PROD_URL,
        ANON_KEY: LOCAL_ANON,
        SERVICE_ROLE_KEY: LOCAL_SERVICE,
      }),
    });

    expectRefusal(
      thrown(() => resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run })),
    );
  });

  it("a resolved non-loopback URL refuses even when its keys are missing", () => {
    // The security question comes first: a resolved non-local URL is never
    // downgraded to "the stack is not running".
    const run = runnerReturning({
      stdout: statusEnv({ API_URL: "https://staging.example.com:54321" }),
    });

    expectRefusal(
      thrown(() => resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run })),
    );
  });

  it("a local URL carrying a PRODUCTION key refuses", () => {
    const run = runnerReturning({
      stdout: statusEnv({
        API_URL: LOCAL_URL,
        ANON_KEY: LOCAL_ANON,
        SERVICE_ROLE_KEY: PROD_SERVICE,
      }),
    });

    expectRefusal(
      thrown(() => resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run })),
    );
  });

  it("an explicit E2E_SUPABASE_* override at production refuses, without consulting the stack", () => {
    vi.stubEnv("E2E_SUPABASE_URL", PROD_URL);
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", LOCAL_ANON);
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", PROD_SERVICE);
    // Docker is off too — and it must not matter: the override resolved.
    const run = runnerReturning({ status: 1, stderr: DOCKER_OFF_STDERR });

    expectRefusal(
      thrown(() => resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run })),
    );
    expect(run).not.toHaveBeenCalled();
  });
});

describe("a running local stack still resolves", () => {
  it("resolves from `supabase status` and reports its source", () => {
    const run = runnerReturning({
      stdout: statusEnv({
        API_URL: LOCAL_URL,
        ANON_KEY: LOCAL_ANON,
        SERVICE_ROLE_KEY: LOCAL_SERVICE,
      }),
    });

    const env = resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run });
    expect(env.url).toBe(LOCAL_URL);
    expect(env.source).toBe("npx supabase status");
    expect(env.target.origin).toBe(LOCAL_URL);
  });

  it("a complete local override is used as-is, stack or no stack", () => {
    vi.stubEnv("E2E_SUPABASE_URL", LOCAL_URL);
    vi.stubEnv("E2E_SUPABASE_ANON_KEY", LOCAL_ANON);
    vi.stubEnv("E2E_SUPABASE_SERVICE_ROLE_KEY", LOCAL_SERVICE);
    const run = runnerReturning({ status: 1, stderr: DOCKER_OFF_STDERR });

    const env = resolveLocalSupabaseEnv(REPO_ROOT, { runStatus: run });
    expect(env.source).toBe("E2E_SUPABASE_* env");
    expect(run).not.toHaveBeenCalled();
  });
});

/**
 * The code only helps if every LOCAL INTEGRATION entry point prints it. These
 * are source pins, so an entry point that falls back to a generic "FAILED" or,
 * worse, to the security refusal, fails here rather than on a developer's PC.
 */
describe("every local-integration entry point reports unavailability by its code", () => {
  const SCRIPTS = join(__dirname, "..", "..", "scripts");
  const read = (f: string) => readFileSync(join(SCRIPTS, f), "utf8");

  for (const f of [
    "e2e-mint-session.ts",
    "e2e-local.ts",
    "dev-acceptance.ts",
    "db-fixtures-local.ts",
    "ux-evidence-seed.ts",
  ]) {
    it(`${f} prints the code and exits with the distinct exit code`, () => {
      const src = read(f);
      expect(src).toContain("LocalStackUnavailableError");
      expect(src).toContain("formatLocalStackUnavailable(");
      expect(src).toContain("LOCAL_STACK_UNAVAILABLE_EXIT_CODE");
    });
  }

  it("e2e-mint-session.ts: an unreachable local GoTrue is availability, and is handled before the refusal", () => {
    const src = read("e2e-mint-session.ts");
    expect(src).toMatch(
      /throw new LocalStackUnavailableError\(\s*`local GoTrue is not reachable/,
    );
    const unavailable = src.indexOf("err instanceof LocalStackUnavailableError");
    const refusal = src.indexOf("err instanceof NonLocalTargetError");
    expect(unavailable).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(unavailable);
  });

  it("owner-acceptance-walk.mjs mirrors the code, probes only the allowlisted origin, and preflights before a browser", () => {
    // Plain node cannot import the TypeScript constant, so the walk carries a
    // literal. This is what keeps the two from drifting apart.
    const src = read("owner-acceptance-walk.mjs");
    expect(src).toContain(
      `const LOCAL_STACK_UNAVAILABLE_CODE = "${LOCAL_STACK_UNAVAILABLE_CODE}";`,
    );
    expect(src).toContain(
      `process.exit(${LOCAL_STACK_UNAVAILABLE_EXIT_CODE});`,
    );
    // Fixed to an allowlisted local origin — never read from env.
    const origin = /const LOCAL_SUPABASE = "([^"]+)";/.exec(src)?.[1];
    expect(ALLOWED_LOCAL_ORIGINS).toContain(origin);

    const preflight = src.indexOf("unreachable(`${LOCAL_SUPABASE}");
    const launch = src.indexOf("chromium.launch(");
    expect(preflight).toBeGreaterThan(-1);
    expect(launch).toBeGreaterThan(preflight);
  });
});

/**
 * LOCAL HELPERS NEVER READ `.env.local` (the guard family behind #1845,
 * extended 2026-09-23).
 *
 * `apps/web/.env.local` points at PRODUCTION and carries a real service-role
 * key. A "local" helper that loads it inherits that target silently — which is
 * exactly what `scripts/e2e-seed-claims.ts` did: an orphan (no caller anywhere
 * in the repo) that upserted and deleted `profile_skill_claims` rows with the
 * service role, against whatever `.env.local` named. It was DELETED rather than
 * guarded, because nothing used it; this family now pins both facts.
 *
 * The scripts that DO read `.env.local` are the acknowledged PRODUCTION
 * OPERATOR scripts — deliberate, interactive, and not "local" in any sense.
 * That list is closed: a new `.env.local` reader anywhere under scripts/ fails
 * here until it is either routed through the local resolver or explicitly
 * acknowledged as a production operator tool.
 */
describe("local helpers never read .env.local", () => {
  const SCRIPTS = join(__dirname, "..", "..", "scripts");
  const read = (f: string) => readFileSync(join(SCRIPTS, f), "utf8");
  /** Executable text only: rationale comments are allowed to name the file. */
  const code = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const READS_ENV_LOCAL = /\.env\.local|loadEnvLocal|from\s+["']dotenv["']|require\(["']dotenv/;

  const LOCAL_HELPERS = [
    "e2e-mint-session.ts",
    "e2e-local.ts",
    "dev-acceptance.ts",
    "db-fixtures-local.ts",
    "ux-evidence-seed.ts",
  ];

  /** Deliberate production operator tools (interactive, owner-run). Closed. */
  const ACKNOWLEDGED_PRODUCTION_OPERATOR_SCRIPTS = new Set([
    "admin-grant-superadmin.ts",
    "admin-promote.ts",
    "emit-first-party-supply-feed.ts",
    "generate-activation-report.ts",
    "generate-pilot-owner-brief.ts",
    "vacancy-operator-run.ts",
  ]);

  for (const f of LOCAL_HELPERS) {
    it(`${f} has no .env.local read in executable code`, () => {
      expect(code(read(f))).not.toMatch(READS_ENV_LOCAL);
    });
  }

  it("e2e-seed-claims.ts (orphan service-role writer on .env.local) stays deleted", () => {
    expect(existsSync(join(SCRIPTS, "e2e-seed-claims.ts"))).toBe(false);
  });

  it("every .env.local reader under scripts/ is an acknowledged production operator tool", () => {
    const readers = readdirSync(SCRIPTS)
      .filter((f) => /\.(ts|mts|mjs|js)$/.test(f))
      .filter((f) => READS_ENV_LOCAL.test(code(read(f))));
    const unacknowledged = readers.filter(
      (f) => !ACKNOWLEDGED_PRODUCTION_OPERATOR_SCRIPTS.has(f),
    );
    expect(
      unacknowledged,
      "a script reads .env.local (production) and is neither a local helper " +
        "routed through resolveLocalSupabaseEnv nor an acknowledged production " +
        `operator tool: ${unacknowledged.join(", ")}`,
    ).toEqual([]);
    // ANTI-VACUITY: the acknowledged set is real — each entry still reads it.
    for (const f of ACKNOWLEDGED_PRODUCTION_OPERATOR_SCRIPTS) {
      expect(readers, `${f} no longer reads .env.local — drop it from the list`).toContain(f);
    }
  });

  it("NEGATIVE CONTROL — the pattern fires on the shape that was deleted", () => {
    const deleted =
      'const file = join(process.cwd(), ".env.local");\n' +
      "for (const raw of readFileSync(file, \"utf8\").split(/\\r?\\n/)) {}";
    expect(READS_ENV_LOCAL.test(code(deleted))).toBe(true);
    expect(READS_ENV_LOCAL.test(code('import "dotenv/config";\nrequire("dotenv")'))).toBe(true);
    // …and stays quiet on a comment that merely explains the rule.
    expect(READS_ENV_LOCAL.test(code("// never reads `.env.local`\nconst x = 1;"))).toBe(false);
    expect(READS_ENV_LOCAL.test(code("/* .env.local is production */\nconst x = 1;"))).toBe(false);
  });
});
