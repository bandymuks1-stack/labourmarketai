import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { activeLocales } from "@/lib/i18n/config";

/**
 * NO HARD-CODED SUBSET OF THE ACTIVE LOCALES (owner order 2026-10-23).
 *
 * LabourMarket.ai is not a three-language platform. The routed set lives in ONE
 * place — `activeLocales` in lib/i18n/config.ts — and code that needs "the
 * locales we serve" reads it from there. A hand-written list such as
 * `new Set(["en", "lt", "ru"])` or `value === "lt" || value === "ru" ? value :
 * "en"` silently serves English (or Lithuanian) to every locale it forgot:
 * measured 2026-10-23, Dutch, German and Polish readers got English AI output
 * from nine call sites that clamped to `"en" | "lt" | "ru"`, and German copy
 * kept a word the LT/EN/RU-only test had removed everywhere else.
 *
 * WHAT IS A HARD-CODED SUBSET here (all three shapes, any order):
 *   - an array literal of 3+ quoted locale codes, every one an ACTIVE locale,
 *     containing lt AND en, and FEWER codes than `activeLocales` has;
 *   - the same codes as a string-literal union type (`"lt" | "en" | "ru"`);
 *   - a clamp `x === "lt" || x === "ru" ? x : "en"` (two named, rest folded).
 * Because the comparison is against the live `activeLocales`, today's full
 * six-code list becomes a violation the day a seventh locale is activated —
 * exactly when it would start excluding someone.
 *
 * WHAT IS NOT: `activeLocales` / `isActiveLocale` / `Record<ActiveLocale, …>`;
 * the full catalog `locales` (it holds unrouted codes); a two-code pair such as
 * the human-verified Tier 1 `["en", "lt"]`; lists of non-active languages.
 *
 * PRODUCT CODE: zero, except the allowlisted files below, each of which
 * genuinely covers only the languages it names and says so honestly.
 * TESTS: a ratchet (77 hits on 2026-10-23, from ~240). 142 catalog-copy tests now loop
 * `activeLocales`; the rest assert per-locale VOCABULARY (an LT/EN/RU regex)
 * and need a curated NL/DE/PL regex before they can widen. The count may only
 * go down.
 */

const WEB = join(__dirname, "..", "..");
const ACTIVE: readonly string[] = activeLocales;

type Hit = { readonly line: number; readonly text: string };

