import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * FROZEN LEGACY FORK GUARD (Explainable Matching v1, Wagon 4 #4 —
 * conservative path per the consolidation safety directive 2026-07-16).
 *
 * lib/staffing/fit.ts (+ its match-preview pipeline) is a DUPLICATE
 * 5-dimension matching engine parallel to the canonical
 * lib/market/match-v1.ts. Decision: FREEZE, not delete — the /match-preview
 * marketing page has its own standalone intake schema and re-pointing it to
 * the canonical MatchNeed/MatchSubject shape is disproportionate for a
 * preview-only page. Removal is a recorded bounded cleanup.
 *
 * This guard makes the freeze structural:
 *   1. only the EXISTING callers may import the frozen modules — any NEW
 *      import fails the build;
 *   2. the deprecation headers must stay in place;
 *   3. the fork must never grow a new dimension (fixed dimension list).
 */

const APP = join(__dirname, "..", "..");

/** The ONLY files allowed to reference the frozen modules (posix rel paths). */
const ALLOWED_IMPORTERS: Record<string, readonly string[]> = {
  // engine itself + its own tests + the frozen preview pipeline
  "lib/staffing/fit": [
    "lib/staffing/fit.ts",
    "lib/staffing/fit.test.ts",
    "lib/staffing/match-preview.ts",
  ],
  "lib/staffing/match-preview": [
    "lib/staffing/match-preview.ts",
    "lib/staffing/match-preview.test.ts",
    "lib/staffing/match-preview-actions.ts",
  ],
  "lib/staffing/match-preview-actions": [
    "lib/staffing/match-preview-actions.ts",
    "components/app/match-preview-form.tsx",
  ],
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    if (f === "node_modules" || f === ".next") continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(p)) acc.push(p);
  }
  return acc;
}

const SOURCE_FILES = [
  ...walk(join(APP, "app")),
  ...walk(join(APP, "components")),
  ...walk(join(APP, "lib")),
];

/** Import specifiers that resolve to the frozen module (alias or relative). */
function importsFrozenModule(source: string, moduleKey: string): boolean {
  const short = moduleKey.split("/").pop() as string; // e.g. "fit"
  const aliasRe = new RegExp(`from\\s+["']@/${moduleKey}["']`);
  // relative import inside lib/staffing (e.g. `from "./fit"`)
  const relRe = new RegExp(`from\\s+["']\\./${short}["']`);
  return aliasRe.test(source) || relRe.test(source);
}

describe("legacy staffing fit fork is frozen (no NEW imports, ever)", () => {
  for (const [moduleKey, allowed] of Object.entries(ALLOWED_IMPORTERS)) {
    it(`${moduleKey} is imported ONLY by its existing callers`, () => {
      for (const file of SOURCE_FILES) {
        const rel = relative(APP, file).replace(/\\/g, "/");
        if (allowed.includes(rel)) continue;
        const source = readFileSync(file, "utf8");
        // Relative-import detection only applies within lib/staffing.
        const isSibling = rel.startsWith("lib/staffing/");
        const hit = isSibling
          ? importsFrozenModule(source, moduleKey)
          : new RegExp(`from\\s+["']@/${moduleKey}["']`).test(source);
        expect(
          hit,
          `${rel} imports frozen ${moduleKey} — new imports are banned; ` +
            `use lib/market/match-v1.ts (canonical engine) instead`,
        ).toBe(false);
      }
    });
  }

  it("the deprecation headers stay in place", () => {
    for (const rel of [
      "lib/staffing/fit.ts",
      "lib/staffing/match-preview.ts",
      "lib/staffing/match-preview-actions.ts",
    ]) {
      const src = readFileSync(join(APP, rel), "utf8");
      expect(src, `${rel} lost its DEPRECATED header`).toMatch(
        /DEPRECATED — FROZEN LEGACY FORK/,
      );
      expect(src, `${rel} must point to the canonical engine`).toMatch(
        /lib\/market\/match-v1\.ts/,
      );
    }
  });

  it("the fork never grows a new dimension (frozen 5-dimension list)", () => {
    const src = readFileSync(join(APP, "lib", "staffing", "fit.ts"), "utf8");
    const m = src.match(/FIT_DIMENSIONS = \[([\s\S]*?)\]/);
    expect(m).toBeTruthy();
    const dims = [...(m as RegExpMatchArray)[1].matchAll(/"([a-z_]+)"/g)].map(
      (x) => x[1],
    );
    expect(dims).toEqual([
      "profession",
      "accommodation",
      "transport",
      "language",
      "start_date",
    ]);
  });
});
