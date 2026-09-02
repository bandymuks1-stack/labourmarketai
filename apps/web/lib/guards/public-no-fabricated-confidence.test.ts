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
 *   4. the honest replacement is present: the result card names its BASIS and
 *      carries the demonstration qualifier adjacent to the claim.
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

const SCENARIO = "components/app/market-map/landing-scenario.ts";
const HERO = "components/marketing/hero-live-demo.tsx";
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
 * catalog carries the hero decision label renders this card, so a newly
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
    const hero = json?.landing?.hero;
    if (hero && typeof hero === "object" && "decisionLabel" in hero) {
      out.push([f.replace(/\.json$/, ""), hero as Record<string, unknown>]);
    }
  }
  return out;
}

/** Self-certainty vocabulary. Renaming the field is not a fix. */
const CERTAINTY_TERMS =
  /\b(confidence|certainty|accuracy|reliability|trustScore|trust_score|matchScore|match_score|patikimum|увереннос|достоверност|betrouwbaarheid|zuverlässigkeit|vertrouwensscore)/i;

describe("landing scenario data states no self-certainty", () => {
  const src = stripComments(read(SCENARIO));

  it("carries no confidence/certainty field or value", () => {
    const hit = src.match(CERTAINTY_TERMS);
    expect(
      hit?.[0] ?? null,
      `landing-scenario.ts must not state how sure it is — found "${hit?.[0]}"`,
    ).toBeNull();
  });

  it("carries no bare 0..1 score literal on a scenario", () => {
    // The defect shape: `someKey: 0.86,` inside the scenario list.
    const hits = [...src.matchAll(/^\s*[A-Za-z_$][\w$]*:\s*0\.\d+\s*,/gm)].map(
      (m) => m[0].trim(),
    );
    expect(hits, hits.join("\n")).toEqual([]);
  });
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

  it("found the locales that ship the landing hero", () => {
    expect(locales.length).toBeGreaterThanOrEqual(5);
  });

  it("no locale keeps a confidence-style key", () => {
    const hits: string[] = [];
    for (const [locale, hero] of locales) {
      for (const key of Object.keys(hero)) {
        if (CERTAINTY_TERMS.test(key)) hits.push(`${locale}: landing.hero.${key}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("the honest replacement is actually rendered", () => {
  const hero = read(HERO);
  const locales = landingLocales();

  it("the result card names its basis instead of scoring itself", () => {
    expect(hero).toContain('data-testid="hero-basis"');
    expect(hero).toContain('t("basisLabel")');
    expect(hero).toContain('t("basisNote"');
  });

  it("every landing locale translates the basis row", () => {
    const missing: string[] = [];
    for (const [locale, h] of locales) {
      for (const key of ["basisLabel", "basisNote"]) {
        const v = h[key];
        if (typeof v !== "string" || v.trim().length === 0) {
          missing.push(`${locale}: landing.hero.${key}`);
        }
      }
    }
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("the basis note states it is a concept scenario, in every locale", () => {
    // The W14 finding was that the only qualifier sat ~180 lines away in the
    // DOM. The qualifier now has to travel WITH the claim — in the doctrine
    // §18 vocabulary (concept/preview family), since the "demonstration"
    // wording itself is the banned framing product-copy-forbidden-terms
    // now catches.
    const weak: string[] = [];
    for (const [locale, h] of locales) {
      const note = String(h.basisNote ?? "");
      if (!/koncep|concept|Konzept|концеп|preview|peržiūr|vorschau|voorbeeld|предпросмотр/i.test(note)) {
        weak.push(`${locale}: landing.hero.basisNote does not carry the concept/preview qualifier`);
      }
    }
    expect(weak, weak.join("\n")).toEqual([]);
  });

  it("the basis note contains no percentage", () => {
    const hits: string[] = [];
    for (const [locale, h] of locales) {
      const note = String(h.basisNote ?? "");
      if (/\d\s*%/.test(note)) hits.push(`${locale}: "${note}"`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});

describe("guard covers the files it claims to cover", () => {
  it("both source files exist at the pinned paths", () => {
    expect(existsSync(join(APP, SCENARIO))).toBe(true);
    expect(existsSync(join(APP, HERO))).toBe(true);
  });
});
