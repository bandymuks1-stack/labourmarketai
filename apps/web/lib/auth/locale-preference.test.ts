import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolvePostLoginLocale } from "./locale-preference";

/**
 * Post-login language priority (V8 W4-B item 2), pinned:
 *
 *   NEXT_LOCALE cookie  >  profiles.locale  >  the URL locale
 *                                              (Accept-Language-derived
 *                                               by the middleware)
 *
 * The account preference is honoured ONLY on a device with no explicit
 * cookie choice, only for a valid ACTIVE locale, and only when it actually
 * differs — a pointless override would churn cookies for nothing.
 */

describe("resolvePostLoginLocale — the priority order", () => {
  it("1. a device cookie wins over the profile preference", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: "lt",
      profileLocale: "ru",
      urlLocale: "lt",
    });
    expect(d).toEqual({ locale: "lt", overridden: false });
  });

  it("a cookie matching neither URL nor profile still blocks the override", () => {
    // The middleware owns cookie honouring on navigation; the callback must
    // not fight it, whatever the cookie says.
    const d = resolvePostLoginLocale({
      cookieLocale: "en",
      profileLocale: "ru",
      urlLocale: "lt",
    });
    expect(d.overridden).toBe(false);
  });

  it("2. with no cookie, a differing ACTIVE profile locale wins", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "ru",
      urlLocale: "lt",
    });
    expect(d).toEqual({ locale: "ru", overridden: true });
  });

  it("3. with no cookie and no profile preference, the URL locale stands", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: null,
      urlLocale: "de",
    });
    expect(d).toEqual({ locale: "de", overridden: false });
  });

  it("a profile locale matching the URL is not an override", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "lt",
      urlLocale: "lt",
    });
    expect(d).toEqual({ locale: "lt", overridden: false });
  });

  it("an inactive or invalid profile locale never overrides", () => {
    // `sv` exists as a catalog but is NOT an active routed locale; routing
    // it would 404. Garbage values must be equally inert.
    for (const bad of ["sv", "xx", "", "LT", "lt-LT"]) {
      const d = resolvePostLoginLocale({
        cookieLocale: null,
        profileLocale: bad,
        urlLocale: "lt",
      });
      expect(d, `profile locale "${bad}"`).toEqual({
        locale: "lt",
        overridden: false,
      });
    }
  });

  it("an empty cookie string counts as no cookie", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: "  ",
      profileLocale: "ru",
      urlLocale: "lt",
    });
    expect(d).toEqual({ locale: "ru", overridden: true });
  });
});

describe("the auth callback actually consults the resolver", () => {
  const src = readFileSync(
    resolve(__dirname, "..", "..", "app", "[locale]", "auth", "callback", "route.ts"),
    "utf8",
  );

  it("reads profiles.locale alongside onboarded_at", () => {
    expect(src).toContain('select("onboarded_at, locale")');
  });

  it("routes the decision through resolvePostLoginLocale and sets the cookie only on override", () => {
    expect(src).toContain("resolvePostLoginLocale(");
    expect(src).toContain("LOCALE_COOKIE_NAME");
    expect(src).toMatch(/if \(decision\.overridden\)/);
  });
});
