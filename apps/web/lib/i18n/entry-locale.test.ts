import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { entryLocaleForUnmatchedLanguage } from "./entry-locale";

/**
 * Audit 2026-10-16 (U-1 / U-2): international entry.
 *
 * A browser that prefers a language we do not route lands on English, never
 * on the Lithuanian default; a browser that prefers a routed language, or a
 * person who already chose one (cookie), is left to next-intl. And the
 * `x-default` hreflang every public page and the jobs sitemap emit points at
 * English, so search engines serve unmatched-language searchers the same.
 */
describe("entryLocaleForUnmatchedLanguage", () => {
  it("an unrouted preference → English", () => {
    expect(entryLocaleForUnmatchedLanguage("sv-SE,sv;q=0.9", null)).toBe("en");
    expect(entryLocaleForUnmatchedLanguage("fi", null)).toBe("en");
    expect(entryLocaleForUnmatchedLanguage("fr-FR,fr;q=0.8,es;q=0.5", null)).toBe("en");
  });
  it("a routed preference anywhere in the list → let next-intl negotiate", () => {
    expect(entryLocaleForUnmatchedLanguage("sv-SE,sv;q=0.9,en;q=0.5", null)).toBeNull();
    expect(entryLocaleForUnmatchedLanguage("lt", null)).toBeNull();
    expect(entryLocaleForUnmatchedLanguage("de-AT", null)).toBeNull();
    expect(entryLocaleForUnmatchedLanguage("ru-RU", null)).toBeNull();
  });
  it("no stated preference is not a preference — the default stands", () => {
    expect(entryLocaleForUnmatchedLanguage(null, null)).toBeNull();
    expect(entryLocaleForUnmatchedLanguage("", null)).toBeNull();
    expect(entryLocaleForUnmatchedLanguage("*", null)).toBeNull();
  });
  it("a chosen routed locale (cookie) always wins over the browser list", () => {
    expect(entryLocaleForUnmatchedLanguage("sv-SE", "lt")).toBeNull();
    expect(entryLocaleForUnmatchedLanguage("sv-SE", "pl")).toBeNull();
    // a stale cookie naming an unrouted locale does not count as a choice
    expect(entryLocaleForUnmatchedLanguage("sv-SE", "sv")).toBe("en");
  });
});

describe("x-default hreflang points at English (U-2)", () => {
  it("hreflangAlternates emits x-default = /en", () => {
    const src = readFileSync(join(__dirname, "../seo/metadata.ts"), "utf8");
    expect(src).toContain('languages["x-default"] = localizedUrl("en", path);');
    expect(src).not.toContain('languages["x-default"] = localizedUrl(defaultLocale, path);');
  });
  it("the middleware consults the entry-locale rule before intl negotiates", () => {
    const src = readFileSync(join(__dirname, "../../middleware.ts"), "utf8");
    expect(src).toContain("entryLocaleForUnmatchedLanguage(");
    expect(src.indexOf("entryLocaleForUnmatchedLanguage(")).toBeLessThan(
      src.indexOf("const intlResponse = intl("),
    );
  });
});
