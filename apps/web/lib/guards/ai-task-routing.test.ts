/**
 * Guard — AI TASK ROUTING (Labour Market OS P8–P9).
 *
 * Pins the cost-aware routing layer's boundaries:
 *   (a) no product code outside lib/ai/runtime references AI_MODEL_CANDIDATES
 *       or a raw model id literal ("claude-…", "gpt-…") — model choice lives
 *       ONLY in the routing layer. Since AI Runtime Consolidation Plan v1
 *       Phase 1 the candidate table is lib/ai/runtime/model-candidates.ts, so
 *       lib/ai/runtime/ is the WHOLE allowlist and the legacy assist island
 *       carries no model id either;
 *   (b) TASK_POLICIES exists and covers every AiTaskType;
 *   (c) providers/anthropic.ts stays the ONLY LLM SDK importer;
 *   (d) no provider adapter other than anthropic is ever "active" (fetch-based
 *       adapters are "wired_env_gated" — real wire, inert without env);
 *   (e) the routing + adapter modules stay PURE (no server-only / env / fetch);
 *   (f) the external provider API hosts (api.openai.com / api.deepl.com /
 *       generativelanguage.googleapis.com / api.x.ai) appear ONLY under
 *       lib/ai/runtime/providers/ — business logic never calls a vendor.
 *
 * Pure source assertions. Runs in CI via `pnpm -F web test`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  AI_TASK_TYPES,
  TASK_POLICIES,
} from "../ai/runtime/task-routing";
import { PROVIDER_ADAPTER_REGISTRY } from "../ai/runtime/providers/adapter-contract";

const APP_ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(p, "utf8");
/**
 * Strip block + line comments so scans check real CODE only.
 *
 * THE `//` IN A URL IS NOT A COMMENT — and getting this wrong disabled check
 * (f) below completely. The previous pattern — match a double slash then
 * everything to end of line — deleted the rest of any line holding a URL, so
 * `const U = "https://api.openai.com/v1/chat/completions"` reduced to
 * `const U = "https:` and the host scan found nothing. The guard reported
 * green for the one thing it exists to prevent, and its own detector self-test
 * agreed — because that self-test ran the regex against a RAW string and never
 * through this function.
 *
 * Requiring the `//` not to be preceded by `:` keeps a URL intact while still
 * removing a real `// comment`. The self-test at the bottom now runs THROUGH
 * this function, which is the only version of it that could have caught this.
 */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(abs)) acc.push(abs);
  }
  return acc;
}

const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");

// ── (a) model choice lives only in the routing layer ───────────────────────

