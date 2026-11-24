/**
 * First-use UX guards (owner feedback pass, 2026-07-04).
 *
 * Real first-session friction this pins the fixes for:
 *   (a) the light/dark toggle existed ONLY deep in /dashboard/account, so a
 *       first-time user never discovered the theme — it must stay reachable
 *       from the always-visible avatar menu on every dashboard page;
 *   (b) "25 km" radius meant nothing to a first-time mobile user — the
 *       location picker must say in plain words what the radius circle is,
 *       in every language the dashboard actually ships (LT/EN/RU);
 *   (c) a denied Android/browser geolocation prompt used to dead-end with
 *       "choose manually" — the hint must tell the user they can re-allow
 *       location in browser settings.
 *
 * Source-level, no DB. Same storage contract as <ThemeToggle/> is asserted so
 * the two toggles can never drift apart (localStorage "theme" +
 * document.documentElement.dataset.theme).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(APP_ROOT, rel), "utf8");
const readJson = (rel: string): Record<string, unknown> =>
  JSON.parse(read(rel)) as Record<string, unknown>;

// The dashboard's actually-translated languages (marketMapBase namespace is
// LT/EN/RU-first by design; the other 8 locales are marketing-complete only —
// documented dashboard i18n debt, not silently expanded here).
const DASHBOARD_LOCALES = ["en", "lt", "ru"];

describe("theme toggle is discoverable from the always-visible avatar menu", () => {
  const menu = read("components/app/account-menu.tsx");

  it("account menu carries the theme toggle menuitem", () => {
    expect(menu).toMatch(/data-testid="account-menu-theme-toggle"/);
  });

  it("uses the SAME storage contract as <ThemeToggle/> (no drift)", () => {
    expect(menu).toMatch(/localStorage\.setItem\("theme"/);
    expect(menu).toMatch(/document\.documentElement\.dataset\.theme/);
  });

  it("the settings-page toggle is not removed (both surfaces live)", () => {
    expect(read("app/[locale]/dashboard/account/page.tsx")).toMatch(/<ThemeToggle/);
  });
});

describe("location radius is a plain control of the one map (25 km must mean something)", () => {
  it("the radius is a labelled select whose circle is drawn on the map itself", () => {
    // The prose radius explanation (`radiusHelp`) was deliberately removed with
    // the other explanatory blocks of the map page (one-canonical-map): the
    // meaning of the radius is now the circle drawn around the saved location.
    const controls = read("components/app/market-map/map-location-controls.tsx");
    expect(controls).toMatch(/data-testid="map-locator-radius"/);
    expect(controls).toMatch(/aria-label=\{t\("radiusLabel"\)\}/);
    expect(read("components/app/market-map/own-location-layer.ts")).toMatch(/radius: overlay\.radiusKm \* 1000/);
  });

  for (const loc of DASHBOARD_LOCALES) {
    it(`${loc}: the radius option copy names the km value`, () => {
      const map = readJson(`messages/${loc}.json`).marketMapBase as Record<string, string>;
      expect(map.radiusValue, `${loc} radiusValue`).toContain("{km}");
    });

    it(`${loc}: geoDenied explains how to re-allow location (Android first-use)`, () => {
      const map = readJson(`messages/${loc}.json`).marketMapBase as Record<string, string>;
      // Must mention browser settings, not just "choose manually".
      expect(map.geoDenied, `${loc} geoDenied`).toMatch(
        /nustatym|настройк|settings/i,
      );
    });
  }
});
