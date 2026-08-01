import { describe, expect, it } from "vitest";
import { isCanonicallyRedirected } from "./canonical-redirects";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VISIBLE_PRIMARY_NAV_ITEMS } from "../config/navigation";

/**
 * Market Map first-class navigation guard.
 *
 * The market map must be a clear first-class choice for a logged-in user —
 * reached via the primary nav and from the opportunities surface — with
 * LT/EN/RU labels and no fake markers. (W3 Package 4 deleted the second
 * dashboard and its IdentityActions tiles; the nav tab is the one door.)
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("market map is exposed in the primary nav + opportunities", () => {
  const opportunities = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("the market map is reached via its OWN primary nav tab", () => {
    // IA cleanup: the map is the central visual market surface, reached directly
    // as the "Žemėlapis" global nav tab.
    expect(
      VISIBLE_PRIMARY_NAV_ITEMS.some(
        (i) => i.href === "/dashboard/market-map",
      ),
      "market-map is a primary nav tab",
    ).toBe(true);
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
