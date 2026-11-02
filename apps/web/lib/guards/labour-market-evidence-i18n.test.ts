/**
 * Evidence localization guard (Step 2 fix).
 *
 * The public evidence cards must show ONLY the selected locale's language — no
 * English literals on any non-English page. The locale list is the routing's
 * own `activeLocales` (it was pinned to en/lt/ru, so when de/nl/pl went live
 * the DE and NL country pages shipped 33 English strings unnoticed — QA
 * 2026-10-23). Evidence prose lives in
 * messages/{locale}/labour-market.json under `evidence.<id>.*`. This guard:
 *   1. asserts every active locale has localized title/summary/
 *      figureDate/region for every evidence id, a unit+methodNote where the item
 *      has a numeric value, a sourceLabel for every used source, and a disclaimer;
 *   2. asserts every non-English locale's prose is actually translated (≠ EN) and contains none of the
 *      known English phrases from the EN dataset (official names/acronyms and
 *      quoted English report titles in methodNote are tolerated).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  LABOUR_MARKET_EVIDENCE,
  EVIDENCE_IDS,
  EVIDENCE_IDS_WITH_VALUE,
} from "../labour-market/evidence";
import { activeLocales } from "../i18n/config";

const webRoot = resolve(__dirname, "..", "..");
type EvidenceCatalog = {
  [key: string]: unknown;
  evidence: Record<string, Record<string, string>>;
  sourceLabel: Record<string, string>;
  evidenceDisclaimer: string;
};
const load = (locale: string) =>
  JSON.parse(
    readFileSync(resolve(webRoot, "messages", locale, "labour-market.json"), "utf-8"),
  ) as EvidenceCatalog;

const ACTIVE = activeLocales;
const NON_ENGLISH = activeLocales.filter((l) => l !== "en");
const usedSources = [...new Set(LABOUR_MARKET_EVIDENCE.map((e) => e.sourceId))];

describe("evidence i18n — every active locale is fully localized", () => {
  for (const locale of ACTIVE) {
    const cat = load(locale);

    it(`${locale}: has localized title/summary/figureDate/region for every id`, () => {
      for (const id of EVIDENCE_IDS) {
        const e = cat.evidence?.[id];
        expect(e, `${locale} evidence.${id}`).toBeTruthy();
        for (const f of ["title", "summary", "figureDate", "region"]) {
          expect(
            typeof e?.[f] === "string" && e[f].trim().length > 0,
            `${locale} evidence.${id}.${f}`,
          ).toBe(true);
        }
      }
    });

    it(`${locale}: items with a numeric value carry unit + methodNote`, () => {
      for (const id of EVIDENCE_IDS_WITH_VALUE) {
        const e = cat.evidence?.[id];
        for (const f of ["unit", "methodNote"]) {
          expect(
            typeof e?.[f] === "string" && e[f].trim().length > 0,
            `${locale} evidence.${id}.${f}`,
          ).toBe(true);
        }
      }
    });

    it(`${locale}: has a source label for every used source + a disclaimer`, () => {
      for (const s of usedSources) {
        expect(
          typeof cat.sourceLabel?.[s] === "string" && cat.sourceLabel[s].length > 0,
          `${locale} sourceLabel.${s}`,
        ).toBe(true);
      }
      expect(typeof cat.evidenceDisclaimer).toBe("string");
      expect(cat.evidenceDisclaimer.length).toBeGreaterThan(0);
    });
  }
});

describe("evidence i18n — no English leakage on any non-English locale", () => {
  const en = load("en");

  // English function/content words that must NOT appear in localized prose.
  // Official names (Eurostat, EURES, Cedefop, Eurobarometer…) and acronyms
  // (EU, IT, CV) are deliberately excluded — they may legitimately appear.
  const ENGLISH_LEAK =
    /\b(the|and|with|employment|shortages|workers|population|market|across|countries|cross-border|record|skills|figure date|last checked|source|whole labour|sample)\b/i;

  for (const locale of NON_ENGLISH) {
    const cat = load(locale);

    it(`${locale}: title/summary/region/figureDate/unit contain no English words`, () => {
      for (const id of EVIDENCE_IDS) {
        const e = cat.evidence[id];
        for (const f of ["title", "summary", "region", "figureDate", "unit"]) {
          const v = e[f];
          if (typeof v !== "string") continue;
          expect(
            ENGLISH_LEAK.test(v),
            `${locale} evidence.${id}.${f} leaks English: "${v}"`,
          ).toBe(false);
        }
      }
    });

    it(`${locale}: title/summary/methodNote differ from the English dataset`, () => {
      for (const id of EVIDENCE_IDS) {
        for (const f of ["title", "summary", "methodNote"]) {
          const loc = cat.evidence[id]?.[f];
          const eng = en.evidence[id]?.[f];
          if (typeof eng === "string" && typeof loc === "string") {
            expect(loc, `${locale} evidence.${id}.${f} not translated`).not.toBe(eng);
          }
        }
      }
    });

    it(`${locale}: the disclaimer is translated (≠ English)`, () => {
      expect(cat.evidenceDisclaimer).not.toBe(en.evidenceDisclaimer);
    });
  }
});

/**
 * The page chrome the /labour-market index and country pages render around the
 * cards (eyebrows, titles, field labels, claim kinds, country framing, every
 * country's intro and signals). A string identical to English on a
 * non-English page is a fallback the visitor reads as a broken translation.
 */
describe("labour-market page chrome — translated in every non-English locale", () => {
  const en = load("en");
  const flat = (o: unknown, prefix = "", acc: Record<string, string> = {}) => {
    if (o && typeof o === "object") {
      for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") acc[key] = v;
        else flat(v, key, acc);
      }
    }
    return acc;
  };
  const RENDERED = /^(country[A-Z]\w*|countryEvidence\..+|evidence(Eyebrow|Title|Subcopy|Disclaimer)|field[A-Z]\w*|claim[A-Z]\w*)$/;
  // Words that are the same in the target language (a loanword), not a fallback.
  const SAME_WORD = new Set(["Trend"]);
  const enFlat = flat(en);

  for (const locale of NON_ENGLISH) {
    it(`${locale}: no rendered labour-market string is left in English`, () => {
      const cat = flat(load(locale));
      const untranslated = Object.keys(enFlat).filter(
        (k) => RENDERED.test(k) && cat[k] === enFlat[k] && !SAME_WORD.has(enFlat[k]),
      );
      expect(untranslated, `${locale} still English: ${untranslated.join(", ")}`).toEqual([]);
    });
  }
});
