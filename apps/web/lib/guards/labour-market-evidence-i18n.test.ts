/**
 * Evidence localization guard (Step 2 fix).
 *
 * The public evidence cards must show ONLY the selected locale's language — no
 * English literals on LT/RU pages. Evidence prose lives in
 * messages/{locale}/labour-market.json under `evidence.<id>.*`. This guard:
 *   1. asserts every active locale (en/lt/ru) has localized title/summary/
 *      figureDate/region for every evidence id, a unit+methodNote where the item
 *      has a numeric value, a sourceLabel for every used source, and a disclaimer;
 *   2. asserts LT/RU prose is actually translated (≠ EN) and contains none of the
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

const webRoot = resolve(__dirname, "..", "..");
type EvidenceCatalog = {
  evidence: Record<string, Record<string, string>>;
  sourceLabel: Record<string, string>;
  evidenceDisclaimer: string;
};
const load = (locale: string) =>
  JSON.parse(
    readFileSync(resolve(webRoot, "messages", locale, "labour-market.json"), "utf-8"),
  ) as EvidenceCatalog;

const ACTIVE = ["en", "lt", "ru"] as const;
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

describe("evidence i18n — no English leakage on LT/RU", () => {
  const en = load("en");

  // English function/content words that must NOT appear in localized prose.
  // Official names (Eurostat, EURES, Cedefop, Eurobarometer…) and acronyms
  // (EU, IT, CV) are deliberately excluded — they may legitimately appear.
  const ENGLISH_LEAK =
    /\b(the|and|with|employment|shortages|workers|population|market|across|countries|cross-border|record|skills|figure date|last checked|source|whole labour|sample)\b/i;

  for (const locale of ["lt", "ru"] as const) {
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
