import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { activeLocales } from "@/lib/i18n/config";

import {
  EMPLOYER_MARKETS,
  employerAdLink,
  employerMarketNeedQuery,
  readEmployerMarket,
} from "./employer-markets";

describe("readEmployerMarket", () => {
  it("names the three markets, any case, first of a repeated value", () => {
    expect(readEmployerMarket("lu")).toBe("lu");
    expect(readEmployerMarket(" NL ")).toBe("nl");
    expect(readEmployerMarket(["dk", "lu"])).toBe("dk");
  });

  it("anything else is the plain page", () => {
    for (const raw of [undefined, null, "", "de", "constructor", "__proto__", 42]) {
      expect(readEmployerMarket(raw)).toBeNull();
    }
  });
});

describe("the one call to action", () => {
  it("opens company-need with the market's country chosen", () => {
    expect(employerMarketNeedQuery("lu")).toBe("country=LU");
    expect(employerMarketNeedQuery("nl")).toBe("country=NL");
    expect(employerMarketNeedQuery("dk")).toBe("country=DK");
  });
});

describe("employerAdLink", () => {
  it("follows the UTM convention per channel", () => {
    const u = new URL(employerAdLink("lu", "de", "google", "a"));
    expect(u.origin + u.pathname).toBe("https://labourmarket.ai/de/for-companies");
    expect(Object.fromEntries(u.searchParams)).toEqual({
      market: "lu",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "lu-employers-a",
      utm_content: "de",
    });
    expect(new URL(employerAdLink("nl", "nl", "facebook", "b")).searchParams.get("utm_medium")).toBe("paid");
    expect(new URL(employerAdLink("dk", "en", "linkedin", "c")).searchParams.get("utm_source")).toBe("linkedin");
  });

  it("never prints a link in a language the market's adverts are not in, or one not routed yet", () => {
    expect(() => employerAdLink("dk", "de", "google", "a")).toThrow();
    expect(() => employerAdLink("nl", "pl", "google", "a")).toThrow();
    // FR is planned for Luxembourg but not active yet.
    expect(() => employerAdLink("lu", "fr", "google", "a")).toThrow();
    expect(() => employerAdLink("lu", "en", "google", "Bad Variant")).toThrow();
  });
});

describe("every active catalogue carries the market copy", () => {
  const messages = join(__dirname, "..", "..", "messages");
  for (const locale of activeLocales) {
    it(locale, () => {
      const j = JSON.parse(readFileSync(join(messages, `${locale}.json`), "utf8"));
      for (const m of Object.keys(EMPLOYER_MARKETS)) {
        const c = j.pages.companies.markets[m];
        for (const k of ["metaTitle", "metaDescription", "eyebrow", "title", "titleAccent", "subcopy", "cta"]) {
          expect(typeof c[k] === "string" && c[k].trim().length > 0, `${locale} ${m}.${k}`).toBe(true);
        }
        expect(c.points).toHaveLength(3);
        // /company-need is a no-signup public intake: the copy may never say an account is required.
        if (locale === "en") expect(c.points[0]).toContain("needs no account");
        expect(c.metaTitle.length).toBeLessThanOrEqual(60);
        expect(c.metaDescription.length).toBeLessThanOrEqual(160);
      }
    });
  }
});
