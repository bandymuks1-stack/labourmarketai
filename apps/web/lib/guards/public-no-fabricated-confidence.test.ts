import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * The public surface may not state how SURE it is.
 *
 * W14 P0-1: the landing hero rendered "Confidence 86%" from `confidence: 0.86`,
 * a literal in `landing-scenario.ts`, next to a source comment that claimed the
 * value was "derived from how much the underlying signal actually supports the
 * answer". It was not derived from anything. The landing runs no model and
 * reads no live supply, so there was nothing to be 86% sure about.
 *
 * A fabricated number on the most-seen surface of the product is not a cosmetic
 * defect: it makes every honest number beside it unbelievable. This guard makes
 * the regression impossible to reintroduce quietly, and it is deliberately
 * stricter than "delete the field" —
 *
 *   1. no self-certainty vocabulary (confidence / certainty / accuracy /
 *      reliability / trust score / match score) in the landing scenario data or
 *      the marketing render tree;
 *   2. no numeric literal formatted as a percentage in `components/marketing/**`
 *      — the shape the defect actually took, whatever it gets called next;
 *   3. no `confidence`-style key left in the landing i18n namespace of any
 *      locale that ships the landing;
 *   4. the public entry (frozen design contract 2026-09-05, P1 — the
 *      scripted scenario is gone) states what it understood and NEVER how
 *      sure it is: no certainty key, no percentage, in any routed locale.
 *
 * If a real, explainable confidence value ever exists, this guard should be
 * changed deliberately in the PR that introduces it — together with the product
 * contract that says what the number means. It must not be relaxed to make an
 * unrelated change pass.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");

/** Strip comments — this guard bans rendered claims, not prose about them. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const ENTRY = "components/marketing/public-entry.tsx";
const ENTRY_HOOK = "lib/marketing/public-entry.ts";
const MARKETING_DIR = join(APP, "components", "marketing");

/** Every .ts/.tsx file under components/marketing, recursively. */
function marketingFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const abs = join(dir, entry);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (/\.tsx?$/.test(entry)) out.push(abs);
    }
  };
  walk(MARKETING_DIR);
  return out;
}

/**
 * Locales that ship the landing. Derived, not hard-coded: any locale whose
 * catalog carries the public entry namespace renders it, so a newly
 * activated locale is covered the day it is added.
 */
function landingLocales(): Array<[string, Record<string, unknown>]> {
  const dir = join(APP, "messages");
  const out: Array<[string, Record<string, unknown>]> = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    const json = JSON.parse(readFileSync(join(dir, f), "utf8")) as Record<
      string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    >;
    const entry = json?.landing?.entry;
    if (entry && typeof entry === "object" && "understoodLabel" in entry) {
      out.push([f.replace(/\.json$/, ""), entry as Record<string, unknown>]);
    }
  }
  return out;
}

/** Self-certainty vocabulary. Renaming the field is not a fix. */
const CERTAINTY_TERMS =
  /\b(confidence|certainty|accuracy|reliability|trustScore|trust_score|matchScore|match_score|patikimum|увереннос|достоверност|betrouwbaarheid|zuverlässigkeit|vertrouwensscore)/i;

describe("the public entry source states no self-certainty", () => {
  for (const rel of [ENTRY, ENTRY_HOOK]) {
    const src = stripComments(read(rel));

    it(`${rel} carries no confidence/certainty field or value`, () => {
      const hit = src.match(CERTAINTY_TERMS);
      expect(
        hit?.[0] ?? null,
        `${rel} must not state how sure it is — found "${hit?.[0]}"`,
      ).toBeNull();
    });

    it(`${rel} carries no bare 0..1 score literal`, () => {
      const hits = [...src.matchAll(/^\s*[A-Za-z_$][\w$]*:\s*0\.\d+\s*,/gm)].map(
        (m) => m[0].trim(),
      );
      expect(hits, hits.join("\n")).toEqual([]);
    });
  }
});

describe("marketing render tree renders no fabricated percentage", () => {
  const files = marketingFiles();

  it("scans the marketing component tree", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it("uses no self-certainty vocabulary", () => {
    const hits: string[] = [];
    for (const abs of files) {
      const m = stripComments(readFileSync(abs, "utf8")).match(CERTAINTY_TERMS);
      if (m) hits.push(`${relative(APP, abs)} — "${m[0]}"`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("renders no numeric literal as a percentage", () => {
    // Catches `width: \`${0.86 * 100}%\``, `86%` and `{86}%` — inline numeric
    // literals rendered as a percentage, which is the shape the audit named.
    // The trailing class absorbs the `)}`/`}` that closes the expression.
    //
    // The variable form (`{Math.round(scenario.confidence * 100)}%`) is NOT
    // matched here on purpose: a percentage over real data legitimately arrives
    // through a variable. What made the old meter dishonest was the literal
    // BEHIND that variable and the word "confidence" in front of it — both
    // caught above, in the scenario-data and vocabulary checks.
    const shapes: Array<{ re: RegExp; why: string }> = [
      { re: /\b\d+(?:\.\d+)?\s*\*\s*100\s*[)}\s]*%/, why: "numeric literal scaled to a percentage" },
      { re: /\{\s*\d+(?:\.\d+)?\s*\}\s*%/, why: "numeric literal rendered as a percentage" },
      { re: />\s*\d{1,3}\s*%\s*</, why: "hard-coded percentage in markup" },
    ];
    const hits: string[] = [];
    for (const abs of files) {
      const src = stripComments(readFileSync(abs, "utf8"));
      for (const s of shapes) {
        const m = src.match(s.re);
        if (m) hits.push(`${relative(APP, abs)} — ${s.why}: "${m[0].trim()}"`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("keeps no hero-confidence test hook", () => {
    for (const abs of files) {
      expect(readFileSync(abs, "utf8")).not.toContain("hero-confidence");
    }
  });
});

describe("landing i18n carries no confidence label", () => {
  const locales = landingLocales();

  it("found the locales that ship the public entry", () => {
    expect(locales.length).toBeGreaterThanOrEqual(5);
  });

  it("no locale keeps a confidence-style key", () => {
    const hits: string[] = [];
    for (const [locale, entry] of locales) {
      for (const key of Object.keys(entry)) {
        if (CERTAINTY_TERMS.test(key)) hits.push(`${locale}: landing.entry.${key}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("the entry says WHAT it understood, never HOW SURE it is", () => {
  const entry = read(ENTRY);
  const locales = landingLocales();

  it("renders the understanding line and the per-intent / family copy", () => {
    expect(entry).toContain('data-testid="entry-understanding"');
    expect(entry).toContain('t("understoodLabel")');
    expect(entry).toContain("t(`family.${");
  });

  it("no routed locale carries a percentage or a certainty term in the entry copy", () => {
    const hits: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (typeof node === "string") {
        if (/\d\s*%/.test(node)) hits.push(`${path}: "${node}"`);
        if (CERTAINTY_TERMS.test(node)) hits.push(`${path}: "${node}"`);
      } else if (node && typeof node === "object") {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          walk(v, `${path}.${k}`);
        }
      }
    };
    for (const [locale, e] of locales) walk(e, `${locale}: landing.entry`);
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("guard covers the files it claims to cover", () => {
  it("both entry source files exist at the pinned paths", () => {
    expect(existsSync(join(APP, ENTRY))).toBe(true);
    expect(existsSync(join(APP, ENTRY_HOOK))).toBe(true);
  });
});
