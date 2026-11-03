import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";
import { entryLocaleForUnmatchedLanguage } from "@/lib/i18n/entry-locale";
import { routing } from "@/lib/i18n/routing";
import { resolvePostLoginLocale } from "@/lib/auth/locale-preference";

/**
 * AUTO-DETECTION NEVER LOCKS A PERSON IN (owner order 2026-10-23).
 *
 * The precedence, end to end:
 *
 *   1. the locale in the URL (what the language switcher links to) — always wins;
 *   2. the NEXT_LOCALE cookie (the manual choice, kept one year) — beats the
 *      browser's Accept-Language;
 *   3. Accept-Language — only when there is no choice yet, for EVERY active
 *      locale (not an LT/EN/RU subset); a browser stating only unrouted
 *      languages lands on English (lib/i18n/entry-locale.ts);
 *   4. the default.
 *
 * 1-4 are next-intl's `resolveLocaleFromPrefix` order (v4: prefix → cookie →
 * accept-language → default), which runs only while `localeDetection` is on and
 * the prefix is mandatory; a document navigation to `/<locale>/…` re-pins the
 * cookie (`syncCookie`). This file pins every input of that machinery that the
 * product owns, so none of them can drift into a lock-in. The account
 * preference (`profiles.locale`) only fills in on a fresh device with no cookie
 * and never overrides a device choice.
 */
const WEB = join(__dirname, "..", "..");

describe("the router negotiates over EVERY active locale, and detection can be overridden", () => {
  it("routing serves exactly activeLocales, prefix always, detection on", () => {
    expect([...routing.locales]).toEqual([...activeLocales]);
    expect(routing.localePrefix).toBe("always");
    // `false` would make the first detected locale the only reachable one.
    expect((routing as { localeDetection?: boolean }).localeDetection).not.toBe(false);
  });

  it("the manual choice survives a year (cookie maxAge)", () => {
    const cookie = routing.localeCookie;
    expect(cookie).not.toBe(false);
    expect((cookie as { maxAge?: number }).maxAge).toBe(60 * 60 * 24 * 365);
  });

  for (const locale of activeLocales) {
    it(`a ${locale} browser with no prior choice is left to next-intl (detected, not forced to EN)`, () => {
      expect(entryLocaleForUnmatchedLanguage(`${locale}-XX,${locale};q=0.9`, null)).toBeNull();
    });
  }
});

describe("a manual choice is never overridden by detection", () => {
  for (const chosen of activeLocales) {
    it(`cookie ${chosen} wins over any browser language`, () => {
      for (const browser of ["sv-SE", "fi", "uk", "ka", ...activeLocales]) {
        expect(entryLocaleForUnmatchedLanguage(browser, chosen)).toBeNull();
      }
    });
  }

  it("an unrouted browser lands on English and is NOT redirected again once a choice exists", () => {
    expect(entryLocaleForUnmatchedLanguage("sv-SE,sv;q=0.9,fi;q=0.8", null)).toBe("en");
    expect(entryLocaleForUnmatchedLanguage("sv-SE,sv;q=0.9", "nl")).toBeNull();
  });

  it("the account preference never overrides a device choice, for every active locale", () => {
    for (const chosen of activeLocales) {
      const decision = resolvePostLoginLocale({
        cookieLocale: chosen,
        profileLocale: chosen === "lt" ? "en" : "lt",
        urlLocale: chosen,
        onboarded: true,
      });
      expect(decision).toEqual({ locale: chosen, overridden: false });
    }
  });

  it("the switcher offers every active locale and also saves the choice to the account", () => {
    const src = readFileSync(join(WEB, "components/marketing/locale-switcher.tsx"), "utf8");
    expect(src).toMatch(/activeLocales\.map\(/);
    expect(src).toMatch(/persistLocalePreferenceAction\(l\)/);
  });
});
