/**
 * Public copy must not make fake-style, unsupported claims (Step 1 guard).
 *
 * Scans the public-facing message catalogs for traction/verification claims the
 * product cannot honestly make (no real users/matches/revenue yet; skills are
 * self-declared / journal-supported, not verified). Practical, not exhaustive —
 * it targets the specific fabrication shapes the brief calls out.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const webRoot = resolve(__dirname, "..", "..");

/** Collect every string leaf from a JSON object, with its dotted path. */
function strings(node: unknown, path = "", out: Array<[string, string]> = []) {
  if (typeof node === "string") {
    out.push([path, node]);
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => strings(v, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      strings(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function loadAllStrings(): Array<[string, string]> {
  const files = [
    "messages/en.json",
    "messages/lt.json",
    "messages/ru.json",
    "messages/en/labour-market.json",
    "messages/lt/labour-market.json",
    "messages/ru/labour-market.json",
  ];
  const out: Array<[string, string]> = [];
  for (const f of files) {
    const abs = resolve(webRoot, f);
    if (!existsSync(abs)) continue;
    const json = JSON.parse(readFileSync(abs, "utf-8"));
    for (const [p, s] of strings(json)) out.push([`${f}:${p}`, s]);
  }
  return out;
}

/** Fabrication shapes that are never honest for this product. */
const BANNED: Array<{ re: RegExp; why: string }> = [
  { re: /millions? of (verified |registered )?(workers|users|professionals)/i, why: "fake scale of users" },
  { re: /thousands? of (verified )?(matches|hires|employers|jobs) (already|made)/i, why: "fake traction" },
  { re: /\b(ai|dirbtinis intelektas|искусственный интеллект)\b[^.]*\b(already )?(matched|matches|hired)\b/i, why: "fake AI matching claim" },
  { re: /guaranteed (higher )?(salary|pay|income|job|hire)/i, why: "guaranteed-outcome claim" },
  { re: /garantuot[aią]s?\s+(didesn|atlyginim|darb)/i, why: "guaranteed-outcome claim (LT)" },
  { re: /гарантирован[а-я]*\s+(зарплат|выш|работ)/i, why: "guaranteed-outcome claim (RU)" },
  { re: /\bverified (worker|skill)s? (community|network|by us)\b/i, why: "verified-status overclaim" },
];

describe("public copy makes no fake/unsupported claims", () => {
  const all = loadAllStrings();

  it("loaded public message catalogs", () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it("contains none of the banned fabrication shapes", () => {
    const hits: string[] = [];
    for (const [where, s] of all) {
      for (const b of BANNED) {
        if (b.re.test(s)) hits.push(`${where} — ${b.why}: "${s}"`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
