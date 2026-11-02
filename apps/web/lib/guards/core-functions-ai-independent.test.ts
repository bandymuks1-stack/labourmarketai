/**
 * Guard — THE CORE FUNCTIONS DO NOT NEED AI (owner P0-E, 2026-10-30).
 *
 * Budget for paid AI APIs is 0 EUR, and a free quota can run out, rate-limit or
 * answer with garbage at any moment. The product must keep working when that
 * happens. This guard proves it STRUCTURALLY for the deterministic core:
 *
 *   Work Journal save · hours · Living CV (confirmed data) · job offers ·
 *   worker search · need submission · interest · deterministic matching
 *
 * For every entry module below it walks the full transitive graph of RUNTIME
 * imports (static `import`/`export … from` and dynamic `import()`; `import type`
 * is erased at build time and ignored) and asserts that no module of the AI
 * runtime (`lib/ai/**`) is reachable. A function that cannot reach the AI
 * runtime cannot be broken by it: provider down, 429, quota exhausted, a
 * malformed answer or `AI_PROVIDER_MODE=disabled` all leave it untouched.
 *
 * The isolated CI stack (`.github/workflows/signup-isolated.yml`, which runs
 * with AI_PROVIDER_MODE=disabled) proves the same functions end-to-end; this
 * guard keeps that true for every future change, on every PR, without a DB.
 *
 * Two core paths DO meet the runtime, through optional enrichment that runs
 * after (or beside) the deterministic answer: the vacancy translation reader
 * and the public need form's AI draft. They are the only allowed SEAMS
 * (`DEGRADING_SEAMS`), each pinned to a test that drives disabled / 429 /
 * malformed / throwing providers through it. A NEW path from the core into
 * `lib/ai/**` fails here until it is proven to degrade and listed.
 *
 * The AI-ASSISTED surfaces (CV structuring, journal suggestions, match
 * explanation, need drafting, market explanation, translation, chat intent) are
 * separate entry points by design; their degradation on provider failure is
 * proven in `lib/ai/runtime/*.test.ts` (chain-dispatch, free-tier-chain,
 * paid-budget, provider-cooldown).
 *
 * Pure source assertions. No IO beyond reading repo files.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const WEB_ROOT = resolve(__dirname, "..", "..");

/** Core function → its server entry modules (relative to apps/web). */
const CORE_FUNCTIONS: Readonly<Record<string, readonly string[]>> = {
  "Work Journal save": ["lib/journal/actions.ts", "lib/journal/journal-write-core.ts"],
  hours: [
    "lib/journal/hours-ledger.ts",
    "lib/journal/work-time.ts",
    "lib/journal/professional-experience.ts",
  ],
  "Living CV (confirmed data)": [
    "lib/journal/professional-experience-read.ts",
    "lib/journal/confirm-actions.ts",
    "lib/cv-export/verified-cv.ts",
  ],
  "job offers": [
    "lib/opportunities/load-worker-opportunities.ts",
    "lib/opportunities/opportunities-view.ts",
  ],
  "worker search": ["lib/staffing/candidate-pool.ts", "lib/staffing/candidate-pool-core.ts"],
  "need submission": [
    "lib/staffing/company-need-form-actions.ts",
    "lib/staffing/company-need-public-intake.ts",
  ],
  interest: [
    "lib/opportunities/interest-actions.ts",
    "lib/opportunities/interest.ts",
    "lib/opportunities/vacancy-interest-actions.ts",
  ],
  "deterministic matching": [
    "lib/staffing/fit.ts",
    "lib/opportunities/fit-band.ts",
    "lib/opportunities/opportunity-fit.ts",
    "lib/opportunities/formal-requirements.ts",
  ],
};

/** The AI runtime — reaching any of it means a provider failure could reach the core. */
function isAiModule(rel: string): boolean {
  return rel.startsWith("lib/ai/");
}

/**
 * The ONLY places a core path may touch the AI runtime: optional enrichment
 * whose result is never load-bearing, each with the test that proves the core
 * answer survives the provider failing.
 */
const DEGRADING_SEAMS: Readonly<Record<string, { fallback: string; test: string }>> = {
  // Job offers / interest reach the vacancy store; the board reads STORED
  // renderings only (storedVacancyTitles). The vendor call is the reader's
  // explicit "translate this ad" request, and every failure keeps the original.
  "lib/vacancy-store/vacancy-translation-read.ts": {
    fallback: "original publisher text; nothing stored, nothing charged",
    test: "lib/vacancy-store/vacancy-translation-degrade.test.ts",
  },
  // Need submission stores the need FIRST; the AI vacancy draft runs after and
  // is optional. Disabled / 429 / malformed / throw → stored need, no draft.
  "lib/staffing/company-need-form-actions.ts": {
    fallback: "need stored; draftStatus 'disabled' / 'needs_review'",
    test: "lib/staffing/company-need-form-actions.test.ts",
  },
  "lib/staffing/company-need-actions.ts": {
    fallback: "the draft call itself — wrapped by the form action's catch",
    test: "lib/staffing/company-need-form-actions.test.ts",
  },
  "lib/staffing/company-need.ts": {
    fallback: "imports the agent's input schema only (pure zod), no provider call",
    test: "lib/staffing/company-need-form-actions.test.ts",
  },
};

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function resolveFile(base: string): string | null {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const ext of EXTENSIONS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTENSIONS) {
    const idx = join(base, `index${ext}`);
    if (existsSync(idx)) return idx;
  }
  return null;
}

