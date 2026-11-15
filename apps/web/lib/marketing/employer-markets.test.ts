import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import sitemap from "@/app/sitemap";
import { activeLocales } from "@/lib/i18n/config";
import { localizedUrl } from "@/lib/seo/metadata";

import {
  EMPLOYER_INTENT_PATHS,
  EMPLOYER_INTENTS,
  EMPLOYER_MARKET_PATHS,
  EMPLOYER_MARKETS,
  employerAdLink,
  employerIntentNeedQuery,
  employerIntentPath,
  employerMarketNeedQuery,
  employerMarketPath,
  readEmployerIntent,
  readEmployerMarket,
} from "./employer-markets";
import { ENGAGEMENT_MODELS } from "@/lib/staffing/company-need";
import { PREFILL_ENGAGEMENTS, parseCompanyNeedPrefill } from "@/lib/staffing/company-need-prefill";

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

describe("each market version is its own indexable page (owner P0 2026-11-10)", () => {
  const web = join(__dirname, "..", "..");
  const markets = Object.keys(EMPLOYER_MARKETS) as (keyof typeof EMPLOYER_MARKETS)[];

  it("has its own address, without advert parameters", () => {
    expect(markets.map(employerMarketPath)).toEqual([
      "/for-companies?market=lu",
      "/for-companies?market=nl",
      "/for-companies?market=dk",
    ]);
    expect(EMPLOYER_MARKET_PATHS).toEqual(markets.map(employerMarketPath));
  });

  it("the page declares that address as canonical, not /for-companies", () => {
    const page = readFileSync(join(web, "app", "[locale]", "(marketing)", "for-companies", "page.tsx"), "utf8");
    const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default"));
    expect(page).toContain("path: employerMarketPath(market)");
    expect(meta).toContain("path: focus.path");
    expect(meta).not.toMatch(/path: "\/for-companies",/);
  });

  it("is in the sitemap in every active locale, with hreflang to the same market", () => {
    const entries = sitemap();
    for (const path of EMPLOYER_MARKET_PATHS) {
      for (const locale of activeLocales) {
        const e = entries.find((x) => x.url === localizedUrl(locale, path));
        expect(e, `${locale}${path}`).toBeTruthy();
        const langs = e?.alternates?.languages as Record<string, string>;
        for (const l of activeLocales) expect(langs[l]).toBe(localizedUrl(l, path));
        expect(langs["x-default"]).toBe(localizedUrl("en", path));
      }
    }
  });

  it("title, H1 and description differ between markets and from the plain page", () => {
    const messages = join(web, "messages");
    for (const locale of activeLocales) {
      const j = JSON.parse(readFileSync(join(messages, `${locale}.json`), "utf8"));
      const m = j.pages.companies.markets;
      for (const field of ["metaTitle", "metaDescription"]) {
        expect(new Set(markets.map((k) => m[k][field])).size, `${locale} ${field}`).toBe(markets.length);
      }
      const h1 = markets.map((k) => `${m[k].title} ${m[k].titleAccent}`);
      expect(new Set(h1).size, `${locale} H1`).toBe(markets.length);
      const plain = `${j.pages.companies.title} ${j.pages.companies.titleAccent}`;
      expect(h1, `${locale} H1 vs plain page`).not.toContain(plain);
    }
  });
});