const CODE_LIST = /\[\s*(?:["'`][a-z]{2}["'`]\s*,\s*){2,}["'`][a-z]{2}["'`]\s*,?\s*\]/g;
const CODE_UNION = /(?:["'][a-z]{2}["']\s*\|\s*){2,}["'][a-z]{2}["'](?!\s*\|)/g;
const TWO_THEN_FOLD =
  /===\s*["'](?:lt|en|ru|nl|de|pl)["']\s*\|\|\s*[\w.]+\s*===\s*["'](?:lt|en|ru|nl|de|pl)["']\s*\?\s*[\w.]+\s*:\s*["'][a-z]{2}["']/g;

/** Comments may describe history ("it used to be a closed three-code union");
 *  only code counts. Blanks block and line comments, keeping newlines so line
 *  numbers hold. A `//` right after `:` or a quote (a URL) is left alone. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/gm, "$1");
}

/** Every hard-coded active-locale subset in a source text. Pure. */
function findLocaleSubsets(raw: string, active: readonly string[] = ACTIVE): Hit[] {
  const source = stripComments(raw);
  const hits: Hit[] = [];
  const lineOf = (index: number) => source.slice(0, index).split("\n").length;
  for (const re of [CODE_LIST, CODE_UNION]) {
    for (const m of source.matchAll(re)) {
      const codes = [...new Set(m[0].match(/[a-z]{2}/g) ?? [])];
      if (codes.length < 3) continue;
      if (!codes.every((c) => active.includes(c))) continue;
      if (codes.length >= active.length) continue;
      if (!codes.includes("lt") || !codes.includes("en")) continue;
      hits.push({ line: lineOf(m.index ?? 0), text: m[0] });
    }
  }
  for (const m of source.matchAll(TWO_THEN_FOLD)) {
    hits.push({ line: lineOf(m.index ?? 0), text: m[0] });
  }
  return hits;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (/\.(ts|tsx|mts|mjs)$/.test(name)) out.push(abs);
  }
  return out;
}

const rel = (abs: string) => relative(WEB, abs).replace(/\\/g, "/");
const isTest = (r: string) => /\.(test|spec)\.tsx?$/.test(r) || r.startsWith("tests/");

const ALL_FILES = ["lib", "app", "components", "content", "tests"].flatMap((d) => walk(join(WEB, d)));

function scan(filter: (r: string) => boolean): Map<string, Hit[]> {
  const found = new Map<string, Hit[]>();
  for (const abs of ALL_FILES) {
    const r = rel(abs);
    if (!filter(r)) continue;
    if (r === "lib/guards/locale-subset-hardcode.test.ts") continue; // this file's own fixtures
    const hits = findLocaleSubsets(readFileSync(abs, "utf8"));
    if (hits.length > 0) found.set(r, hits);
  }
  return found;
}

/**
 * Product files that may name a subset, with the honest reason. The number is
 * the exact count of hits allowed — a new hit in an allowlisted file still fails.
 */
const PRODUCT_ALLOWLIST: Readonly<Record<string, { readonly hits: number; readonly why: string }>> = {
  "lib/structuring/language-packs/index.ts": {
    hits: 1,
    why: "BASE_LEXICON_LANGUAGES: the recognizer's base lexicon really holds only LT/EN/RU needles; every other language is a pack (COVERED_RECOGNITION_LANGUAGES is the union).",
  },
  "lib/organization-evidence/parse-tabular.ts": {
    hits: 1,
    why: "detectHeaderLanguage returns only languages whose header vocabulary exists, and null otherwise — a recognizer naming its real coverage.",
  },
  "lib/guards/landing-freeze.ts": {
    hits: 1,
    why: "FROZEN_LOCALES: the locales active when the landing freeze snapshot was taken; a historical hash baseline, not a served-locale list.",
  },
  "lib/public-claims/registry.ts": {
    hits: 1,
    why: "platform.headline.<locale> claim ids are pinned by the external Agentai register (append-only); adding nl/pl claims is an additive registry change for that consumer, not a code fix.",
  },
};

/** Test files that still loop a hard-coded subset. Ratchet: may only go down. */
const TEST_HITS_CEILING = 77;

describe("detector — negative and positive controls", () => {
  const ACTIVE6 = ["lt", "en", "ru", "nl", "de", "pl"];

  it("flags every shape of a hard-coded subset", () => {
    for (const src of [
      `const AI_LOCALES = new Set(["en", "lt", "ru"]);`,
      `locale: z.enum(["ru", "lt", "en"]),`,
      `export type AiLocale = "en" | "lt" | "ru";`,
      `for (const loc of ["lt", "en", "ru", "nl", "de"] as const) {}`,
      `return value === "lt" || value === "ru" ? value : "en";`,
    ]) {
      expect(findLocaleSubsets(src, ACTIVE6), src).toHaveLength(1);
    }
  });

  it("does not flag the canonical forms or non-subsets", () => {
    for (const src of [
      `for (const loc of activeLocales) {}`,
      `const all = ["lt", "en", "ru", "nl", "de", "pl"] as const;`,
      `export const tier1Locales = ["en", "lt"] as const;`,
      `const nordic = ["sv", "no", "da"];`,
      `const catalog = ["en", "lt", "lv", "et", "nl", "de", "da", "no", "sv", "pl", "ru"];`,
      `const ok = isActiveLocale(v) ? v : "en";`,
      `const book = locale === "lt" ? LT : EN;`,
      `/** it used to be "en" | "lt" | "ru" */ export type AiLocale = ActiveLocale;`,
      `// was: new Set(["en", "lt", "ru"])`,
    ]) {
      expect(findLocaleSubsets(src, ACTIVE6), src).toEqual([]);
    }
  });

  it("today's full list becomes a violation once a locale is activated", () => {
    const src = `const served = ["lt", "en", "ru", "nl", "de", "pl"];`;
    expect(findLocaleSubsets(src, ACTIVE6)).toEqual([]);
    expect(findLocaleSubsets(src, [...ACTIVE6, "uk"])).toHaveLength(1);
  });
});

describe("product code reads activeLocales, never a hand-written subset", () => {
  const found = scan((r) => !isTest(r));

  it("no hard-coded active-locale subset outside the allowlist", () => {
    const offenders = [...found.entries()]
      .filter(([file]) => !(file in PRODUCT_ALLOWLIST))
      .flatMap(([file, hits]) => hits.map((h) => `${file}:${h.line}  ${h.text}`));
    expect(
      offenders,
      `use activeLocales / isActiveLocale (lib/i18n/config.ts) or aiLocaleFor (lib/ai/runtime/types.ts):\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("allowlisted files hold exactly the hits they are allowed (no growth, no stale entry)", () => {
    for (const [file, { hits }] of Object.entries(PRODUCT_ALLOWLIST)) {
      expect(found.get(file)?.length ?? 0, `${file} — update the allowlist only with a reason`).toBe(hits);
    }
  });
});

describe("tests: the hard-coded subset count may only go down", () => {
  it(`at most ${TEST_HITS_CEILING} hits in test files`, () => {
    const found = scan(isTest);
    const total = [...found.values()].reduce((n, h) => n + h.length, 0);
    expect(
      total,
      "a new test loops a hand-written locale subset — loop `activeLocales` instead (or, for per-locale vocabulary, add the missing locales' patterns)",
    ).toBeLessThanOrEqual(TEST_HITS_CEILING);
  });
});
