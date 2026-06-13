/**
 * Step 5/6 guard — country evidence is fully sourced + localized, no fake data.
 *
 * Every per-country signal carries full provenance (known source, https url,
 * figure date, ISO last-checked), has localized title/summary in en/lt/ru with
 * no English leakage on LT/RU, and the index lists the priority markets. The
 * signals are qualitative sourced statements — no numeric figure can be fake
 * because none is asserted in the data layer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SUPPORTED_COUNTRIES,
  PRIORITY_MARKETS,
  COUNTRY_SIGNALS,
  findCountryProvenanceProblems,
} from "../labour-market/country-evidence";
import { LABOUR_MARKET_SOURCES } from "../labour-market/sources";

const webRoot = resolve(__dirname, "..", "..");
const loadLM = (locale: string) =>
  JSON.parse(readFileSync(resolve(webRoot, "messages", locale, "labour-market.json"), "utf-8"));

describe("country evidence provenance", () => {
  it("every signal is fully sourced (no missing provenance)", () => {
    expect(findCountryProvenanceProblems()).toEqual([]);
  });
  it("every signal links a known official source over https", () => {
    for (const c of SUPPORTED_COUNTRIES) {
      for (const s of COUNTRY_SIGNALS[c]) {
        expect(LABOUR_MARKET_SOURCES[s.sourceId], `${c}/${s.id} source`).toBeTruthy();
        expect(s.sourceUrl).toMatch(/^https:\/\//);
      }
    }
  });
  it("the index lists the priority markets (≥10)", () => {
    expect(PRIORITY_MARKETS.length).toBeGreaterThanOrEqual(10);
    for (const c of SUPPORTED_COUNTRIES) expect(PRIORITY_MARKETS).toContain(c);
  });
});

describe("country content is localized en/lt/ru", () => {
  for (const locale of ["en", "lt", "ru"] as const) {
    it(`${locale}: every signal has a localized title + summary, + chrome/names`, () => {
      const j = loadLM(locale);
      for (const c of SUPPORTED_COUNTRIES) {
        expect(typeof j.countryNames[c], `${locale} name ${c}`).toBe("string");
        expect(typeof j.countryEvidence[c].intro, `${locale} intro ${c}`).toBe("string");
        for (const s of COUNTRY_SIGNALS[c]) {
          const block = j.countryEvidence[c][s.id];
          expect(typeof block?.title, `${locale} ${c}.${s.id}.title`).toBe("string");
          expect(typeof block?.summary, `${locale} ${c}.${s.id}.summary`).toBe("string");
        }
      }
      for (const k of ["countryIndexTitle", "countryComingSoon", "countryWorkerFraming"]) {
        expect(typeof j[k], `${locale} ${k}`).toBe("string");
      }
    });
  }
});

describe("no English leakage on LT/RU country content", () => {
  const ENGLISH_LEAK =
    /\b(the|and|with|shortages|market|skills|growing|across|including|relatively|balanced|surplus|demand|workers|employers)\b/i;
  for (const locale of ["lt", "ru"] as const) {
    it(`${locale}: country titles/summaries/intros contain no English words`, () => {
      const j = loadLM(locale);
      for (const c of SUPPORTED_COUNTRIES) {
        const texts = [j.countryEvidence[c].intro];
        for (const s of COUNTRY_SIGNALS[c]) {
          texts.push(j.countryEvidence[c][s.id].title, j.countryEvidence[c][s.id].summary);
        }
        for (const txt of texts) {
          expect(ENGLISH_LEAK.test(txt), `${locale} ${c}: "${txt}"`).toBe(false);
        }
      }
    });
  }
});
