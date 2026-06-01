import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guard for External Link Safety v1.
 *
 * Today the public + dashboard surface uses only internal locale-aware <Link>
 * navigation — there are zero outbound links. This guard is the forward safety
 * net: the moment an external link is added it must be safe and intentional.
 * It fails if:
 *   1. any element opens a new tab (`target="_blank"`) WITHOUT
 *      `rel="...noopener..."` (and the project convention `noreferrer`) —
 *      reverse-tabnabbing protection;
 *   2. any external href is a placeholder / unreviewed stub (example.com,
 *      your-domain, TODO/CHANGEME, etc.) — no dead or fake partner/trust links.
 *
 * Runs in CI via `pnpm -F web test`. Scans every .tsx under app/ + components/.
 * A file-count floor keeps it from silently degrading into a no-op.
 */

const APP_ROOT = join(__dirname, "..", "..");

function walkTsx(absDir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const p = join(absDir, e.name);
    if (e.isDirectory()) walkTsx(p, acc);
    else if (e.name.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

const FILES = [
  ...walkTsx(join(APP_ROOT, "app", "[locale]")),
  ...walkTsx(join(APP_ROOT, "components")),
];

function rel(abs: string): string {
  return abs.slice(APP_ROOT.length + 1).split("\\").join("/");
}

/**
 * The opening tag text from `<` at `openIdx` to its closing `>`, honoring JSX
 * brace nesting and string quotes (so `>` inside `{() => x}` or a string is not
 * mistaken for the tag end).
 */
function openingTagText(src: string, openIdx: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIdx + 1; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === quote && src[i - 1] !== "\\") quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(openIdx, i + 1);
  }
  return src.slice(openIdx);
}

/** Start index of the tag whose attributes contain position `pos`. */
function openerStart(src: string, pos: number): number {
  const re = /<[A-Za-z]/g;
  let start = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && m.index < pos) start = m.index;
  return start;
}

const TARGET_BLANK = /target=\s*(?:["']_blank["']|\{\s*["']_blank["']\s*\})/g;
const EXTERNAL_HREF =
  /href=\s*(?:["'](https?:\/\/[^"']*)["']|\{\s*[`"'](https?:\/\/[^`"']*)[`"']\s*\})/g;
const PLACEHOLDER =
  /example\.(?:com|org)|your-?domain|your-?site|TODO|CHANGEME|changeme|placeholder|lorem|foo\.bar/i;

function lineOf(src: string, idx: number): number {
  return src.slice(0, idx).split(/\r?\n/).length;
}

describe("Guard: external links open safely", () => {
  it(`scans a non-trivial set of .tsx files (not a no-op): ${FILES.length}`, () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('every target="_blank" carries rel="noopener noreferrer"', () => {
    const offenders: string[] = [];
    for (const abs of FILES) {
      const src = readFileSync(abs, "utf8");
      TARGET_BLANK.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = TARGET_BLANK.exec(src))) {
        const start = openerStart(src, m.index);
        const tag = start >= 0 ? openingTagText(src, start) : "";
        const relAttr = /rel=\s*["']([^"']*)["']/.exec(tag)?.[1] ?? "";
        const ok = /\bnoopener\b/.test(relAttr) && /\bnoreferrer\b/.test(relAttr);
        if (!ok) {
          offenders.push(`${rel(abs)}:${lineOf(src, m.index)} — target="_blank" rel="${relAttr}"`);
        }
      }
    }
    expect(
      offenders,
      `target="_blank" without rel="noopener noreferrer":\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("no placeholder / unreviewed external links", () => {
    const offenders: string[] = [];
    for (const abs of FILES) {
      const src = readFileSync(abs, "utf8");
      EXTERNAL_HREF.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = EXTERNAL_HREF.exec(src))) {
        const url = m[1] ?? m[2] ?? "";
        if (PLACEHOLDER.test(url)) {
          offenders.push(`${rel(abs)}:${lineOf(src, m.index)} — ${url}`);
        }
      }
    }
    expect(
      offenders,
      `Placeholder/unreviewed external link(s) — point to a real reviewed URL or remove:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });
});
