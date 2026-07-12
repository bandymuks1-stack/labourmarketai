import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Geolocation recovery guard (user-journey root-cause repair v1, finding #2).
 *
 * Root cause pinned: browser location failures must be CAPABILITY-classified
 * (denied / denied-in-app / unavailable / timeout / unsupported / insecure
 * context), each with copy that is true for that state and a recovery that
 * can actually work — and the recovery controls must render ABOVE the map so
 * a blocked user never scrolls through a screenful of tiles to find them.
 *
 * The pure classification logic is unit-tested in
 * lib/browser/geo-capability.test.ts; this guard pins the UI wiring + copy.
 */

const ROOT = join(__dirname, "..", "..");
const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");
const base = read("components/app/market-map-base.tsx");

describe("capability-based failure handling in the location picker", () => {
  it("classifies failures via the shared capability module (not ad-hoc booleans)", () => {
    expect(base).toMatch(/classifyGeoFailure\(env, err\?\.code \?\? null\)/);
    expect(base).toMatch(/detectInAppBrowser\(nav\?\.userAgent \?\? null\)/);
    expect(base).toMatch(/window\.isSecureContext/);
  });
  it("every failure state has its own message key", () => {
    for (const key of ["geoDenied", "geoDeniedInApp", "geoUnavailable", "geoNoFix", "geoTimeout", "geoInsecure"]) {
      expect(base, key).toContain(`"${key}"`);
    }
  });
  it("retry renders ONLY when a retry can succeed", () => {
    expect(base).toMatch(/canRetrySucceed\(geoHint\) && \(/);
  });
  it("in-app browsers get contextual open-in-browser guidance", () => {
    expect(base).toMatch(/needsOpenInBrowserGuidance\(geoHint, geoEnvironment\(\)\)/);
    expect(base).toMatch(/map-locator-open-in-browser/);
  });
  it("failure always opens the manual fallback (no dead end)", () => {
    const failures = base.match(/setGeoHint\(classifyGeoFailure[\s\S]{0,120}?setManualOpen\(true\)/g) ?? [];
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });
  it("recovery controls render ABOVE the map panel (no scroll-past-map dead end)", () => {
    const autoButton = base.indexOf('data-testid="map-locator-auto"');
    const geoHint = base.indexOf('data-testid="map-locator-geo-hint"');
    const manual = base.indexOf('data-testid="map-locator-manual-toggle"');
    const mapPanel = base.indexOf('data-testid="location-panel"');
    expect(autoButton).toBeGreaterThan(-1);
    expect(geoHint).toBeGreaterThan(-1);
    expect(mapPanel).toBeGreaterThan(-1);
    expect(autoButton).toBeLessThan(mapPanel);
    expect(geoHint).toBeLessThan(mapPanel);
    expect(manual).toBeLessThan(mapPanel);
  });
});

describe("failure copy exists and stays technical-code-free (LT/EN)", () => {
  for (const loc of ["lt", "en"] as const) {
    it(`${loc}: all geo failure keys present, no error codes`, () => {
      const msgs = (JSON.parse(read(`messages/${loc}.json`)) as {
        marketMapBase: Record<string, string>;
      }).marketMapBase;
      for (const key of [
        "geoDenied", "geoDeniedInApp", "geoOpenInBrowser",
        "geoNoFix", "geoTimeout", "geoInsecure", "geoRetry",
      ]) {
        const v = msgs[key];
        expect(v?.trim().length, `${loc} ${key}`).toBeGreaterThan(0);
        expect(v, `${loc} ${key} technical terms`).not.toMatch(/PERMISSION_DENIED|POSITION_UNAVAILABLE|geolocation|\bAPI\b|kod(as|e)\s*\d|error\s*code/);
      }
    });
  }
});
