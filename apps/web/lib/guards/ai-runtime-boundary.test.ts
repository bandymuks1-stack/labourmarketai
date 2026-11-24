/**
 * Guard — ONE CANONICAL AI RUNTIME BOUNDARY.
 *
 * AI Runtime Consolidation Plan v1 (docs/plans/ai-runtime-consolidation-plan-v1.md),
 * Phases 0–3. Two AI stacks exist in this repo: the LIVE runtime and a
 * permanently inert LEGACY assist island. Before Phase 1 they shared exactly one
 * symbol (`AI_MODEL_CANDIDATES`). Phase 1 moved it into the runtime; this guard
 * makes the resulting separation permanent instead of a fact someone has to
 * re-derive.
 *
 * It pins four properties:
 *
 *   (a) FREEZE — the legacy island is EXACTLY the files listed in LEGACY_ISLAND.
 *       A new file may not join it, and an existing one may not vanish silently
 *       (Phases 4–6, which move or delete the island, are owner-gated and must
 *       edit this list deliberately).
 *
 *   (b) FREEZE — only the allowlisted importers may import a legacy island
 *       module. A NEW module importing `lib/ai/provider`, `lib/ai/noop-provider`,
 *       `lib/config/ai`, `lib/ai/types` or `lib/ai/legacy-assist-schemas` fails
 *       here. New AI work belongs on the canonical runtime.
 *
 *   (c) BOUNDARY — NO module under `lib/ai/runtime/` may import a legacy island
 *       module, and no legacy island module may import from `lib/ai/runtime/`.
 *       Zero symbols cross, in either direction.
 *
 *   (d) CANONICAL ENTRYPOINT — product code reaches the runtime through
 *       `runAiAgent()` / `runAiAgentCore()`, never by constructing a provider
 *       adapter directly.
 *
 * WHAT THIS GUARD IS NOT: it does not assert AI is disabled (that is
 * `ai-readiness.test.ts`), does not pin model choice (`ai-task-routing.test.ts`),
 * and does not check the SDK import site (`no-direct-llm-client-call.test.ts`).
 * It pins STRUCTURE only, so it stays true whether AI is on or off.
 *
 * Pure source assertions. No IO beyond reading repo files.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(APP_ROOT, p), "utf8");
/** Strip block + line comments so scans check real CODE only. */
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (/\.tsx?$/.test(abs)) acc.push(abs);
  }
  return acc;
}
const rel = (abs: string) => abs.slice(APP_ROOT.length + 1).replace(/\\/g, "/");
const isTest = (r: string) => /\.test\.tsx?$/.test(r) || r.startsWith("lib/guards/");

// ── The two stacks ─────────────────────────────────────────────────────────

/** The LEGACY assist island — frozen. Plan §1.3. */
const LEGACY_ISLAND = [
  "lib/config/ai.ts",
  "lib/ai/provider.ts",
  "lib/ai/noop-provider.ts",
  "lib/ai/types.ts",
  "lib/ai/legacy-assist-schemas.ts",
  "lib/ai/estimate-clarify-actions.ts",
] as const;

/** Module specifiers that resolve to a legacy island module. */
const LEGACY_SPECIFIERS = [
  "@/lib/config/ai",
  "@/lib/ai/provider",
  "@/lib/ai/noop-provider",
  "@/lib/ai/types",
  "@/lib/ai/legacy-assist-schemas",
  "@/lib/ai/estimate-clarify-actions",
] as const;

/**
 * The ONLY modules allowed to import the island. Everything here existed when
 * the freeze was applied; the list may shrink (Phases 4–6) but must not grow.
 */
const ALLOWED_LEGACY_IMPORTERS = [
  // inside the island itself
  "lib/ai/provider.ts",
  "lib/ai/noop-provider.ts",
  "lib/ai/estimate-clarify-actions.ts",
  // the island's single UI surface
  "components/app/estimate-clarify-assist.tsx",
] as const;

const RUNTIME_PREFIX = "lib/ai/runtime/";

