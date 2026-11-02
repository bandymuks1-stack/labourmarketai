import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildSample, readSystemFiles, RUNTIME_SAMPLE_COLUMNS, type RawReading } from "@/lib/ops/runtime-sampler";

/**
 * RUNTIME STALL SAMPLER — NUMBERS ONLY, SERVICE ROLE ONLY (P0 2026-10-23).
 *
 * `public.ops_runtime_samples` is written from inside every server process
 * once a minute. It exists to diagnose origin stalls, and it must never become
 * a place where an identifier, an address, a path or an env value lands —
 * not now and not after the next "let's also record X" edit. This guard pins:
 *
 *  1. the row the code builds and the table's columns are the SAME set;
 *  2. no column is named like an identifier (user, profile, ip, url, path …);
 *  3. the only text columns are the per-process hex id and the build sha, and
 *     the database itself CHECK-constrains both to lowercase hex;
 *  4. the table is RLS-on, policy-free, and granted to service_role alone;
 *  5. the sampler reads only an allow-listed set of env keys, never touches a
 *     request, and is started from instrumentation for the Node runtime only;
 *  6. every value in a built row is a number, boolean or null, except the
 *     timestamp and the two hex strings.
 */

const ROOT = join(__dirname, "..", "..");
const REPO = join(ROOT, "..", "..");
const MIGRATION = "20261023190000_ops_runtime_samples_v1";
const sql = readFileSync(join(REPO, "supabase", "migrations", `${MIGRATION}.sql`), "utf8").replace(/\r/g, "");
const code = sql.replace(/--[^\n]*/g, "");
const core = readFileSync(join(ROOT, "lib", "ops", "runtime-sampler.ts"), "utf8");
const node = readFileSync(join(ROOT, "lib", "ops", "runtime-sampler-node.ts"), "utf8");
const instrumentation = readFileSync(join(ROOT, "instrumentation.ts"), "utf8");

function tableColumns(): { name: string; type: string; rest: string }[] {
  const m = /create table if not exists public\.ops_runtime_samples \(([\s\S]*?)\n\);/.exec(code);
  if (!m) throw new Error("create table public.ops_runtime_samples not found");
  return m[1]
    .split("\n")
    .map((l) => l.trim().replace(/,$/, ""))
    .filter(Boolean)
    .map((l) => {
      const [name, type, ...rest] = l.split(/\s+/);
      return { name, type, rest: rest.join(" ") };
    });
}

const IDENTIFIER_LIKE =
  /(^|_)(user_id|profile|worker|person|org|organization|company|email|phone|ip|addr|address|url|uri|path|route|name|token|key|secret|header|cookie|session|agent|referer|referrer|query|body|message|env)(_|$)/;

describe("ops_runtime_samples carries numbers only", () => {
  it("the row the sampler builds is exactly the table's columns (plus id / inserted_at)", () => {
    const cols = tableColumns().map((c) => c.name);
    expect(cols.filter((c) => c !== "id" && c !== "inserted_at")).toEqual([...RUNTIME_SAMPLE_COLUMNS]);
  });

  it("no column is named like an identifier", () => {
    const bad = tableColumns()
      .map((c) => c.name)
      .filter((n) => IDENTIFIER_LIKE.test(n));
    expect(bad).toEqual([]);
  });

  it("the only text columns are process_id and build_sha, both CHECK-constrained to hex", () => {
    const text = tableColumns().filter((c) => /^(text|varchar|character|jsonb?|bytea|inet|cidr|uuid)/i.test(c.type));
    expect(text.map((c) => c.name)).toEqual(["process_id", "build_sha"]);
    for (const c of text) expect(c.rest, c.name).toMatch(/check \([\s\S]*~ '\^\[0-9a-f\]\{\d+,\d+\}\$'\)/);
  });

  it("is RLS-on, policy-free and granted to service_role alone", () => {
    expect(code).toMatch(/alter table public\.ops_runtime_samples enable row level security;/);
    expect(code).not.toMatch(/create policy/i);
    expect(code).toMatch(/revoke all on table public\.ops_runtime_samples from public, anon, authenticated;/);
    const grants = [...code.matchAll(/grant\s+([^;]+?)\s+on\s+(?:table\s+)?public\.ops_runtime_samples\s+to\s+([^;]+);/gi)];
    expect(grants.map((g) => g[2].trim())).toEqual(["service_role"]);
    expect(grants[0][1].split(",").map((s) => s.trim()).sort()).toEqual(["delete", "insert", "select"]);
  });

  it("ships its paired rollback", () => {
    const down = readFileSync(join(REPO, "supabase", "rollbacks", `${MIGRATION}.down.sql`), "utf8");
    expect(down).toMatch(/drop table if exists public\.ops_runtime_samples;/);
  });
});

describe("the sampler code never reaches for identifiers", () => {
  it("reads only allow-listed env keys", () => {
    const allowed = new Set([
      "LM_RUNTIME_SAMPLER",
      "LM_RUNTIME_SAMPLER_PROBE",
      "NEXT_RUNTIME",
      "NEXT_PHASE",
      "VITEST",
      "NODE_ENV",
      "SUPABASE_SERVICE_ROLE_KEY",
      "VERCEL_GIT_COMMIT_SHA",
      "PORT",
    ]);
    const used = new Set([...(core + node).matchAll(/\benv\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]));
    expect([...used].filter((k) => !allowed.has(k))).toEqual([]);
    // SUPABASE_SERVICE_ROLE_KEY is only checked for presence; the value is
    // handed to the client by requireSupabaseServiceEnv(), never stored.
    expect(node).not.toMatch(/(?<!!)env\.SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("never touches a request, a header, an address or a hostname", () => {
    for (const src of [core, node]) {
      expect(src).not.toMatch(/\b(headers|remoteAddress|x-forwarded|req\.url|request\.url|os\.hostname|hostname\(\)|cookies)\b/);
    }
  });

  it("is started from instrumentation for the Node runtime only", () => {
    const reg = instrumentation.slice(instrumentation.indexOf("export async function register"));
    // Block form only: an early `return` leaves the node:* import in the edge
    // bundle and `next build` fails (measured 2026-10-23).
    expect(reg).toMatch(/if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{[\s\S]*import\("\.\/lib\/ops\/runtime-sampler-node"\)/);
    expect(reg).not.toMatch(/NEXT_RUNTIME !== "nodejs"\) return/);
  });

  it("a built row holds numbers, booleans and nulls — plus the timestamp and two hex strings", () => {
    const base: RawReading = {
      monoMs: 1,
      wallMs: Date.UTC(2026, 9, 23, 17, 1),
      uptimeS: 10,
      eld: { p50Ms: 1, p99Ms: 2, maxMs: 3 },
      elu: 0.5,
      cpuUserUs: 1000,
      cpuSystemUs: 1000,
      rss: 1,
      heapUsed: 1,
      external: 1,
      activeTcpHandles: 1,
      selfConnect: { ms: 1, failed: false },
      ...readSystemFiles(() => null),
    };
    const row = buildSample(base, { ...base, monoMs: 15_001 }, { processId: "abcdef0123456789", buildSha: "392850c8d" });
    for (const [k, v] of Object.entries(row)) {
      if (k === "sampled_at") expect(v).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      else if (k === "process_id" || k === "build_sha") expect(v).toMatch(/^[0-9a-f]+$/);
      else expect(v === null || typeof v === "number" || typeof v === "boolean", k).toBe(true);
    }
  });
});
