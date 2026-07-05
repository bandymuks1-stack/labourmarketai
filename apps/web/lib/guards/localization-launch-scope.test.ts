import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  activeLocales,
  defaultLocale,
  locales,
  tier1Locales,
} from "@/lib/i18n/config";
import { routing } from "@/lib/i18n/routing";
import {
  NON_UI_TAXONOMY_LOCALES,
  TAXONOMY_LOCALES,
  TAXONOMY_NAME_FILES,
  UI_ACTIVE_LOCALES,
  UI_CATALOG_LOCALES,
} from "@/lib/i18n/launch-language-scope";
import { COVERED_RECOGNITION_LANGUAGES } from "@/lib/structuring/language-packs";

/**
 * LOCALIZATION LAUNCH SCOPE — HONESTY GUARDS (PR14, doctrine §2.4).
 *
 * The three-tier language scope (UI active / UI catalog / taxonomy +
 * recognition) is a set of CLAIMS. Every claim is cross-checked here
 * against the things that make it true: routing config, message files on
 * disk, the locale switcher, the sitemap and the offline recognition
 * registry. FI is taxonomy/recognition ONLY — the product must never
 * surface a Finnish UI claim (owner decision, 2026-07-04 amendment).
 */

const APP_ROOT = join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(join(APP_ROOT, rel), "utf8");

describe("UI tier truth (routing + selector + sitemap)", () => {
  it("active UI locales are exactly lt/en/ru, default lt, tier1 en/lt", () => {
    expect([...activeLocales].sort()).toEqual(["en", "lt", "ru"]);
    expect(defaultLocale).toBe("lt");
    expect([...tier1Locales].sort()).toEqual(["en", "lt"]);
    expect(UI_ACTIVE_LOCALES).toBe(activeLocales);
  });

  it("routing serves ONLY the active locales", () => {
    expect([...routing.locales].sort()).toEqual([...activeLocales].sort());
  });

  it("the locale switcher offers only active locales and never FI", () => {
    const src = read("components/marketing/locale-switcher.tsx");
    expect(src).toMatch(/activeLocales/);
    expect(src).not.toMatch(/\bfi:\s*"/); // no Finnish entry in NATIVE names
    expect(src).toMatch(/tier1Locales/); // non-Tier-1 stays preview-tagged
  });

  it("the sitemap emits only active locales", () => {
    const src = read("app/sitemap.ts");
    expect(src).toMatch(/activeLocales/);
    expect(src).not.toMatch(/[^e]\blocales\b/); // not the full catalog set
  });
});

describe("catalog tier truth (§2.4 file presence)", () => {
  it("the UI catalog is the 11 doctrine locales — FI is NOT one of them", () => {
    expect(UI_CATALOG_LOCALES).toBe(locales);
    expect(locales.length).toBe(11);
    expect([...locales]).not.toContain("fi");
    expect([...activeLocales]).not.toContain("fi");
  });

  it("all 11 catalog message files exist; messages/fi.json does NOT", () => {
    for (const loc of locales) {
      expect(
        existsSync(join(APP_ROOT, "messages", `${loc}.json`)),
        `missing catalog file for ${loc}`,
      ).toBe(true);
    }
    // FI must not grow a flat UI catalog silently — a Finnish UI is an
    // owner decision, not a file that appears.
    expect(existsSync(join(APP_ROOT, "messages", "fi.json"))).toBe(false);
  });
});

describe("taxonomy + recognition tier truth (12 languages incl. FI)", () => {
  it("taxonomy locales = the 11 catalog locales + FI (12 unique)", () => {
    expect(TAXONOMY_LOCALES.length).toBe(12);
    expect(new Set(TAXONOMY_LOCALES).size).toBe(12);
    expect([...TAXONOMY_LOCALES]).toContain("fi");
    expect([...NON_UI_TAXONOMY_LOCALES]).toEqual(["fi"]);
  });

  it("every taxonomy locale ships all six taxonomy name files", () => {
    for (const loc of TAXONOMY_LOCALES) {
      for (const f of TAXONOMY_NAME_FILES) {
        expect(
          existsSync(join(APP_ROOT, "messages", loc, f)),
          `missing messages/${loc}/${f}`,
        ).toBe(true);
      }
    }
  });

  it("offline recognition coverage matches the taxonomy tier exactly", () => {
    // Recognition languages (base lexicon + registered packs) must equal
    // the declared 12 — a pack without taxonomy names, or a claimed
    // language without a pack, is a false language claim either way.
    expect([...COVERED_RECOGNITION_LANGUAGES].sort()).toEqual(
      [...TAXONOMY_LOCALES].sort(),
    );
  });
});

describe("no unsupported Finnish-UI claim anywhere user-facing", () => {
  it("active flat catalogs never name Finnish as an interface language", () => {
    for (const loc of activeLocales) {
      const raw = read(`messages/${loc}.json`);
      expect(raw, `messages/${loc}.json mentions a Finnish UI`).not.toMatch(
        /suomi|suomeksi|finnish (ui|interface|version)/i,
      );
    }
  });

  it("the i18n config documents the REAL parity guard (no stale pointer)", () => {
    const src = read("lib/i18n/config.ts");
    expect(src).toMatch(/i18n-lt-en-parity\.test\.ts/);
    expect(src).not.toMatch(/i18n-active-locale-parity\.test\.ts/);
  });
});
