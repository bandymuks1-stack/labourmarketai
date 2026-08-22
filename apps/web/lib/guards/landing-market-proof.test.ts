import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADOPTION_VERBS,
  violatesAdoptionClaimRule,
} from "@/lib/analytics/market-coverage-claims";
import {
  MARKET_PROOF_STATS,
  TOP_PROFESSION_FAMILY_SLUGS,
} from "@/components/marketing/market-proof-band";

/**
 * Landing market-proof band honesty — CANONICAL DATA EDITION.
 *
 * The band used to state production-derived FLOORS ("35 000+" / "7 000+" /
 * "21") typed into the message catalogs, and this guard's job was to keep
 * those typed numbers equal to the proven claim module. Owner command
 * 2026-08-22 §9 ended that arrangement: FOCUS and LIVE must show ONE market
 * truth, read from the same canonical projection. A floor is a dated
 * approximation, and the platform knows the exact current counts.
 *
 * So the pins invert. What must now hold permanently:
 *
 *   1. the band declares exactly the two live stats — `regions` is gone,
 *      because the public vacancy contract exposes no region count and a
 *      static one would silently go stale under a "verified data" heading;
 *   2. NO locale catalog carries a market total or a pinned as-of date any
 *      more — the values cannot come from translation files at all, so a
 *      stale floor cannot be re-typed into one;
 *   3. the band reads the canonical snapshot and omits a count the reader
 *      could not return, rather than substituting a constant;
 *   4. coverage framing survives: no adoption verb, no country/"all Europe"
 *      total in any remaining string;
 *   5. every ranked profession slug resolves in every locale's canonical
 *      `professions` taxonomy catalog — a typo can never render a raw slug;
 *   6. the ranking still shows NO absolute per-profession counts (grouping
 *      covers only part of the listings).
 */

const webRoot = join(__dirname, "..", "..");
const LOCALES = [
  "en",
  "lt",
  "lv",
  "et",
  "nl",
  "de",
  "da",
  "no",
  "sv",
  "pl",
  "ru",
] as const;

type MarketProof = {
  eyebrow: string;
  title: string;
  stats: Record<string, { value?: string; label: string }>;
  asOfNote?: string;
  topTitle: string;
  topNote: string;
};

function loadMarketProof(locale: string): MarketProof {
  const catalog = JSON.parse(
    readFileSync(join(webRoot, "messages", `${locale}.json`), "utf8"),
  ) as { landing?: { marketProof?: MarketProof } };
  const mp = catalog.landing?.marketProof;
  if (!mp) throw new Error(`${locale}: landing.marketProof missing`);
  return mp;
}

const band = readFileSync(
  join(webRoot, "components", "marketing", "market-proof-band.tsx"),
  "utf8",
);
const focus = readFileSync(
  join(webRoot, "app", "[locale]", "focus-landing", "focus-landing.tsx"),
  "utf8",
);