/** Does this source import any legacy island module? Returns the specifiers. */
function legacyImportsIn(src: string): string[] {
  const body = code(src);
  return LEGACY_SPECIFIERS.filter((spec) => {
    // "@/lib/ai/types" must not match "@/lib/ai/types-something".
    const re = new RegExp(
      `from\\s+["']${spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
    );
    return re.test(body);
  });
}

// ── (a) the island is exactly what we froze ────────────────────────────────

describe("(a) the legacy AI island is frozen at its declared members", () => {
  for (const f of LEGACY_ISLAND) {
    it(`${f} still exists`, () => {
      expect(existsSync(join(APP_ROOT, f)), `${f} is gone — Phases 4-6 are owner-gated; update LEGACY_ISLAND deliberately`).toBe(true);
    });
  }

  it("lib/ai/schemas.ts no longer exists (Phase 3 resolved the name collision)", () => {
    expect(existsSync(join(APP_ROOT, "lib/ai/schemas.ts"))).toBe(false);
    // the canonical output contract lives in the DIRECTORY of that name
    expect(existsSync(join(APP_ROOT, "lib/ai/schemas/envelope.ts"))).toBe(true);
  });
});

// ── (b) no NEW importer of the island ──────────────────────────────────────

describe("(b) only the allowlisted modules import the legacy AI island", () => {
  it("no unexpected importer", () => {
    const offenders: string[] = [];
    for (const dir of ["lib", "app", "components"]) {
      for (const abs of walk(join(APP_ROOT, dir))) {
        const r = rel(abs);
        if (isTest(r)) continue; // tests may reference the island to pin it
        if ((LEGACY_ISLAND as readonly string[]).includes(r)) continue;
        if ((ALLOWED_LEGACY_IMPORTERS as readonly string[]).includes(r)) continue;
        const hits = legacyImportsIn(read(r));
        if (hits.length) offenders.push(`${r} -> ${hits.join(", ")}`);
      }
    }
    expect(
      offenders,
      `new legacy-AI importer(s). New AI work belongs on the canonical runtime\n(runAiAgent in lib/ai/run-agent-server.ts):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

// ── (c) ZERO symbols cross the boundary, both directions ───────────────────

describe("(c) the runtime and the legacy island share nothing", () => {
  it("no lib/ai/runtime module imports a legacy island module", () => {
    const offenders: string[] = [];
    for (const abs of walk(join(APP_ROOT, RUNTIME_PREFIX))) {
      const r = rel(abs);
      if (/\.test\.tsx?$/.test(r)) continue;
      const hits = legacyImportsIn(read(r));
      if (hits.length) offenders.push(`${r} -> ${hits.join(", ")}`);
    }
    expect(
      offenders,
      `the runtime reached into the legacy island — Phase 1 removed the last such\nedge (AI_MODEL_CANDIDATES); it must not come back:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("no legacy island module imports from lib/ai/runtime", () => {
    const offenders: string[] = [];
    for (const f of LEGACY_ISLAND) {
      if (!existsSync(join(APP_ROOT, f))) continue;
      const body = code(read(f));
      if (/from\s+["'](?:@\/lib\/ai\/runtime|\.\.?\/(?:\.\.\/)*runtime)\//.test(body)) {
        offenders.push(f);
      }
    }
    expect(offenders, `legacy island imported the runtime:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("AI_MODEL_CANDIDATES is defined once, inside the runtime", () => {
    const definers: string[] = [];
    for (const dir of ["lib", "app", "components"]) {
      for (const abs of walk(join(APP_ROOT, dir))) {
        const r = rel(abs);
        if (isTest(r)) continue;
        if (/export\s+const\s+AI_MODEL_CANDIDATES\b/.test(code(read(r)))) definers.push(r);
      }
    }
    expect(definers).toEqual(["lib/ai/runtime/model-candidates.ts"]);
  });

  it("AiLocale is declared independently on each side, never imported across", () => {
    // Two identical declarations are DELIBERATE: importing one from the other
    // would re-create the coupling Phase 1 removed. See lib/ai/types.ts header.
    expect(/export\s+type\s+AiLocale\b/.test(read("lib/ai/types.ts"))).toBe(true);
    expect(/export\s+type\s+AiLocale\b/.test(read("lib/ai/runtime/types.ts"))).toBe(true);
    expect(legacyImportsIn(read("lib/ai/runtime/types.ts"))).toEqual([]);
  });
});

// ── (d) the canonical entrypoint is the way in ─────────────────────────────

describe("(d) product code enters the runtime through the canonical entrypoint", () => {
  it("no module outside lib/ai constructs a provider adapter directly", () => {
    const ADAPTER = /\b(?:anthropic|openai|gemini|xai|deepl|mock|disabled)CompletionProvider\b/;
    const offenders: string[] = [];
    for (const dir of ["lib", "app", "components"]) {
      for (const abs of walk(join(APP_ROOT, dir))) {
        const r = rel(abs);
        if (isTest(r) || r.startsWith("lib/ai/")) continue;
        if (ADAPTER.test(code(read(r)))) offenders.push(r);
      }
    }
    expect(
      offenders,
      `provider adapter used outside lib/ai — go through runAiAgent()\n(lib/ai/run-agent-server.ts) instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the canonical entrypoint exists and is the documented one", () => {
    const src = read("lib/ai/run-agent-server.ts");
    expect(/export\s+async\s+function\s+runAiAgent\b/.test(src)).toBe(true);
  });
});

// ── detector self-tests (a guard that cannot fail is not a guard) ──────────

describe("the detectors are real", () => {
  it("legacyImportsIn catches a legacy import and ignores a lookalike", () => {
    expect(legacyImportsIn('import { x } from "@/lib/ai/provider";')).toEqual([
      "@/lib/ai/provider",
    ]);
    expect(legacyImportsIn('import { x } from "@/lib/ai/types";')).toEqual([
      "@/lib/ai/types",
    ]);
    // a longer path that merely starts the same must NOT match
    expect(legacyImportsIn('import { x } from "@/lib/ai/types-extra";')).toEqual([]);
    expect(legacyImportsIn('import { x } from "@/lib/ai/runtime/types";')).toEqual([]);
    // a commented-out import must NOT match
    expect(legacyImportsIn('// import { x } from "@/lib/ai/provider";')).toEqual([]);
  });
});