describe("B2B intent versions (owner P1 2026-11-11): subcontractors and crews, staffing partners", () => {
  const web = join(__dirname, "..", "..");
  const intents = Object.keys(EMPLOYER_INTENTS) as (keyof typeof EMPLOYER_INTENTS)[];
  const page = readFileSync(join(web, "app", "[locale]", "(marketing)", "for-companies", "page.tsx"), "utf8");

  it("reads ?need=, any case, first of a repeated value; anything else is the plain page", () => {
    expect(readEmployerIntent("subcontracting")).toBe("subcontracting");
    expect(readEmployerIntent(" AGENCY ")).toBe("agency");
    expect(readEmployerIntent(["agency", "subcontracting"])).toBe("agency");
    for (const raw of [undefined, null, "", "lu", "constructor", "__proto__", 42]) {
      expect(readEmployerIntent(raw)).toBeNull();
    }
  });

  it("each has its own self-canonical address, in the sitemap with hreflang to the same intent", () => {
    expect(intents.map(employerIntentPath)).toEqual([
      "/for-companies?need=subcontracting",
      "/for-companies?need=agency",
    ]);
    expect(EMPLOYER_INTENT_PATHS).toEqual(intents.map(employerIntentPath));
    expect(page).toContain("path: employerIntentPath(intent)");
    const entries = sitemap();
    for (const path of EMPLOYER_INTENT_PATHS) {
      for (const locale of activeLocales) {
        const e = entries.find((x) => x.url === localizedUrl(locale, path));
        expect(e, `${locale}${path}`).toBeTruthy();
        const langs = e?.alternates?.languages as Record<string, string>;
        for (const l of activeLocales) expect(langs[l]).toBe(localizedUrl(l, path));
        expect(langs["x-default"]).toBe(localizedUrl("en", path));
      }
    }
  });

  it("a market wins over an intent, so ?market=lu&need=agency stays the LU page", () => {
    const focus = page.slice(page.indexOf("async function readFocus"), page.indexOf("type Focus"));
    expect(focus.indexOf("readEmployerMarket(sp.market)")).toBeGreaterThan(-1);
    expect(focus.indexOf("readEmployerMarket(sp.market)")).toBeLessThan(focus.indexOf("readEmployerIntent(sp.need)"));
  });

  it("the one call to action opens the EXISTING inquiry with the engagement model preselected", () => {
    expect(employerIntentNeedQuery("subcontracting")).toBe("engagement=subcontracting");
    expect(employerIntentNeedQuery("agency")).toBe("engagement=agency_supply");
    for (const i of intents) {
      const q = new URLSearchParams(employerIntentNeedQuery(i));
      expect(parseCompanyNeedPrefill(q).engagement).toBe(EMPLOYER_INTENTS[i].engagement);
    }
    // The prefill list is the form's own list, so a preselected value is always one the action accepts.
    expect([...PREFILL_ENGAGEMENTS]).toEqual([...ENGAGEMENT_MODELS]);
    expect(parseCompanyNeedPrefill(new URLSearchParams("engagement=freelance")).engagement).toBeUndefined();
    const form = readFileSync(join(web, "components", "app", "company-need-form.tsx"), "utf8");
    expect(form).toContain('setIf("engagement_model", prefill.engagement, ["employment"])');
  });

  it("every active catalogue carries the copy; title, H1 and description are its own", () => {
    const messages = join(web, "messages");
    for (const locale of activeLocales) {
      const j = JSON.parse(readFileSync(join(messages, `${locale}.json`), "utf8"));
      const n = j.pages.companies.needs;
      const m = j.pages.companies.markets;
      const others = [
        `${j.pages.companies.title} ${j.pages.companies.titleAccent}`,
        ...Object.keys(EMPLOYER_MARKETS).map((k) => `${m[k].title} ${m[k].titleAccent}`),
      ];
      for (const i of intents) {
        const c = n[i];
        for (const k of ["metaTitle", "metaDescription", "eyebrow", "title", "titleAccent", "subcopy", "cta"]) {
          expect(typeof c[k] === "string" && c[k].trim().length > 0, `${locale} ${i}.${k}`).toBe(true);
        }
        expect(c.points).toHaveLength(3);
        expect(c.metaTitle.length).toBeLessThanOrEqual(60);
        expect(c.metaDescription.length).toBeLessThanOrEqual(160);
        expect(others, `${locale} ${i} H1`).not.toContain(`${c.title} ${c.titleAccent}`);
      }
      expect(n.subcontracting.metaTitle).not.toBe(n.agency.metaTitle);
      expect(n.subcontracting.metaDescription).not.toBe(n.agency.metaDescription);
    }
  });

  it("the copy says no account is needed and never claims a crew or partner is available now", () => {
    const en = JSON.parse(readFileSync(join(web, "messages", "en.json"), "utf8")).pages.companies.needs;
    for (const i of intents) {
      expect(en[i].points[0]).toContain("needs no account");
      const text = JSON.stringify(en[i]).toLowerCase();
      // Production holds 0 real teams (capability DEM-6): availability is never claimed.
      expect(text).not.toMatch(/(?<!no suitable )crews? (are|is) available|available (crews|teams)|guarantee|verified|vetted|within \d+|(?<![.\w])ai\b/);
      expect(text).toMatch(/we say so/);
    }
  });
});
