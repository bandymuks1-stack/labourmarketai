import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mobile map workspace + active-identity marker guard.
 *
 * The map (/dashboard/market-map) is a primary mobile workspace: the map is the
 * dominant element, the marker respects the ACTIVE identity (person vs company),
 * and a company context never reuses the personal identity / never shows a fake
 * company point. Future market layers stay disabled/preparing. No fake markers
 * or fake coordinate arrays anywhere.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const ACTIVE_LOCALES = ["lt", "en", "ru"] as const;
const PAGE = "app/[locale]/dashboard/market-map/page.tsx";
const LIVE = "components/app/market-map-live.tsx";
const LEGEND = "components/app/map-layers-legend.tsx";

describe("map page is map-first on mobile", () => {
  const page = read(PAGE);
  const live = read(LIVE);

  it("the live map container is tall on mobile (dominant), not a small embed", () => {
    expect(live).toMatch(/h-\[5\d?vh\]|h-\[6\dvh\]/); // e.g. h-[58vh]
  });

  it("the honest feature note comes AFTER the map (intro text doesn't lead)", () => {
    expect(page.indexOf("<MarketMapBase")).toBeLessThan(
      page.indexOf("feature-note-market-map"),
    );
  });

  it("the layers legend is present (compact visible-now / future layers)", () => {
    expect(page).toMatch(/<MapLayersLegend\b/);
  });
});

describe("active-identity marker logic (personal vs company)", () => {
  const page = read(PAGE);
  const live = read(LIVE);

  it("personal context builds a person marker with a real status pill", () => {
    expect(page).toMatch(/kind:\s*"person"/);
    expect(page).toMatch(/markerYou/);
    // person marker uses the user's own name + avatar (real data)
    expect(page).toMatch(/avatarUrl:\s*avatar\.signedUrl/);
  });

  it("company context suppresses the own-marker (never reuses personal identity)", () => {
    expect(page).toMatch(/isCompanyContext/);
    expect(page).toMatch(/suppressOwnMarker\s*=\s*isCompanyContext/);
    // the live marker honours the suppress flag (draws nothing)
    expect(live).toMatch(/if\s*\(suppressOwnMarker\)\s*return/);
  });

  it("missing company location renders an HONEST state, not a fake marker", () => {
    expect(page).toMatch(/market-map-company-context/);
    expect(page).toMatch(/companyContext\.missingLocation/);
    // the company name shown is the real company display/legal name, never the
    // personal username
    expect(page).toMatch(/companyName/);
  });

  it("marker pin distinguishes person vs company (kind drives the shape)", () => {
    expect(live).toMatch(/kind\s*===\s*"company"/);
  });
});

describe("no fake markers / coordinates anywhere on the map", () => {
  for (const rel of [PAGE, LIVE, LEGEND]) {
    const src = read(rel);
    it(`${rel}: no seeded marker / coordinate arrays`, () => {
      expect(src).not.toMatch(/markers?\s*[:=]\s*\[/i);
      expect(src).not.toMatch(/coordinates\s*[:=]\s*\[/i);
      // numeric-literal lat/lng = a hardcoded fake point (a `lat: number` TS
      // type or `coord.lat` access is fine).
      expect(src).not.toMatch(/\blat\b\s*:\s*-?\d/i);
      expect(src).not.toMatch(/\blng\b\s*:\s*-?\d/i);
    });
  }
});

describe("future market layers stay disabled/preparing", () => {
  const legend = read(LEGEND);
  it("future layers are aria-disabled chips, not fake markers", () => {
    expect(legend).toMatch(/aria-disabled="true"/);
    expect(legend).toMatch(/map-layers-future/);
  });
});

describe("floating feedback button does not obstruct the map", () => {
  it("the feedback widget is hidden on the market-map route", () => {
    const w = read("components/app/language-feedback-widget.tsx");
    expect(w).toMatch(/\/dashboard\/market-map/);
    expect(w).toMatch(/return null/);
  });
});

describe("broader market-surface copy (not narrow job-search wording)", () => {
  for (const loc of ACTIVE_LOCALES) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: marketMapBase title is not narrow 'job search' wording`, () => {
      const title = String(m.marketMapBase.title).toLowerCase();
      expect(/job search|darbo paie|поиска работы/.test(title)).toBe(false);
    });
    it(`${loc}: company-context + marker labels exist`, () => {
      expect(m.marketMap.companyContext?.missingLocation).toBeTruthy();
      expect(m.marketMap.companyContext?.missingLocationHint).toBeTruthy();
      expect(m.marketMap.markerYou).toBeTruthy();
    });
  }
});