/** Strip comments so an example in a doc comment is never read as an import. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Runtime import specifiers of one file (type-only imports/exports excluded). */
export function runtimeSpecifiers(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];
  const stmt = /\b(import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of code.matchAll(stmt)) {
    if (m[2]) continue; // `import type … from` / `export type … from`
    const clause = m[3].trim();
    // `import { type A, type B } from` — every binding type-only → erased.
    const braced = /^\{([\s\S]*)\}$/.exec(clause);
    if (braced) {
      const names = braced[1].split(",").map((s) => s.trim()).filter(Boolean);
      if (names.length > 0 && names.every((n) => n.startsWith("type "))) continue;
    }
    out.push(m[4]);
  }
  for (const m of code.matchAll(/\bimport\s*["']([^"']+)["']/g)) out.push(m[1]);
  for (const m of code.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) out.push(m[1]);
  return out;
}

function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (spec.startsWith("@/")) return resolveFile(join(WEB_ROOT, spec.slice(2)));
  if (spec.startsWith(".")) return resolveFile(resolve(dirname(fromFile), spec));
  return null; // a package — outside the repo graph
}

/**
 * BFS over runtime imports, stopping AT the AI runtime: returns every reached
 * repo file (with one parent, for a readable path) and every SEAM — a non-AI
 * module that imports a `lib/ai/**` module directly.
 */
function walk(entries: readonly string[]): {
  parent: Map<string, string | null>;
  seams: Map<string, string[]>;
} {
  const parent = new Map<string, string | null>();
  const seams = new Map<string, string[]>();
  const queue: string[] = [];
  for (const e of entries) {
    const abs = resolveFile(join(WEB_ROOT, e));
    if (!abs) throw new Error(`core entry module is missing: ${e} — update CORE_FUNCTIONS`);
    parent.set(abs, null);
    queue.push(abs);
  }
  while (queue.length > 0) {
    const file = queue.shift()!;
    for (const spec of runtimeSpecifiers(readFileSync(file, "utf8"))) {
      const dep = resolveSpecifier(file, spec);
      if (!dep) continue;
      if (isAiModule(rel(dep))) {
        const list = seams.get(rel(file)) ?? [];
        if (!list.includes(rel(dep))) list.push(rel(dep));
        seams.set(rel(file), list);
        continue; // never walk INTO the runtime — the seam is what matters
      }
      if (parent.has(dep)) continue;
      parent.set(dep, file);
      queue.push(dep);
    }
  }
  return { parent, seams };
}

const rel = (abs: string) => relative(WEB_ROOT, abs).replace(/\\/g, "/");

function chainTo(parent: Map<string, string | null>, relFile: string): string {
  const abs = [...parent.keys()].find((k) => rel(k) === relFile);
  const path: string[] = [];
  for (let cur: string | null = abs ?? null; cur; cur = parent.get(cur) ?? null) path.unshift(rel(cur));
  return path.join(" → ");
}

describe("the deterministic core only meets AI through a seam that degrades", () => {
  for (const [fn, entries] of Object.entries(CORE_FUNCTIONS)) {
    it(`${fn}: every path into lib/ai/** is a degrading seam`, () => {
      const { parent, seams } = walk(entries);
      const unexpected = [...seams.keys()]
        .filter((importer) => !(importer in DEGRADING_SEAMS))
        .map((importer) => `${chainTo(parent, importer)} ⇒ ${seams.get(importer)!.join(", ")}`);
      expect(unexpected).toEqual([]);
      // Sanity: the walk really followed imports (an empty graph proves nothing).
      expect(parent.size).toBeGreaterThanOrEqual(entries.length);
    });
  }

  it("every degrading seam names a fallback test that exists", () => {
    for (const [seam, proof] of Object.entries(DEGRADING_SEAMS)) {
      expect(existsSync(join(WEB_ROOT, seam)), seam).toBe(true);
      expect(existsSync(join(WEB_ROOT, proof.test)), `${seam} → ${proof.test}`).toBe(true);
    }
  });
});

describe("the walker itself (negative controls)", () => {
  it("DOES see an AI-assisted surface as a seam", () => {
    const { seams } = walk(["lib/journal/journal-ai-suggestions-actions.ts"]);
    expect(seams.has("lib/journal/journal-ai-suggestions-actions.ts")).toBe(true);
  });

  it("ignores type-only imports and comments, keeps runtime and dynamic ones", () => {
    const src = [
      'import type { A } from "@/lib/ai/runtime/types";',
      'import { type B, type C } from "@/lib/ai/schemas/envelope";',
      '// import { x } from "@/lib/ai/run-agent-server";',
      'import { real } from "./real";',
      'export { again } from "../again";',
      'const lazy = await import("@/lib/lazy");',
      'import "./side-effect";',
    ].join("\n");
    expect(runtimeSpecifiers(src).sort()).toEqual(
      ["../again", "./real", "./side-effect", "@/lib/lazy"].sort(),
    );
  });
});
