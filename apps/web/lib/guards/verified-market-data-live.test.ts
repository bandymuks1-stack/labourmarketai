import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * VERIFIED MARKET DATA must actually be live (owner hotfix).
 *
 * The panel once rendered `SWEDEN_COVERAGE_CURRENT`'s multi-day floors —
 * 35,000 / 7,000 / 21 — under a "verified" heading whenever the public reader
 * was unavailable, and rendered a static `regions` constant unconditionally.
 * A rounded floor presented as the current market is exactly the failure this
 * file exists to prevent: the counts must come from the canonical public
 * vacancy contract or not be shown at all.
 *
 * Canonical source of truth (one aggregation, not a landing-specific one):
 *   count_public_vacancies_v1
 *     -> readPublicVacancySupplyCounts   (lib/vacancy-store/public-vacancy-preview.ts)
 *     -> readLiveMarketLandingSnapshot   (lib/market/live-market-landing.ts)
 *
 * ONE MARKET TRUTH (owner command 2026-08-22 §9). The landing's market band
 * reads the ONE snapshot through its cache entry: it may not hard-code a
 * total, invent a second reader, or substitute a constant when the reader is
 * unavailable. (The optional LIVE arm, which used to render the same counts in
 * a second panel, was removed by owner decision 2026-09-30.)
 */

const WEB = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(WEB, path), "utf8");

const reader = read("lib/market/live-market-landing.ts");
const focusBand = read("components/marketing/market-proof-band.tsx");
const focusPage = read("app/[locale]/focus-landing/focus-landing.tsx");

/** Every surface that renders a market count. */
const ALL_MARKET_SURFACES = [reader, focusBand, focusPage];

/** The floors that were previously rendered as if they were current. */
const BANNED_TOTALS = [
  "35000",
  "35,000",
  "7000",
  "7,000",
  "41000",
  "41,272",
  "8090",
  "43275",
];

describe("VERIFIED MARKET DATA is live, never hard-coded", () => {
  it("reads the counts from the canonical public vacancy contract", () => {
    expect(reader).toContain("readPublicVacancySupplyCounts");
    expect(focusBand).toContain("market.activeVacancies");
    expect(focusBand).toContain("market.distinctEmployers");
  });

  it("does not import or render a static coverage claim in the panel", () => {
    for (const source of ALL_MARKET_SURFACES) {
      expect(source).not.toContain("SWEDEN_COVERAGE_CURRENT");
      expect(source).not.toContain("market-coverage-claims");
      expect(source).not.toContain("activeVacanciesFloor");
      expect(source).not.toContain("identifiedEmployersFloor");
      expect(source).not.toContain("measured-floor");
    }
  });

  it("contains no hard-coded vacancy or employer total anywhere in the panel", () => {
    for (const source of ALL_MARKET_SURFACES) {
      for (const banned of BANNED_TOTALS) {
        expect(source).not.toContain(banned);
      }
    }
  });

  it("carries no bare four-or-more-digit literal in the landing reader", () => {
    // The reader is the only place a count could be introduced.
    const literals = reader.match(/(?<![\w.-])\d{4,}(?![\w.])/g) ?? [];
    expect(literals).toEqual([]);
  });

  it("omits an unavailable count instead of substituting a constant", () => {
    expect(reader).toContain("activeVacancies: null");
    expect(reader).toContain("distinctEmployers: null");
    expect(reader).toContain('basis: "unavailable"');
  });

  it("never rounds or re-buckets the canonical counts", () => {
    for (const fn of [
      "Math.round",
      "Math.floor",
      "Math.ceil",
      "toFixed",
      "toPrecision",
      "maximumSignificantDigits",
      "roundingIncrement",
    ]) {
      expect(focusBand).not.toContain(fn);
      expect(reader).not.toContain(fn);
    }
  });

  it("keeps regions out of the verified panel and Sweden as the source label", () => {
    // The field, not the word — the reader's prose still explains why no
    // region distribution is exposed.
    expect(reader).not.toMatch(/^\s*(readonly\s+)?regions\s*[:?]/m);
    expect(focusBand).not.toContain("market.regions");
  });

  it("serves the landing from the one canonical reader", () => {
    // The band must not grow its own reader, its own RPC or client polling:
    // it receives the snapshot the page already resolved, inside the one
    // 300 s freshness window.
    expect(focusPage).toContain("readLiveMarketLandingSnapshot");
    expect(focusBand).toContain("LiveMarketLandingSnapshot");
    expect(focusBand).toContain("market.activeVacancies");
    expect(focusBand).toContain("market.distinctEmployers");
    expect(reader).toContain("unstable_cache");
    expect(reader).toContain("revalidate: 300");
    // One reader for the whole product surface.
    expect(focusBand).not.toContain("createClient");
    expect(focusBand).not.toContain("useEffect");
    expect(focusBand).not.toContain("setInterval");
    expect(focusPage).not.toContain("setInterval");
  });

  it("omits an unavailable count in the band, rather than falling back to a floor", () => {
    expect(focusBand).toContain("market.activeVacancies !== null");
    expect(focusBand).toContain("market.distinctEmployers !== null");
    expect(focusBand).not.toContain("asOfNote");
    // The catalogs may no longer carry a value for either stat.
    for (const locale of ["en", "lt", "ru", "nl", "de"]) {
      const catalog = JSON.parse(
        read(`messages/${locale}.json`),
      ) as {
        landing: {
          marketProof: { stats: Record<string, { value?: string }> };
          [k: string]: unknown;
        };
      };
      const stats = catalog.landing.marketProof.stats;
      expect(stats.regions, `${locale}: regions`).toBeUndefined();
      for (const key of ["vacancies", "employers"]) {
        expect(stats[key].value, `${locale}: ${key}.value`).toBeUndefined();
      }
    }
  });

  it("shows the reader's own refresh timestamp as provenance", () => {
    expect(reader).toContain("lastRefreshedAt");
    expect(focusBand).toContain("market.lastRefreshedAt");
    expect(focusBand).toContain('review("verifiedMarketData")');
    expect(focusBand).toContain('review("dataSourceLabel")');
    // The stale hard-coded "as of <date>" note must not come back.
    expect(focusBand).not.toContain("basisNote");
  });
});
