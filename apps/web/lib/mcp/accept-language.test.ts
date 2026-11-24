import { describe, expect, it } from "vitest";

import { defaultLocale } from "@/lib/i18n/config";
import { localeFromAcceptLanguage } from "./accept-language";

/**
 * Regression controls for a bug that REACHED the database: Node's own `fetch`
 * sends `Accept-Language: *`, and the raw first tag was passed through as a
 * locale until it tripped the journal `original_language` constraint during
 * the live MCP write proof. The helper exists because of that measurement —
 * these tests keep it from regressing.
 */
describe("localeFromAcceptLanguage", () => {
  it("refuses the wildcard Node fetch sends and falls back to the default", () => {
    expect(localeFromAcceptLanguage("*")).toBe(defaultLocale);
  });

  it("returns the base subtag of an active region-tagged locale", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("de-DE")).toBe("de");
  });

  it("skips quality weights and picks the first ACTIVE locale in the list", () => {
    expect(localeFromAcceptLanguage("fr-FR;q=1.0,ru;q=0.8,en;q=0.5")).toBe("ru");
  });

  it("fails closed to the default for inactive, empty, and absent headers", () => {
    expect(localeFromAcceptLanguage("fr")).toBe(defaultLocale);
    expect(localeFromAcceptLanguage("")).toBe(defaultLocale);
    expect(localeFromAcceptLanguage(null)).toBe(defaultLocale);
    expect(localeFromAcceptLanguage("xx-YY, zz")).toBe(defaultLocale);
  });

  it("is case-insensitive on the tag", () => {
    expect(localeFromAcceptLanguage("LT-lt")).toBe("lt");
  });
});