describe("landing market-proof band honesty", () => {
  it("declares exactly the two live stats and a bounded ranking (5–8 families)", () => {
    expect([...MARKET_PROOF_STATS]).toEqual(["vacancies", "employers"]);
    expect(TOP_PROFESSION_FAMILY_SLUGS.length).toBeGreaterThanOrEqual(5);
    expect(TOP_PROFESSION_FAMILY_SLUGS.length).toBeLessThanOrEqual(8);
    expect(new Set(TOP_PROFESSION_FAMILY_SLUGS).size).toBe(
      TOP_PROFESSION_FAMILY_SLUGS.length,
    );
  });

  it("takes both counts from the canonical snapshot, never from a catalog", () => {
    expect(focus).toContain("readLiveMarketLandingSnapshot");
    expect(band).toContain("LiveMarketLandingSnapshot");
    expect(band).toContain("market.activeVacancies");
    expect(band).toContain("market.distinctEmployers");
    // The value can only come from the snapshot: no `stats.*.value` lookup.
    expect(band).not.toMatch(/stats\.\$\{key\}\.value|stats\.\w+\.value/);
    expect(band).toContain("numbers.format(supply[key])");
  });

  it("omits an unavailable count instead of substituting a constant", () => {
    expect(band).toContain("market.activeVacancies !== null");
    expect(band).toContain("market.distinctEmployers !== null");
    expect(band).toMatch(/supply\s*\?\s*\(/);
    // No rounding or re-bucketing of a canonical count.
    for (const fn of [
      "Math.round",
      "Math.floor",
      "Math.ceil",
      "toFixed",
      "maximumSignificantDigits",
    ]) {
      expect(band).not.toContain(fn);
    }
  });

  it("shows the reader's own provenance, not a pinned as-of date", () => {
    expect(band).toContain("market.lastRefreshedAt");
    expect(band).toContain('review("verifiedMarketData")');
    expect(band).toContain('review("dataSourceLabel")');
    expect(band).not.toContain("asOfNote");
    // Sweden is named through Intl from the region code — the source of the
    // figures, never a hard-coded scope claim.
    expect(band).toContain('type: "region" }).of("SE")');
  });

  it("carries no hard-coded market total in the band or the page", () => {
    for (const source of [band, focus]) {
      expect(source).not.toContain("SWEDEN_COVERAGE_CURRENT");
      expect(source).not.toContain("market-coverage-claims");
      for (const banned of [
        "35000",
        "35,000",
        "35 000",
        "7,000",
        "7 000",
        "41000",
        "8090",
        "43275",
      ]) {
        expect(source).not.toContain(banned);
      }
    }
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const mp = loadMarketProof(locale);

      it("carries no market total and no pinned as-of date any more", () => {
        expect(mp.asOfNote).toBeUndefined();
        expect(mp.stats.regions).toBeUndefined();
        for (const key of MARKET_PROOF_STATS) {
          expect(mp.stats[key], `${locale}: stats.${key}`).toBeDefined();
          expect(
            mp.stats[key].value,
            `${locale}: stats.${key}.value must not exist — the value is live`,
          ).toBeUndefined();
          expect(typeof mp.stats[key].label).toBe("string");
        }
        // No remaining string may carry a bare 4+ digit figure.
        for (const s of [
          mp.eyebrow,
          mp.title,
          mp.topTitle,
          mp.topNote,
          ...Object.values(mp.stats).map((v) => v.label),
        ]) {
          expect(s, `${locale}: ${s}`).not.toMatch(/(?<![\w.])\d{4,}/);
        }
      });

      it("keeps coverage framing — no adoption verbs, no Europe/country totals", () => {
        const all: string[] = [
          mp.eyebrow,
          mp.title,
          mp.topTitle,
          mp.topNote,
          ...Object.values(mp.stats).map((s) => s.label),
        ];
        for (const s of all) {
          expect(violatesAdoptionClaimRule(s), s).toBe(false);
          const lower = s.toLowerCase();
          for (const verb of ADOPTION_VERBS) {
            expect(lower.includes(verb), `${s} ~ ${verb}`).toBe(false);
          }
          expect(lower).not.toMatch(
            /across (all of )?europe|visoje europoje|по всей европе/,
          );
        }
      });

      it("every ranked profession slug resolves in the canonical taxonomy catalog", () => {
        const taxonomy = JSON.parse(
          readFileSync(
            join(webRoot, "messages", locale, "professions.json"),
            "utf8",
          ),
        ) as Record<string, unknown>;
        for (const slug of TOP_PROFESSION_FAMILY_SLUGS) {
          expect(typeof taxonomy[slug], `${locale}/${slug}`).toBe("string");
        }
      });

      it("keeps the honest ranking note", () => {
        expect(mp.topNote.length).toBeGreaterThan(10);
      });
    });
  }

  it("renders the ranking without absolute per-profession numbers", () => {
    expect(band).toMatch(/professions\(slug\)/);
    expect(band).not.toMatch(/adsCount|employerCount|perProfession/);
  });
});
