import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activeLocales, locales } from "@/lib/i18n/config";
import { NON_UI_TAXONOMY_LOCALES } from "@/lib/i18n/launch-language-scope";
import {
  ACQUISITION_ONLY_LANGUAGES,
  UNROUTED_LANGUAGE_CODES,
  UNSUPPORTED_LANGUAGE_FALLBACK,
  unsupportedLanguageRedirectPath,
} from "@/lib/i18n/unsupported-language";

/**
 * THE DEFECT THIS GUARDS, STATED AS A FACT ABOUT PRODUCTION.
 *
 * Measured 2026-09-09, redirects not followed: `/sv` → 307 → `/lt/sv`. The
 * route did not fail. It resolved, into Lithuanian, for a reader who had just
 * clicked Swedish copy. No 404, no broken link, no failing test — which is why
 * it survived until a system outside this repo went looking.
 *
 * These tests are therefore about two things that are easy to get wrong later:
 * that a language code never again becomes a path segment, and that this file
 * never quietly becomes a way to CLAIM a language we cannot render.
 */

describe("a language code we do not route is not a page name", () => {
  it("sends the three acquisition languages to the English product", () => {
    expect(unsupportedLanguageRedirectPath("/sv")).toBe("/en");
    expect(unsupportedLanguageRedirectPath("/pl")).toBe("/en");
    expect(unsupportedLanguageRedirectPath("/uk")).toBe("/en");
  });

  it("never sends any of them into Lithuanian", () => {
    // The exact production behaviour being replaced.
    for (const code of UNROUTED_LANGUAGE_CODES) {
      const target = unsupportedLanguageRedirectPath(`/${code}`);
      expect(target).not.toBeNull();
      expect(target).not.toContain("/lt");
      expect(target).not.toBe(`/lt/${code}`);
    }
  });

  it("keeps the rest of the path so a deep link survives", () => {
    expect(unsupportedLanguageRedirectPath("/sv/dashboard")).toBe(
      "/en/dashboard",
    );
    expect(unsupportedLanguageRedirectPath("/pl/for-workers/carpenter")).toBe(
      "/en/for-workers/carpenter",
    );
  });

  it("is case-insensitive on the language segment", () => {
    expect(unsupportedLanguageRedirectPath("/SV")).toBe("/en");
  });
});

describe("it touches nothing else", () => {
  it("leaves every active locale alone", () => {
    for (const locale of activeLocales) {
      expect(unsupportedLanguageRedirectPath(`/${locale}`)).toBeNull();
      expect(
        unsupportedLanguageRedirectPath(`/${locale}/dashboard`),
      ).toBeNull();
    }
  });

  it("leaves the root alone, so `/` → `/lt` still happens in intl", () => {
    expect(unsupportedLanguageRedirectPath("/")).toBeNull();
    expect(unsupportedLanguageRedirectPath("")).toBeNull();
  });

  it("leaves an ordinary unknown path alone, so it still 404s", () => {
    // A page that does not exist must keep behaving like a page that does not
    // exist. Turning every unknown segment into an English redirect would hide
    // real 404s behind a 307.
    expect(unsupportedLanguageRedirectPath("/pricing")).toBeNull();
    expect(unsupportedLanguageRedirectPath("/nonsense/deep")).toBeNull();
  });

  it("only looks at the FIRST segment", () => {
    // `sv` deeper in the path belongs to a page inside an active locale.
    expect(unsupportedLanguageRedirectPath("/en/sv")).toBeNull();
    expect(unsupportedLanguageRedirectPath("/lt/pl-tools")).toBeNull();
  });
});

describe("the list is derived, so it cannot go stale", () => {
  it("contains every catalog locale that is not active", () => {
    const inactive = locales.filter(
      (l) => !(activeLocales as readonly string[]).includes(l),
    );
    expect(inactive.length).toBeGreaterThan(0);
    for (const l of inactive) expect(UNROUTED_LANGUAGE_CODES).toContain(l);
  });

  it("contains no active locale — promoting one removes it automatically", () => {
    for (const l of activeLocales) {
      expect(UNROUTED_LANGUAGE_CODES).not.toContain(l);
    }
  });

  it("covers the taxonomy-only and acquisition-only languages", () => {
    for (const l of NON_UI_TAXONOMY_LOCALES) {
      expect(UNROUTED_LANGUAGE_CODES).toContain(l);
    }
    for (const l of ACQUISITION_ONLY_LANGUAGES) {
      expect(UNROUTED_LANGUAGE_CODES).toContain(l);
    }
  });

  it("falls back to a locale that is actually active", () => {
    expect(activeLocales as readonly string[]).toContain(
      UNSUPPORTED_LANGUAGE_FALLBACK,
    );
  });
});

describe("this file may never become a claim of language support", () => {
  it("does not send a Ukrainian reader to Russian", () => {
    // `ru` is active and lexically nearest, and it is the wrong answer: many
    // Ukrainian speakers reject being addressed in Russian, and a redirect is
    // a statement about the reader that the product cannot take back.
    expect(unsupportedLanguageRedirectPath("/uk")).toBe("/en");
  });

  it("does not add any acquisition-only language to the catalog set", () => {
    // Listing `uk` here must never be a back door into the §2.4 canonical set.
    for (const l of ACQUISITION_ONLY_LANGUAGES) {
      expect(locales as readonly string[]).not.toContain(l);
    }
  });

  it("redirects exactly the languages whose catalog is not real", () => {
    // The justification for redirecting rather than routing is measured, not
    // asserted: a redirected language either has no catalog at all, or has one
    // that is still full of "[EN] " placeholders. If a catalog here ever
    // reaches parity, this test fails and the answer is to ACTIVATE it in
    // config.ts — not to loosen this test.
    const messagesDir = join(process.cwd(), "messages");
    const countLeaves = (value: unknown): [number, number] => {
      let total = 0;
      let placeholders = 0;
      const walk = (v: unknown): void => {
        if (typeof v === "string") {
          total += 1;
          if (v.includes("[EN]")) placeholders += 1;
          return;
        }
        if (v && typeof v === "object") {
          for (const inner of Object.values(v as Record<string, unknown>)) {
            walk(inner);
          }
        }
      };
      walk(value);
      return [total, placeholders];
    };

    const [enTotal] = countLeaves(
      JSON.parse(readFileSync(join(messagesDir, "en.json"), "utf8")),
    );
    expect(enTotal).toBeGreaterThan(1000);

    for (const code of UNROUTED_LANGUAGE_CODES) {
      let raw: string;
      try {
        raw = readFileSync(join(messagesDir, `${code}.json`), "utf8");
      } catch {
        continue; // no catalog at all — redirecting is unarguable
      }
      const [total, placeholders] = countLeaves(JSON.parse(raw));
      const parity = total / enTotal;
      const isReal = parity > 0.95 && placeholders === 0;
      expect(
        isReal,
        `messages/${code}.json now looks complete (${total}/${enTotal} leaves, ` +
          `${placeholders} placeholders) — promote it in config.ts instead of ` +
          `redirecting it`,
      ).toBe(false);
    }
  });
});
