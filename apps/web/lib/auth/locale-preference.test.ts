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
      onboarded: true,
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
      onboarded: true,
    });
    expect(d.overridden).toBe(false);
  });

  it("2. with no cookie, a differing ACTIVE profile locale wins", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "ru",
      urlLocale: "lt",
      onboarded: true,
    });
    expect(d).toEqual({ locale: "ru", overridden: true });
  });

  it("3. with no cookie and no profile preference, the URL locale stands", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: null,
      urlLocale: "de",
      onboarded: true,
    });
    expect(d).toEqual({ locale: "de", overridden: false });
  });

  it("a profile locale matching the URL is not an override", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "lt",
      urlLocale: "lt",
      onboarded: true,
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
        onboarded: true,
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
      onboarded: true,
    });
    expect(d).toEqual({ locale: "ru", overridden: true });
  });
});

describe("resolvePostLoginLocale — a NOT-yet-onboarded account is never locale-pinned by the DB default", () => {
  // `handle_new_user` (0003) defaults profiles.locale to 'lt' when OAuth
  // supplies no locale in raw_user_meta_data — which the Google path never
  // does. Before onboarding that value is a fabrication, not a choice: a
  // brand-new Google signup who landed on /en must NOT be yanked into
  // /lt/onboarding, and NEXT_LOCALE must not be pinned for a year.
  it("the profile locale does NOT override the URL locale before onboarding", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "lt",
      urlLocale: "en",
      onboarded: false,
    });
    expect(d).toEqual({ locale: "en", overridden: false });
  });

  it("no cookie is pinned for a non-onboarded user (overridden stays false)", () => {
    for (const url of ["en", "ru", "de", "nl", "lt"]) {
      const d = resolvePostLoginLocale({
        cookieLocale: null,
        profileLocale: "lt",
        urlLocale: url,
        onboarded: false,
      });
      expect(d, `urlLocale "${url}"`).toEqual({
        locale: url,
        overridden: false,
      });
    }
  });

  it("the SAME input with onboarding completed overrides exactly as before", () => {
    // Returning-user behavior stays byte-identical: this pair pins that the
    // `onboarded` flag is the ONLY discriminator.
    const before = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "ru",
      urlLocale: "lt",
      onboarded: false,
    });
    expect(before).toEqual({ locale: "lt", overridden: false });
    const after = resolvePostLoginLocale({
      cookieLocale: null,
      profileLocale: "ru",
      urlLocale: "lt",
      onboarded: true,
    });
    expect(after).toEqual({ locale: "ru", overridden: true });
  });

  it("a device cookie still wins for a non-onboarded user (branch 1 unchanged)", () => {
    const d = resolvePostLoginLocale({
      cookieLocale: "en",
      profileLocale: "lt",
      urlLocale: "en",
      onboarded: false,
    });
    expect(d).toEqual({ locale: "en", overridden: false });
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

  it("passes the REAL onboarded state so a signup default can never override", () => {
    expect(src).toMatch(/onboarded:\s*Boolean\(profile\?\.onboarded_at\)/);
  });
});
