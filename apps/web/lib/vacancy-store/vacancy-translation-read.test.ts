import { describe, expect, it } from "vitest";

import {
  digitsPreserved,
  needsVacancyTranslation,
  storedTranslationFor,
} from "./vacancy-translation-read";

/**
 * The honesty rules of the reader-locale rendering (owner P0 2026-09-22 §9):
 * a rendering is DERIVED and must never change a contractual figure, never
 * outlive the original it was made from, and never be attempted where the
 * ad is already in the reader's language.
 */
describe("a rendering must keep every number of the original", () => {
  it("accepts a faithful rendering, including reordered clauses", () => {
    expect(digitsPreserved("3 svetsare, 35 000 SEK/mån, start 2026-10-01", "3 suvirintojai, pradžia 2026-10-01, 35 000 SEK/mėn.")).toBe(true);
    expect(digitsPreserved("Snickare", "Dailidė")).toBe(true);
  });
  it("refuses a rendering that lost or changed a figure", () => {
    expect(digitsPreserved("3 svetsare", "Suvirintojai")).toBe(false);
    expect(digitsPreserved("35 000 SEK", "35 500 SEK")).toBe(false);
    expect(digitsPreserved("2 st, 40 h/v", "2 vnt., 38 h/sav.")).toBe(false);
  });
  it("treats a decimal/thousand separator as the same number", () => {
    expect(digitsPreserved("1.234,50 kr", "1 234.50 kr")).toBe(true);
  });
});

describe("only a foreign ad is rendered", () => {
  it("same language → no rendering; unknown source → no rendering (never a guess)", () => {
    expect(needsVacancyTranslation({ sourceLanguage: "sv" }, "lt")).toBe(true);
    expect(needsVacancyTranslation({ sourceLanguage: "sv" }, "sv")).toBe(false);
    expect(needsVacancyTranslation({ sourceLanguage: "" }, "lt")).toBe(false);
    expect(needsVacancyTranslation({ sourceLanguage: "en-GB" }, "en")).toBe(false);
  });
});

describe("a stored rendering is valid only for the original it was made from", () => {
  const entry = {
    status: "available" as const,
    title: "Suvirintojas",
    description: null,
    sourceLanguage: "sv",
    sourceHash: "h1",
    provider: "gemini",
    model: "m",
    generatedAt: "2026-09-22T00:00:00.000Z",
  };
  it("returns the entry while the content hash matches, and nothing once the ad was revised", () => {
    expect(storedTranslationFor({ translations: { lt: entry }, contentHash: "h1" }, "lt")).toEqual(entry);
    expect(storedTranslationFor({ translations: { lt: entry }, contentHash: "h2" }, "lt")).toBeNull();
    expect(storedTranslationFor({ translations: { lt: entry }, contentHash: "h1" }, "ru")).toBeNull();
  });
});
