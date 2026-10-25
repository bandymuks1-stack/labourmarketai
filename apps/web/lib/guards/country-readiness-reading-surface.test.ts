import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Registry row 10.11 (owner decision 2026-10-25) — the `country_readiness`
 * SURFACE contract: the deterministic answer first, the AI part labelled as a
 * suggestion, an honest state for every way it can be absent, and the same
 * copy in every active locale.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const MATRIX = "components/marketing/country-readiness-requirements.tsx";
const READING = "components/marketing/country-readiness-reading.tsx";
const ACTIVE_LOCALES = ["lt", "en", "ru", "nl", "de", "pl"] as const;
const OFF_REASONS = [
  "not_authenticated",
  "rate_limited",
  "no_research",
  "ai_off",
  "ai_unavailable",
  "unsourced",
] as const;

describe("the matrix is rendered first; the reading comes after it", () => {
  it("the reading is mounted AFTER every scope block, on the existing page — not a new route", () => {
    const src = stripComments(read(MATRIX));
    const matrixAt = src.indexOf("byScope.map(({ scope, items })");
    const readingAt = src.indexOf("<CountryReadinessReading");
    expect(matrixAt, "the matrix still renders every scope").toBeGreaterThanOrEqual(0);
    expect(readingAt, "the reading is mounted on the matrix surface").toBeGreaterThan(matrixAt);
    // Exactly one AI layer on the page.
    expect(src.split("<CountryReadinessReading").length - 1).toBe(1);
  });

  it("an unresearched country renders its honest absence without any AI control", () => {
    const src = stripComments(read(MATRIX));
    const absence = src.slice(src.indexOf("if (!readiness)"), src.indexOf("const byScope"));
    expect(absence).toMatch(/noResearchYet/);
    expect(absence).not.toMatch(/CountryReadinessReading/);
  });
});

describe("the AI part is labelled, attributed and optional", () => {
  const src = stripComments(read(READING));

  it("runs only when asked (a click), never on render", () => {
    expect(src).toMatch(/onClick=\{run\}/);
    expect(src).not.toMatch(/useEffect/);
  });

  it("names its author before its text, and shows every off reason as its own sentence", () => {
    expect(src.indexOf("result.attribution")).toBeLessThan(src.indexOf("result.reading.summary"));
    expect(src).toMatch(/labels\.off\[result\.reason\]/);
    expect(src).toMatch(/country-readiness-reading-off/);
  });

  it("each step shows the official source resolved from the matrix", () => {
    expect(src).toMatch(/s\.sourceUrl/);
    expect(src).toMatch(/s\.sourceTitle/);
  });

  it("reaches the runtime only through the server action, never directly", () => {
    expect(src).toMatch(/^"use client";/);
    expect(src).not.toMatch(/@\/lib\/ai\//);
    expect(src).toMatch(/@\/lib\/country-readiness\/readiness-reading-actions/);
  });
});

describe("copy exists in all six active locales, and says what it is", () => {
  for (const locale of ACTIVE_LOCALES) {
    it(`${locale}: every reading key is present and none says "demo"`, () => {
      const messages = JSON.parse(read(`messages/${locale}.json`)) as {
        countryReadiness: { reading?: Record<string, unknown> & { off?: Record<string, string> } };
      };
      const reading = messages.countryReadiness.reading;
      expect(reading, `${locale} has no countryReadiness.reading`).toBeTruthy();
      for (const key of [
        "title",
        "intro",
        "scopeLabel",
        "cta",
        "pending",
        "resultTitle",
        "attribution",
        "stepsTitle",
        "stepSource",
        "stepLegalCheck",
        "legalCheck",
        "limitationsTitle",
        "reviewNote",
      ]) {
        expect(typeof reading![key], `${locale}.${key}`).toBe("string");
        expect((reading![key] as string).trim(), `${locale}.${key}`).not.toBe("");
      }
      for (const reason of OFF_REASONS) {
        expect(reading!.off?.[reason], `${locale}.off.${reason}`).toBeTruthy();
      }
      // The attribution keeps both placeholders the component fills.
      expect(reading!.attribution).toMatch(/\{provider\}/);
      expect(reading!.attribution).toMatch(/\{model\}/);
      expect(JSON.stringify(reading)).not.toMatch(/\bdemo/i);
    });
  }
});