// ONLY the runtime (routing/config/providers, including the candidate table at
// lib/ai/runtime/model-candidates.ts) may carry model ids. NOTHING else may.
//
// AI Runtime Consolidation Plan v1 Phase 1 moved AI_MODEL_CANDIDATES out of
// lib/ai/types.ts into lib/ai/runtime/model-candidates.ts, so this allowlist no
// longer needs the legacy-boundary exception. The guard is now strictly
// stronger: model choice cannot leak into ANY module outside the routing layer,
// the legacy assist island included.
const MODEL_ALLOWLIST_PREFIXES = ["lib/ai/runtime/"];
const MODEL_LITERAL = /["'`](?:claude-|gpt-)[A-Za-z0-9._-]*["'`]/;

describe("(a) no product code outside lib/ai/runtime picks a model", () => {
  it("no reference to AI_MODEL_CANDIDATES or a raw model id literal outside the allowlist", () => {
    const offenders: string[] = [];
    for (const dir of ["lib", "app", "components"].map((d) => join(APP_ROOT, d))) {
      for (const file of walk(dir)) {
        if (/\.test\.tsx?$/.test(file)) continue; // tests may quote patterns
        const r = rel(file);
        if (MODEL_ALLOWLIST_PREFIXES.some((p) => r === p || r.startsWith(p))) continue;
        const src = code(read(file));
        if (/AI_MODEL_CANDIDATES/.test(src) || MODEL_LITERAL.test(src)) {
          offenders.push(r);
        }
      }
    }
    expect(
      offenders,
      `model selection leaked outside lib/ai/runtime:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the detector is real", () => {
    expect(MODEL_LITERAL.test('const m = "claude-opus-4-8";')).toBe(true);
    expect(MODEL_LITERAL.test('const m = "gpt-4o";')).toBe(true);
    expect(MODEL_LITERAL.test('const m = "not-a-model";')).toBe(false);
  });
});

// ── (b) TASK_POLICIES covers every task type ────────────────────────────────

describe("(b) TASK_POLICIES exists and covers every AiTaskType", () => {
  it("has a policy for each of the 10 task types", () => {
    expect(AI_TASK_TYPES.length).toBe(10);
    for (const t of AI_TASK_TYPES) {
      expect(TASK_POLICIES[t], `missing policy for ${t}`).toBeDefined();
      expect(TASK_POLICIES[t].taskType).toBe(t);
    }
  });
});

// ── (c) single SDK importer (pattern shared with ai-readiness.test.ts) ─────

const LLM_SDK_IMPORT =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["'](?:@anthropic-ai\/sdk|openai)(?:\/[^"']*)?["']/;
const SDK_ADAPTER_ALLOWLIST = ["lib/ai/runtime/providers/anthropic.ts"];

describe("(c) providers/anthropic.ts remains the only SDK importer", () => {
  it("no lib source imports an LLM SDK outside the allowlisted adapter", () => {
    const offenders: string[] = [];
    for (const file of walk(join(APP_ROOT, "lib"))) {
      if (/\.test\.tsx?$/.test(file)) continue;
      if (!LLM_SDK_IMPORT.test(read(file))) continue;
      const r = rel(file);
      if (!SDK_ADAPTER_ALLOWLIST.includes(r)) offenders.push(r);
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

// ── (d) no adapter other than anthropic is active ──────────────────────────

describe("(d) adapter registry — anthropic is the only active adapter", () => {
  it("every non-anthropic adapter is wired_env_gated, declared_inactive or unavailable", () => {
    for (const a of PROVIDER_ADAPTER_REGISTRY) {
      if (a.id === "anthropic") {
        expect(a.status).toBe("active");
      } else {
        expect(
          ["wired_env_gated", "declared_inactive", "unavailable"],
          a.id,
        ).toContain(a.status);
      }
    }
  });
});

// ── (f) provider API hosts are pinned to runtime/providers/* ───────────────

// The fetch-based adapters are the ONLY files that may reference the external
// provider API hosts — business logic can never call a vendor directly.
const PROVIDER_HOSTS =
  /api\.openai\.com|api\.deepl\.com|api-free\.deepl\.com|generativelanguage\.googleapis\.com|api\.x\.ai/;
const PROVIDER_HOST_ALLOWLIST_PREFIX = "lib/ai/runtime/providers/";

describe("(f) provider API hosts appear ONLY under lib/ai/runtime/providers", () => {
  it("no file outside runtime/providers references a provider API host", () => {
    const offenders: string[] = [];
    for (const dir of ["lib", "app", "components"].map((d) => join(APP_ROOT, d))) {
      for (const file of walk(dir)) {
        if (/\.test\.tsx?$/.test(file)) continue; // guards may quote hosts
        const r = rel(file);
        if (r.startsWith(PROVIDER_HOST_ALLOWLIST_PREFIX)) continue;
        if (PROVIDER_HOSTS.test(code(read(file)))) offenders.push(r);
      }
    }
    expect(
      offenders,
      `provider API host referenced outside runtime/providers:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the detector survives the comment stripper (regression)", () => {
    // THE TEST THAT WAS MISSING. Every assertion below used to run the regex
    // against a raw literal, so it proved the regex worked and proved nothing
    // about the scan — which fed the regex `code(read(file))`. A real
    // hardcoded vendor URL was invisible to check (f) for as long as that was
    // true. Scanning goes through `code()`, so the detector self-test must too.
    const realLeak =
      'const ENDPOINT = "https://api.openai.com/v1/chat/completions";';
    expect(PROVIDER_HOSTS.test(code(realLeak))).toBe(true);
    // A commented-out mention is still correctly ignored.
    expect(PROVIDER_HOSTS.test(code("// talks about api.openai.com"))).toBe(false);
    expect(PROVIDER_HOSTS.test(code("/* api.deepl.com in prose */"))).toBe(false);
  });

  it("the detector is real", () => {
    expect(PROVIDER_HOSTS.test("https://api.openai.com/v1/chat/completions")).toBe(true);
    expect(PROVIDER_HOSTS.test("https://api.deepl.com/v2/translate")).toBe(true);
    expect(PROVIDER_HOSTS.test("https://api-free.deepl.com/v2/translate")).toBe(true);
    expect(
      PROVIDER_HOSTS.test("https://generativelanguage.googleapis.com/v1beta/models"),
    ).toBe(true);
    expect(PROVIDER_HOSTS.test("https://api.x.ai/v1/chat/completions")).toBe(true);
    expect(PROVIDER_HOSTS.test("https://example.com/api")).toBe(false);
  });
});

// ── (e) the routing + adapter modules stay pure ────────────────────────────

const PURE_MODULES = [
  "lib/ai/runtime/task-routing.ts",
  "lib/ai/runtime/providers/adapter-contract.ts",
];

describe("(e) task-routing and adapter-contract are pure modules", () => {
  it.each(PURE_MODULES)("%s has no server-only / env / fetch / SDK", (r) => {
    const abs = join(APP_ROOT, r);
    expect(existsSync(abs), `${r} missing`).toBe(true);
    const src = code(read(abs));
    expect(/["']server-only["']/.test(src), "server-only").toBe(false);
    expect(/process\.env/.test(src), "process.env").toBe(false);
    expect(/\bfetch\s*\(|XMLHttpRequest|node:https?/.test(src), "network").toBe(false);
    expect(LLM_SDK_IMPORT.test(src), "sdk import").toBe(false);
  });
});
