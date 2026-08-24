import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { LiveMarketLandingSnapshot } from "@/lib/market/live-market-landing";

/**
 * FOCUS renders the EXACT current counts — or none at all.
 *
 * The source-text guards prove the band no longer READS a floor from a
 * message catalog. They cannot prove what it PRINTS, and printing is where
 * the owner's requirement actually lives (§10/§11): the visitor must see the
 * value the canonical reader returned, not a rounded stand-in.
 *
 * CI has no database, so the deployed numbers can never be asserted here.
 * What can be asserted — and is what matters — is the TRANSFORM: given a
 * snapshot, exactly these characters reach the DOM. The two fixtures below
 * are arbitrary and deliberately unlike any floor the band ever shipped, so
 * a reintroduced constant could not coincidentally satisfy them.
 *
 * The second fixture is the §16 case: when the reader cannot answer, the band
 * must omit the counts rather than fall back to a marketing number.
 */

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) =>
    Object.assign((k: string) => `${ns}.${k}`, {
      raw: (k: string) => `${ns}.${k}`,
    }),
}));

vi.mock("@/components/marketing/reveal", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => children,
}));

const { MarketProofBand } = await import(
  "@/components/marketing/market-proof-band"
);

const LIVE_FIXTURE: LiveMarketLandingSnapshot = {
  activeVacancies: 43275,
  distinctEmployers: 8090,
  lastRefreshedAt: "2026-08-22T06:15:00.000Z",
  basis: "live",
  professions: [],
};

const UNAVAILABLE_FIXTURE: LiveMarketLandingSnapshot = {
  activeVacancies: null,
  distinctEmployers: null,
  lastRefreshedAt: null,
  basis: "unavailable",
  professions: [],
};

async function render(
  market: LiveMarketLandingSnapshot,
  locale = "en",
): Promise<string> {
  return renderToStaticMarkup(
    await MarketProofBand({ market, locale }),
  );
}

describe("FOCUS market numbers come from the canonical snapshot", () => {
  it("prints the exact counts, grouped for the locale, with no floor suffix", async () => {
    const html = await render(LIVE_FIXTURE);
    expect(html).toContain("43,275");
    expect(html).toContain("8,090");
    // A floor marker next to either number would re-approximate a known value.
    expect(html).not.toMatch(/43,275\s*\+/);
    expect(html).not.toMatch(/8,090\s*\+/);
    // And none of the retired floors may appear under any circumstances.
    for (const floor of ["35,000", "35 000", "7,000", "7 000", ">21<"]) {
      expect(html).not.toContain(floor);
    }
  });

  it("groups the same counts per locale rather than hard-coding a format", async () => {
    const lt = await render(LIVE_FIXTURE, "lt");
    const de = await render(LIVE_FIXTURE, "de");
    // lt groups with a non-breaking space, de with a dot — the point is that
    // the digits are identical and only the grouping follows the locale.
    for (const html of [lt, de]) {
      expect(html.replace(/[^\d]/g, "")).toContain("43275");
      expect(html.replace(/[^\d]/g, "")).toContain("8090");
    }
    expect(lt).not.toBe(de);
  });

  it("omits both counts when the reader could not answer (§16)", async () => {
    const html = await render(UNAVAILABLE_FIXTURE);
    // The stat cards themselves are gone — not rendered empty, not filled.
    expect(html).not.toContain('data-testid="market-proof-vacancies"');
    expect(html).not.toContain('data-testid="market-proof-employers"');
    expect(html).not.toContain("landing.marketProof.stats.vacancies.label");
    for (const floor of ["35,000", "35 000", "7,000", "7 000"]) {
      expect(html).not.toContain(floor);
    }
    // Nothing numeric survives in the visible copy (Tailwind class digits
    // aside, which is why this reads text nodes rather than raw markup).
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\d{3,}/);
    // The provenance goes with them: it describes the figures, so claiming
    // verified data beside no data would be its own small dishonesty.
    expect(html).not.toContain("livingMarketReview.verifiedMarketData");
    // The section itself still renders — the numbers are what disappear.
    expect(html).toContain("landing.marketProof.title");
  });

  it("carries subordinate provenance, never a pinned as-of date", async () => {
    const html = await render(LIVE_FIXTURE);
    expect(html).toContain("livingMarketReview.verifiedMarketData");
    expect(html).toContain("livingMarketReview.dataSourceLabel");
    // Owner directive 2026-08-24: the anonymous surface names only the KIND
    // of source, never the country. The country name must NOT render.
    expect(html).toContain("livingMarketReview.dataSourceGeneric");
    expect(html).not.toContain("Sweden");
    // The reader's own stamp, not a date typed into a catalog.
    expect(html).toContain("2026");
    expect(html).not.toContain("landing.marketProof.asOfNote");
  });

  it("drops the static regions metric entirely", async () => {
    const html = await render(LIVE_FIXTURE);
    expect(html).not.toContain("landing.marketProof.stats.regions.label");
    expect(html).toContain("landing.marketProof.stats.vacancies.label");
    expect(html).toContain("landing.marketProof.stats.employers.label");
    // Two cards, so the grid may not still claim three columns.
    expect(html).not.toContain("sm:grid-cols-3");
  });
});
