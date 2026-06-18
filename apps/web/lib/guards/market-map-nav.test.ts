import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Market Map first-class navigation guard.
 *
 * The market map must be a clear first-class choice for a logged-in user — in
 * the person AND company command centers, on the dashboard, and reachable from
 * the opportunities surface — with LT/EN/RU labels and no fake markers.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

describe("market map is exposed in the command centers + dashboard", () => {
  const identity = read("components/app/identity-actions.tsx");
  const dashboard = read("app/[locale]/dashboard/page.tsx");
  const opportunities = read("app/[locale]/dashboard/opportunities/page.tsx");

  it("IdentityActions has a marketMap action pointing at /dashboard/market-map", () => {
    expect(identity).toMatch(/key:\s*"marketMap"/);
    expect(identity).toMatch(/\/dashboard\/market-map/);
  });

  it("the marketMap action appears in BOTH person and company lists", () => {
    // two occurrences of the marketMap key (person + company)
    const count = (identity.match(/key:\s*"marketMap"/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("the dashboard links to the market map (via the My Work View cockpit)", () => {
    expect(dashboard).toMatch(/<MyWorkView/);
    const cockpit = read("lib/dashboard/my-work-view.ts");
    expect(cockpit).toMatch(/\/dashboard\/market-map/);
  });

  it("the opportunities surface links to the market map", () => {
    expect(opportunities).toMatch(/opportunities-market-map-link/);
    expect(opportunities).toMatch(/\/dashboard\/market-map/);
  });
});

describe("market map labels exist in every active locale", () => {
  const expected = { lt: "Rinkos žemėlapis", en: "Market map", ru: "Карта рынка" };
  for (const loc of ["lt", "en", "ru"] as const) {
    const m = JSON.parse(read(`messages/${loc}.json`));
    it(`${loc}: person + company marketMap action title = "${expected[loc]}"`, () => {
      expect(m.identityActions.person.actions.marketMap?.title).toBe(expected[loc]);
      expect(m.identityActions.company.actions.marketMap?.title).toBe(expected[loc]);
    });
    it(`${loc}: marketMap action carries the signal/preview explanation`, () => {
      const desc = m.identityActions.person.actions.marketMap?.desc as string;
      expect(desc, `${loc} desc`).toBeTruthy();
      expect(/signal|signal|сигнал/i.test(desc) || /preview/i.test(desc)).toBe(true);
    });
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
