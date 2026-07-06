import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { colors } from "../../tokens/colors";
import preset from "../../tailwind-preset";

/**
 * Design-token class guard (root-cause audit PR3, 2026-07-06).
 *
 * Before this guard, 213 usages across 47 files referenced token-family
 * utility classes (`bg-surface-1`, `border-border-subtle`, …) that were never
 * defined in tokens/colors.ts — Tailwind silently emitted no CSS and the
 * affected cards rendered transparent with the preflight fallback border.
 * The break was invisible to typecheck, lint, and every existing guard.
 *
 * This test walks every UI source file, extracts every class that *claims* to
 * be a token-family color utility, and fails with an exact file list when one
 * does not resolve to a defined token path. New semantic families must be
 * added to tokens/colors.ts + tailwind-preset.ts, never invented inline.
 */

const root = join(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components"] as const;

// Every top-level family in the token map, e.g. "ink", "surface", "border".
const FAMILIES = Object.keys(colors);

// Flatten the token map into the exact utility suffixes Tailwind generates:
// { surface: { 1: … } } → "surface-1"; { border: { DEFAULT: … } } → "border".
function flattenTokenPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = key === "DEFAULT" ? prefix : prefix ? `${prefix}-${key}` : key;
    if (value && typeof value === "object") {
      return flattenTokenPaths(value as Record<string, unknown>, path);
    }
    return [path];
  });
}
const DEFINED = new Set(flattenTokenPaths(colors as unknown as Record<string, unknown>));

// bg-surface-1, hover:border-border/40, focus-visible:ring-brand-blue …
// The capture starts with a known family name, so width/side utilities like
// border-t-2 or plain words like "border-collapse" never match.
const CLASS_RE = new RegExp(
  String.raw`(?:^|[\s"'\`{:!])(?:bg|border|text|ring|divide|outline|from|via|to|fill|stroke|decoration|caret|accent|shadow)-(` +
    `(?:${FAMILIES.join("|")})(?:-[a-zA-Z0-9]+)*` +
    String.raw`)(?:/\d{1,3})?(?=[\s"'\`}:]|$)`,
  "g",
);

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((rel) => /\.(tsx|ts)$/.test(rel) && !/\.(test|spec)\.tsx?$/.test(rel))
    .map((rel) => join(dir, rel));
}

describe("token-family utility classes resolve to defined tokens", () => {
  const offenders: string[] = [];

  for (const dirName of SCAN_DIRS) {
    for (const file of walk(join(root, dirName))) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(CLASS_RE)) {
        const tokenPath = match[1];
        if (!DEFINED.has(tokenPath)) {
          const rel = file.slice(root.length + 1).split(sep).join("/");
          offenders.push(`${rel}: unknown token class suffix "${tokenPath}"`);
        }
      }
    }
  }

  it("no UI file references an undefined token-family class", () => {
    expect([...new Set(offenders)]).toEqual([]);
  });

  it("the Tailwind preset maps every token family (so defined = generated)", () => {
    const presetColors = preset.theme.extend.colors as Record<string, unknown>;
    for (const family of FAMILIES) {
      expect(presetColors[family], `family "${family}" missing from tailwind-preset.ts`).toBeDefined();
    }
  });
});
