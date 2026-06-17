import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map UI wiring v1 guard.
 *
 * The map UI is wired to the #459 OWNER read layer (getOwnMarketSignals) only:
 * the six signal categories with filter chips, country/region level, login
 * approximate + consent-gated, no exact point, no public/cross-user aggregate.
 */

const APP = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
const SHELL = read("components/app/market-map-shell.tsx");
const MY = read("components/app/market-map-my-signals.tsx");
const LOCALES = ["lt", "en", "ru"] as const;

describe("owner view uses the #459 read layer", () => {
  it("shell fetches getOwnMarketSignals and renders MarketMapMySignals", () => {
    expect(SHELL).toMatch(/getOwnMarketSignals/);
    expect(SHELL).toMatch(/<MarketMapMySignals\b/);
  });
  it("the panel consumes NormalizedSignal[] (read-layer model), not the fetcher", () => {
    expect(MY).toMatch(/NormalizedSignal/);
    expect(MY).not.toMatch(/getOwnMarketSignals/);
  });
});

describe("public/cross-user aggregate is NOT wired", () => {
  it("the UI never calls marketSignals()", () => {
    expect(SHELL).not.toMatch(/\bmarketSignals\b/);
    expect(MY).not.toMatch(/\bmarketSignals\b/);
  });
});

const TYPES = [
  "profile_location",
  "company_location",
  "login_location",
  "preferred_location",
  "company_need_location",
  "project_location",
] as const;

describe("six signal categories + filter chips", () => {
  // testids are built with template literals (`market-map-category-${type}`), so
  // we assert the prefix + each type string literal that drives them.
  it("renders a category block per type (testid prefix + type literals)", () => {
    expect(MY).toContain("market-map-category-");
    for (const t of TYPES) expect(MY, t).toContain(`"${t}"`);
  });
  it("renders the filter chips / legend (prefix + all-filter)", () => {
    expect(MY).toContain("market-map-filter-chips");
    expect(MY).toContain("market-map-filter-");
    expect(MY).toMatch(/key:\s*"all"/);
  });
});

describe("privacy — login consent-gated, never exact", () => {
  it("revoked / not_requested login signals are filtered out of the UI", () => {
    // The panel drops login rows whose consent status is not 'consented'.
    expect(MY).toMatch(/login_location"\s*&&\s*s\.sourceStatus\s*!==\s*"consented"/);
  });
  it("the panel renders no coordinates / address for login or anything else", () => {
    expect(MY).not.toMatch(/\blatitude\b|\blongitude\b/);
    expect(MY).not.toMatch(/\baddress\b/i);
    expect(MY).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
});

describe("CTAs point to real routes", () => {
  it("profile / company routes only (no coming-soon)", () => {
    expect(MY).toMatch(/\/dashboard\/profile/);
    expect(MY).toMatch(/\/dashboard\/company/);
    expect(MY).not.toMatch(/coming.?soon|ruošiam|готовится/i);
  });
  it("each category exposes a CTA (testid prefix + per-category ctaKey)", () => {
    expect(MY).toContain("market-map-cta-");
    for (const cta of ["ctaRefineProfile", "ctaRefineCompany", "ctaLogin", "ctaAddPreferred", "ctaAddDemand", "ctaProject"]) {
      expect(MY, cta).toContain(cta);
    }
  });
});

describe("copy regression — no empty/fake framing in mySignals", () => {
  for (const loc of LOCALES) {
    it(`${loc}: mySignals keys present and clean`, () => {
      const ms = JSON.parse(read(`messages/${loc}.json`)).marketMap.mySignals;
      expect(ms, `${loc} mySignals`).toBeTruthy();
      for (const k of ["title", "countryLevelNotice", "exactHidden", "loginNeutral", "filterAll"]) {
        expect(ms[k], `${loc} mySignals.${k}`).toBeTruthy();
      }
      const blob = JSON.stringify(ms);
      expect(blob).not.toMatch(/kol kas tuščias|\bfake\b|netikri taškai|пока пуста|фиктивн/i);
    });
  }
});
