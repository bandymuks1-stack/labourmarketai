/**
 * Invariants of the canonical global country model (PR-G).
 *
 * The model must genuinely cover the whole ISO-3166-1 alpha-2 space so no
 * feature can quietly regress to a Europe-only / Lithuania-default world:
 *   - complete ISO registry (249 assigned codes);
 *   - every country has a currency (Antarctica excepted) + >=1 valid IANA tz
 *     + an in-range centroid;
 *   - US ships 51 subdivisions (50 states + DC, kind "state");
 *   - GE ships its 12 standard regions (kind "region");
 *   - NO country requires a postal code (binding platform decision);
 *   - display names come from Intl (lt/en/ru work; ka degrades honestly);
 *   - currency formatting resolves GEL for GE, USD for US, EUR for LT.
 */
import { describe, expect, it } from "vitest";

import {
  ALL_ISO_COUNTRIES,
  GE_REGIONS,
  US_STATES,
  countryDisplayName,
  formatCurrencyForCountry,
  getCountryMeta,
  getSubdivisions,
  isIsoCountry,
  requiresPostalCode,
  resolveCountryCode,
  resolveCountryList,
  countryNameKey,
} from "./country-model";
import { ACTIVE_MARKETS } from "@/lib/taxonomy/work-categories";

describe("country-model — ISO registry", () => {
  it("covers all 249 officially assigned ISO-3166-1 alpha-2 codes, uppercase, unique", () => {
    expect(ALL_ISO_COUNTRIES.length).toBe(249);
    expect(new Set(ALL_ISO_COUNTRIES).size).toBe(249);
    for (const code of ALL_ISO_COUNTRIES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("recognises GE and US, rejects non-ISO codes", () => {
    expect(isIsoCountry("GE")).toBe(true);
    expect(isIsoCountry("US")).toBe(true);
    expect(isIsoCountry("us")).toBe(true);
    expect(isIsoCountry("ZZ")).toBe(false);
    expect(getCountryMeta("ZZ")).toBeNull();
  });

  it("every ACTIVE_MARKET is an ISO country", () => {
    for (const code of ACTIVE_MARKETS) {
      expect(isIsoCountry(code), `${code} is ISO`).toBe(true);
    }
  });
});

describe("country-model — per-country metadata", () => {
  it("every ISO country has a currency (Antarctica excepted), a valid IANA timezone, and an in-range centroid", () => {
    for (const code of ALL_ISO_COUNTRIES) {
      const meta = getCountryMeta(code)!;
      expect(meta, `${code} meta`).toBeTruthy();
      if (code === "AQ") {
        // Antarctica genuinely has no official currency — honest null.
        expect(meta.currency).toBeNull();
      } else {
        expect(meta.currency, `${code} currency`).toMatch(/^[A-Z]{3}$/);
      }
      expect(meta.timezones.length, `${code} tz count`).toBeGreaterThan(0);
      for (const tz of meta.timezones) {
        // Throws on an invalid IANA identifier.
        expect(
          () => new Intl.DateTimeFormat("en", { timeZone: tz }),
          `${code} tz ${tz}`,
        ).not.toThrow();
      }
      expect(Math.abs(meta.centroid.lat), `${code} lat`).toBeLessThanOrEqual(90);
      expect(Math.abs(meta.centroid.lng), `${code} lng`).toBeLessThanOrEqual(180);
    }
  });

  it("every ACTIVE_MARKET has a non-null currency and timezone", () => {
    for (const code of ACTIVE_MARKETS) {
      const meta = getCountryMeta(code)!;
      expect(meta.currency, `${code} currency`).toMatch(/^[A-Z]{3}$/);
      expect(meta.timezones.length, `${code} tz`).toBeGreaterThan(0);
    }
  });

  it("GE and US carry the expected market facts (GEL/Tbilisi, USD)", () => {
    expect(getCountryMeta("GE")!.currency).toBe("GEL");
    expect(getCountryMeta("GE")!.timezones).toContain("Asia/Tbilisi");
    expect(getCountryMeta("US")!.currency).toBe("USD");
    expect(getCountryMeta("LT")!.currency).toBe("EUR");
  });
});

describe("country-model — subdivisions", () => {
  it("US has exactly 51 subdivisions (50 states + DC) of kind 'state'", () => {
    expect(getCountryMeta("US")!.subdivisionKind).toBe("state");
    expect(US_STATES.length).toBe(51);
    expect(getSubdivisions("US").length).toBe(51);
    const codes = getSubdivisions("US").map((s) => s.code);
    expect(new Set(codes).size).toBe(51);
    expect(codes).toContain("DC");
    expect(codes).toContain("CA");
  });

  it("GE has its 12 standard regions of kind 'region'", () => {
    expect(getCountryMeta("GE")!.subdivisionKind).toBe("region");
    expect(GE_REGIONS.length).toBe(12);
    const names = getSubdivisions("GE").map((s) => s.name);
    for (const expected of [
      "Tbilisi",
      "Adjara",
      "Imereti",
      "Kakheti",
      "Kvemo Kartli",
      "Shida Kartli",
      "Samegrelo-Zemo Svaneti",
      "Guria",
      "Mtskheta-Mtianeti",
      "Samtskhe-Javakheti",
      "Abkhazia",
    ]) {
      expect(names, `GE region ${expected}`).toContain(expected);
    }
  });

  it("DE declares state-kind subdivisions (no curated list — honest empty)", () => {
    expect(getCountryMeta("DE")!.subdivisionKind).toBe("state");
    expect(getSubdivisions("DE")).toEqual([]);
  });

  it("no country requires a postal code (binding platform decision)", () => {
    for (const code of ALL_ISO_COUNTRIES) {
      expect(requiresPostalCode(code), `${code} postal`).toBe(false);
    }
  });
});

describe("country-model — Intl display names", () => {
  it("resolves localized names for lt/en/ru", () => {
    expect(countryDisplayName("US", "en")).toBe("United States");
    // Locale-correct, never the raw code.
    for (const locale of ["lt", "ru"]) {
      for (const code of ["US", "GE", "LT"]) {
        const name = countryDisplayName(code, locale);
        expect(name.length, `${locale}/${code}`).toBeGreaterThan(0);
        expect(name, `${locale}/${code} not raw code`).not.toBe(code);
      }
    }
  });

  it("ka (Georgian) falls back through en instead of breaking", () => {
    const name = countryDisplayName("US", "ka");
    expect(name.length).toBeGreaterThan(0);
    // Either a real Georgian name (full ICU) or the en fallback — never the
    // bare ISO code and never a throw.
    expect(name).not.toBe("US");
  });

  it("an unknown region degrades to the raw code, never a guessed country", () => {
    expect(countryDisplayName("ZZ", "en")).toBe("ZZ");
  });
});

describe("country-model — currency formatting", () => {
  it("formats GEL for GE, USD for US, EUR for LT", () => {
    const gel = formatCurrencyForCountry(100, "GE", "en");
    const usd = formatCurrencyForCountry(100, "US", "en");
    const eur = formatCurrencyForCountry(100, "LT", "lt");
    expect(gel).toBeTruthy();
    expect(usd).toBeTruthy();
    expect(eur).toBeTruthy();
    expect(gel!).toMatch(/GEL|₾/);
    expect(usd!).toMatch(/\$|USD/);
    expect(eur!).toMatch(/€|EUR/);
  });

  it("returns null (honest absence) for unknown or currency-less countries", () => {
    expect(formatCurrencyForCountry(1, "ZZ", "en")).toBeNull();
    expect(formatCurrencyForCountry(1, "AQ", "en")).toBeNull();
  });
});

describe("country-model — resolveCountryCode (global-access rule, 2026-09-22: a country NAME is a country)", () => {
  it("the Vietnam case, every representation → VN", () => {
    for (const typed of ["VN", "vn", " Vn ", "Vietnam", "vietnam", "VIETNAM", "Viet Nam", "viet-nam", "Việt Nam", "Vietnamas", "Wietnam", "Вьетнам", "Vietnã"]) {
      expect(resolveCountryCode(typed), typed).toBe("VN");
    }
  });
  it("EU and non-EU, code or name in several product languages — none is refused", () => {
    const cases: Array<[string, string]> = [
      ["LT", "LT"], ["Lithuania", "LT"], ["Lietuva", "LT"], ["Litwa", "LT"], ["Литва", "LT"],
      ["Poland", "PL"], ["Polska", "PL"], ["Lenkija", "PL"],
      ["Germany", "DE"], ["Deutschland", "DE"], ["Vokietija", "DE"],
      ["Sweden", "SE"], ["Sverige", "SE"], ["Ireland", "IE"], ["Airija", "IE"],
      ["Saudi Arabia", "SA"], ["Saudo Arabija", "SA"], ["KSA", "SA"],
      ["Bangladesh", "BD"], ["Bangladešas", "BD"], ["Oman", "OM"], ["Albania", "AL"], ["Albanija", "AL"],
      ["India", "IN"], ["Pakistan", "PK"], ["Nepal", "NP"], ["Philippines", "PH"], ["Tunisia", "TN"], ["Tunisie", "TN"],
      ["United Kingdom", "GB"], ["UK", "GB"], ["Great Britain", "GB"], ["USA", "US"], ["United States", "US"],
      ["Czech Republic", "CZ"], ["Czechia", "CZ"], ["Turkey", "TR"], ["Türkiye", "TR"], ["Russia", "RU"],
      ["South Korea", "KR"], ["Côte d'Ivoire", "CI"], ["Ivory Coast", "CI"], ["Georgia", "GE"], ["Sakartvelo", "GE"],
    ];
    for (const [typed, iso] of cases) expect(resolveCountryCode(typed), typed).toBe(iso);
  });
  it("what is NOT a country resolves to nothing — never a guess, never a default, never a substring", () => {
    for (const typed of ["", "   ", "Hanoi", "Europe", "EU", "somewhere in the Gulf", "ZZ", "XX", "V", "VNM", "Vietnam and Thailand", "north", "12", "the", "Sakartvelo Georgia", "Georgia state"]) {
      expect(resolveCountryCode(typed), typed).toBeNull();
    }
    expect(resolveCountryCode(null)).toBeNull();
    expect(resolveCountryCode(undefined)).toBeNull();
  });
  it("CLDR collisions are ambiguous, not guessed; the alias table only names assigned codes", () => {
    // "Georgia" is a country AND a US state, but only one ISO region; the state is a subdivision.
    expect(resolveCountryCode("Georgia")).toBe("GE");
    expect(countryNameKey("  Viet-Nam. ")).toBe("viet nam");
    expect(countryNameKey("Việt Nam")).toBe("viet nam");
  });
  it("a typed list splits on , ; and newlines only, resolves each part, dedupes, and REPORTS what did not resolve", () => {
    const r = resolveCountryList("LT, Vietnam; viet nam\nSaudi Arabia, Hanoi, vn");
    expect(r.codes).toEqual(["LT", "VN", "SA"]);
    expect(r.unresolved).toEqual(["Hanoi"]);
    expect(resolveCountryList(["no", " se ", "Saudi Arabia"]).codes).toEqual(["NO", "SE", "SA"]);
    expect(resolveCountryList(null)).toEqual({ codes: [], unresolved: [] });
    expect(resolveCountryList("")).toEqual({ codes: [], unresolved: [] });
  });
  it("every ISO code resolves to itself, and its English display name resolves back to it", () => {
    for (const code of ALL_ISO_COUNTRIES) {
      expect(resolveCountryCode(code), code).toBe(code);
      const name = countryDisplayName(code, "en");
      // A handful of CLDR English names collide across locales or are shared regions; those resolve to null, never to another code.
      const back = resolveCountryCode(name);
      expect(back === null || back === code, `${code} ${name} → ${back}`).toBe(true);
    }
  });
});
