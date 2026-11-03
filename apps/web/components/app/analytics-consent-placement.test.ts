import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { isAuthPath } from "@/components/app/analytics-consent";

/**
 * The consent banner never pushes the first screen's own action out of view
 * (owner P0 2026-11-03: the sign-up action is visible at 360x740 and
 * 390x844). It stays compact, and on /auth/* it sits BELOW the form.
 */

const WEB = resolve(__dirname, "..", "..");
const AUTH_LAYOUT = readFileSync(join(WEB, "app", "[locale]", "auth", "layout.tsx"), "utf8");
const LOCALES = readdirSync(join(WEB, "messages")).filter((f) => f.endsWith(".json"));

describe("banner placement", () => {
  it("recognises auth paths with and without a locale prefix", () => {
    expect(isAuthPath("/lt/auth/signup")).toBe(true);
    expect(isAuthPath("/auth/login")).toBe(true);
    expect(isAuthPath("/en/auth")).toBe(true);
    expect(isAuthPath("/lt/authority")).toBe(false);
    expect(isAuthPath("/lt/dashboard")).toBe(false);
    expect(isAuthPath(null)).toBe(false);
  });

  it("the auth layout renders the banner after the form, not before it", () => {
    const children = AUTH_LAYOUT.indexOf("{children}");
    const banner = AUTH_LAYOUT.indexOf('<AnalyticsConsentBanner\n            placement="after-form"');
    expect(children).toBeGreaterThan(-1);
    expect(banner).toBeGreaterThan(children);
  });
});

describe("banner copy stays one short sentence", () => {
  it.each(LOCALES)("%s", (file) => {
    const banner = JSON.parse(readFileSync(join(WEB, "messages", file), "utf8")).consent.banner;
    // Two lines at 360 px with the "more" link; the full text lives on the Cookie Policy.
    expect(banner.text.length).toBeLessThanOrEqual(100);
    expect(banner.text.split(/[.!?](?:\s|$)/).filter(Boolean)).toHaveLength(1);
    expect(banner.more.length).toBeLessThanOrEqual(12);
  });
});
