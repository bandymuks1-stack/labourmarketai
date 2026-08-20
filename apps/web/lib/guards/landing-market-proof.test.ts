import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADOPTION_VERBS,
  SWEDEN_COVERAGE_CURRENT,
  SWEDEN_MEASUREMENT_CURRENT,
  floorsAreSupportedBy,
  violatesAdoptionClaimRule,
} from "@/lib/analytics/market-coverage-claims";
import {
  MARKET_PROOF_STATS,
  TOP_PROFESSION_FAMILY_SLUGS,
} from "@/components/marketing/market-proof-band";

/**
 * Landing market-proof honesty (landing minimal truth update, owner mandate
 * 2026-08-17, functional completion train V2 §27).
 *
 * The landing's market-proof band states production-derived FLOOR numbers and
 * a data-derived profession ranking. These pins keep it honest permanently:
 *
 *   1. every locale's displayed numbers ARE the proven floors from
 *      `market-coverage-claims.ts` — not a re-typed number that can silently
 *      drift from the claim module — and those floors are themselves
 *      supported by a dated, browsable-basis, multi-day production window
 *      (owner-approved correction 2026-08-19: the band advertised 41 000+ /
 *      7 600+ derived on a predicate the public job board does not use);
 *   2. no marketProof string attaches an adoption verb to a company count,
 *      and none claims a country-total or an "all Europe" scope;
 *   3. every ranked profession slug resolves in every locale's canonical
 *      `professions` taxonomy catalog — a typo can never render a raw slug;
 *   4. the band shows a ranking WITHOUT absolute per-profession counts
 *      (grouping covers only part of the listings), and the honest basis
 *      notes stay present.
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
  stats: Record<string, { value: string; label: string }>;
  asOfNote: string;
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

/** "41 000+" / "41,000+" / "41.000+" → 41000. */
const numeric = (value: string): number =>
  Number(value.replace(/[^\d]/g, ""));

describe("landing market-proof band honesty", () => {
  it("declares exactly the three stats and a bounded ranking (5–8 families)", () => {
    expect([...MARKET_PROOF_STATS]).toEqual([
      "vacancies",
      "employers",
    ]);
    expect(TOP_PROFESSION_FAMILY_SLUGS.length).toBeGreaterThanOrEqual(5);
    expect(TOP_PROFESSION_FAMILY_SLUGS.length).toBeLessThanOrEqual(8);
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      const mp = loadMarketProof(locale);

      /**
       * The band no longer RENDERS these message values. It reads the exact
       * current counts from count_public_vacancies_v1, so a floor string can
       * never again be shown as the current market (owner rule: reuse
       * canonical data, never restore a stale number).
       *
       * The strings stay in messages/ as the provenance record and are still
       * pinned to the claim module, so they cannot silently drift into
       * something a future surface might render as fresh.
       */
      it("keeps the retained floor strings pinned to the claim module", () => {
        expect(numeric(mp.stats.vacancies.value)).toBe(
          SWEDEN_COVERAGE_CURRENT.activeVacanciesFloor,
        );
        expect(numeric(mp.stats.employers.value)).toBe(
          SWEDEN_COVERAGE_CURRENT.identifiedEmployersFloor,
        );
        // Floors stay marked as floors, never as exact.
        expect(mp.stats.vacancies.value.endsWith("+")).toBe(true);
        expect(mp.stats.employers.value.endsWith("+")).toBe(true);
      });

      it("keeps coverage framing — no adoption verbs, no Europe/country totals", () => {
        const all: string[] = [
          mp.eyebrow,
          mp.title,
          mp.asOfNote,
          mp.topTitle,
          mp.topNote,
          ...Object.values(mp.stats).flatMap((s) => [s.value, s.label]),
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

      it("carries the honest basis notes and no per-profession counts", () => {
        expect(mp.asOfNote.length).toBeGreaterThan(10);
        expect(mp.topNote.length).toBeGreaterThan(10);
        // The as-of note carries the measurement's OWN date, in this
        // locale's format — a stale date on a daily-moving number is the
        // defect this band already shipped once.
        const [y, m, d] = SWEDEN_MEASUREMENT_CURRENT.measuredAt.split("-");
        const accepted = [`${y}-${m}-${d}`, `${d}.${m}.${y}`, `${d}-${m}-${y}`];
        expect(
          accepted.some((form) => mp.asOfNote.includes(form)),
          `${locale}: asOfNote must carry ${accepted.join(" / ")} — got: ${mp.asOfNote}`,
        ).toBe(true);
      });
    });
  }

  it("the rendered floors are supported by a dated browsable-basis window", () => {
    // The landing may never advertise more than the public job board can
    // serve. This is the pin that the 2026-08-17 floors would have failed.
    expect(
      floorsAreSupportedBy(SWEDEN_COVERAGE_CURRENT, SWEDEN_MEASUREMENT_CURRENT),
    ).toBe(true);
  });

  it("the band renders the ranking without absolute per-profession numbers", () => {
    const src = readFileSync(
      join(webRoot, "components", "marketing", "market-proof-band.tsx"),
      "utf8",
    );
    // The rendered <li> shows rank + taxonomy name only. The band must not
    // interpolate an ads/employers count next to a profession name — the
    // grouped subset understates the market and would read as a total.
    expect(src).toMatch(/professions\(slug\)/);
    expect(src).not.toMatch(/adsCount|employerCount|perProfession/);
  });
});

/**
 * The restored FOCUS baseline must not reintroduce the static numbers the
 * band originally shipped with.
 */
describe("market-proof band renders live counts, not message values", () => {
  const band = readFileSync(
    join(__dirname, "..", "..", "components", "marketing", "market-proof-band.tsx"),
    "utf8",
  );

  it("reads the canonical snapshot instead of landing.marketProof values", () => {
    expect(band).toContain("readLiveMarketLandingSnapshot");
    expect(band).toContain("market.activeVacancies");
    expect(band).toContain("market.distinctEmployers");
    expect(band).not.toContain("stats.${key}.value");
    // The import, not the word — the header prose still records which floors
    // the band used to quote and why they were replaced.
    expect(band).not.toMatch(/import[^;]*market-coverage-claims/);
  });

  it("drops the statistic that has no current source, and the pinned date", () => {
    expect(MARKET_PROOF_STATS).not.toContain("regions");
    expect(band).not.toContain('t("asOfNote")');
    expect(band).toContain("lastRefreshedAt");
  });
});
