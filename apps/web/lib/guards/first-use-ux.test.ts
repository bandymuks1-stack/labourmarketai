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

describe("location radius is explained in plain words (25 km must mean something)", () => {
  it("the picker renders the radius explanation", () => {
    const base = read("components/app/market-map-base.tsx");
    expect(base).toMatch(/data-testid="map-locator-radius-help"/);
    expect(base).toMatch(/t\("radiusHelp"/);
  });

  for (const loc of DASHBOARD_LOCALES) {
    it(`${loc}: radiusHelp copy exists and names the km value`, () => {
      const map = readJson(`messages/${loc}.json`).marketMapBase as Record<string, string>;
      expect(map.radiusHelp, `${loc} radiusHelp`).toBeTruthy();
      expect(map.radiusHelp).toContain("{km}");
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
