import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TODAY_STATIONS } from "../today/today-route";

/**
 * Market Map first-class navigation guard.
 *
 * The market map must be a clear first-class choice for a logged-in user —
 * embedded in the worker's PASAULIS tab, linked in full from that tab's map
 * header, and offered by the universal command search — with LT/EN/RU labels
 * and no fake markers. (W3 Package 4 deleted the second dashboard and its
 * IdentityActions tiles; the catalogue nav tab renders only in the admin
 * chrome, so it is NOT a door for real users — see the first test.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("market map is exposed in the primary nav + opportunities", () => {
  const opportunities = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("the PASAULIS tab destination embeds the geographic map and links the full map before any disclosure", () => {
    // Honest door (R-11 reclassification, 2026-09-19). The catalogue's
    // primary nav tabs (VISIBLE_PRIMARY_NAV_ITEMS) render only in the admin
    // `full` chrome (lib/config/navigation.ts: dashboardChromeMode → "full" = /dashboard/admin
    // only), so "market_map is a primary nav tab" proved nothing for a real
    // user — the earlier version of this test was a reachability proof that
    // could not fail while the tab was invisible to everyone but an admin.
    // What a worker really walks: the opportunities station (TODAY_STATIONS
    // `world` → /dashboard/opportunities, one tap from ŠIANDIEN inside the
    // conversation; also the find-work intent and a search command) embeds
    // WorldDiscovery — THE WORLD layer — in a top-level section, and the map
    // header links the full /dashboard/market-map page. Both sit BEFORE the
    // first collapsed <details>.
    const world = TODAY_STATIONS.find((t) => t.id === "world");
    expect(world?.href).toBe("/dashboard/opportunities");
    // ── THE EMBEDDED VIEWPORT IS WITHHELD (owner decision 2026-09-27)
    //
    // This test used to require `<WorldDiscovery mapMode="result">` and a
    // `data-testid="opportunities-map"` section on this page. Walked on
    // production, that embedded map was not an honest door — it was a
    // misleading one:
    //
    //   · it opened on `EUROPE_CENTER = [52.2, 6.0]`, a coordinate inside the
    //     NETHERLANDS (NL centroid 52.13/5.29; DE 51.16/10.45), so a person who
    //     had told us they are in Germany was shown NL as their work geography;
    //   · it had nothing true to draw anyway: all 111 187 `public_vacancies`
    //     rows were `country = 'SE'` and NONE carried lat/lng, so the demand
    //     layer had zero mappable opportunities.
    //
    // A viewport constant is not a fact about where work is (SEP-1), so the
    // viewport is withheld until the demand layer has real coordinates. The
    // CAPABILITY is untouched: `WorldDiscovery`, `loadWorldView`, the world
    // model and /dashboard/market-map all still exist, and the door below is
    // what this test now proves.
    expect(opportunities).not.toMatch(/<WorldDiscovery/);
    // THE DOOR MUST SURVIVE THE VIEWPORT. This is the whole point of the
    // R-11 reclassification recorded above: the primary nav tabs are invisible
    // to non-admins, so this link is the worker's real way to the full map and
    // it has to stay ABOVE the first collapsed disclosure.
    const fullMapLink = opportunities.indexOf('data-testid="opportunities-map-full-link"');
    const firstDetails = opportunities.indexOf("<details");
    expect(fullMapLink, "top-level full-map link").toBeGreaterThan(-1);
    expect(firstDetails, "a collapsed disclosure exists further down").toBeGreaterThan(-1);
    expect(fullMapLink).toBeLessThan(firstDetails);
  });

  it("the universal command search offers the map before any typing, at every width", () => {
    // Second honest door: the top-bar search renders on every width and lists
    // `market_map` as a starter command with an empty input.
    const finder = read("components/app/command-finder.tsx");
    expect(finder).toMatch(/STARTER_COMMAND_IDS[^;]*"market_map"/);
  });

  it("the secondary marketplace route redirects to the map (no competing surface)", () => {
    // W1: same intent, new mechanism — the redirect lives in next.config.
    expect(isCanonicallyRedirected("/dashboard/marketplace", "/dashboard/market-map")).toBe(true);
  });

  it("the opportunities surface links to the market map", () => {
    expect(opportunities).toMatch(/opportunities-market-map-link/);
    expect(opportunities).toMatch(/\/dashboard\/market-map/);
  });
});

describe("market map labels exist in every active locale", () => {
  // W3 Package 4 removed the identityActions namespace with the second
  // dashboard; the opportunities door keeps the canonical label.
  const expected = { lt: "Rinkos žemėlapis", en: "Market map", ru: "Карта рынка" };
  for (const loc of ["lt", "en", "ru"] as const) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: opportunities marketMapLink label present`, () => {
      expect(m.opportunities.marketMapLink).toBe(expected[loc]);
    });
  }
});

describe("no fake markers on the map (signal-only)", () => {
  const shell = read("components/app/market-map-shell.tsx");
  it("the shell plots no markers/coordinates/lat-lng/external map", () => {
    expect(shell).not.toMatch(/markers?\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/coordinates\s*[:=]\s*\[/i);
    expect(shell).not.toMatch(/\blat\b\s*[:=].*\blng\b/i);
    expect(shell).not.toMatch(/mapbox|google[^\n]*maps/i);
  });
});
