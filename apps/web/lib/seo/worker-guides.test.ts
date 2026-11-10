import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { activeLocales } from "@/lib/i18n/config";
import { ACQUISITION_ONLY_LANGUAGES } from "@/lib/i18n/unsupported-language";
import { isUnknownAddress } from "@/lib/routing/known-first-segments";
import { brandedTitle } from "@/lib/seo/metadata";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import { GUIDE_CHROME, GUIDE_COMBOS } from "@/content/worker-guides/professions";
import { GUIDE_COUNTRIES } from "@/content/worker-guides/countries";
import {
  GUIDE_HOME_LOCALE,
  GUIDE_LANGUAGES,
  WORKER_GUIDES,
  guideHreflang,
  guideUrl,
  resolveWorkerGuide,
} from "./worker-guides";

/**
 * Worker acquisition guides (owner P0 2026-11-09). These checks are the
 * release gate the owner listed: unique content, correct language and
 * hreflang, canonical/sitemap agreement, a registration path, and no promise
 * the product cannot keep.
 */
describe("worker guides — routing", () => {
  it("serves every guide under a ROUTED UI locale, never under its own unrouted code", () => {
    for (const g of WORKER_GUIDES) {
      expect(activeLocales as readonly string[]).toContain(g.homeLocale);
    }
    // Turkish has no UI catalog: it must stay an acquisition-only language and
    // live under /en, so `/tr` keeps redirecting and no Turkish UI is claimed.
    expect(ACQUISITION_ONLY_LANGUAGES as readonly string[]).toContain("tr");
    expect(GUIDE_HOME_LOCALE.tr).toBe("en");
    expect(GUIDE_HOME_LOCALE.ru).toBe("ru");
  });

  it("resolves each guide only under its own locale", () => {
    for (const g of WORKER_GUIDES) {
      expect(resolveWorkerGuide(g.homeLocale, g.slug)).toBe(g);
      for (const other of activeLocales.filter((l) => l !== g.homeLocale)) {
        // a slug of another locale's guide may never resolve here
        const hit = resolveWorkerGuide(other, g.slug);
        expect(hit === null || hit.homeLocale === other).toBe(true);
      }
    }
    expect(resolveWorkerGuide("ru", "nope")).toBeNull();
  });

  it("is a real route depth for the 404 middleware", () => {
    for (const g of WORKER_GUIDES) expect(isUnknownAddress(g.path)).toBe(false);
    expect(isUnknownAddress("/work-abroad/a/b")).toBe(true);
  });

  it("has unique slugs per locale and unique keys per language", () => {
    const seen = new Set<string>();
    for (const g of WORKER_GUIDES) {
      const id = `${g.homeLocale}${g.path}`;
      expect(seen.has(id), id).toBe(false);
      seen.add(id);
      expect(g.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
    for (const language of GUIDE_LANGUAGES) {
      const keys = WORKER_GUIDES.filter((g) => g.language === language).map((g) => g.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("worker guides — content quality (no doorway pages)", () => {
  it("every guide has its own title, description, H1 and lede", () => {
    for (const field of ["title", "description", "h1", "lede"] as const) {
      const values = WORKER_GUIDES.map((g) => g[field]);
      expect(new Set(values).size, field).toBe(values.length);
    }
  });

  it("fits a search result (SEO-7 limits)", () => {
    for (const g of WORKER_GUIDES) {
      expect(brandedTitle(g.title).length, g.slug).toBeLessThanOrEqual(70);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(160);
      expect(g.description.length, g.slug).toBeGreaterThanOrEqual(70);
    }
  });

  it("a profession page says something specific, not the country page with a word swapped", () => {
    for (const g of WORKER_GUIDES.filter((x) => x.profession)) {
      expect(g.professionNotes.length, g.slug).toBeGreaterThanOrEqual(3);
    }
    for (const combo of GUIDE_COMBOS) {
      expect(GUIDE_COUNTRIES.some((c) => c.code === combo.country)).toBe(true);
    }
  });

  it("every country has country-specific facts and at least one official source", () => {
    for (const c of GUIDE_COUNTRIES) {
      for (const language of GUIDE_LANGUAGES) {
        expect(c[language].rights.length, `${c.code}.${language}`).toBeGreaterThan(0);
        expect(c[language].onSite.length, `${c.code}.${language}`).toBeGreaterThan(0);
      }
      expect(c.sources.every((s) => s.url.startsWith("https://"))).toBe(true);
      expect(c.sources.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("is written in its own script: Russian copy is Cyrillic, Turkish copy is Latin", () => {
    for (const g of WORKER_GUIDES) {
      const text = `${g.h1} ${g.lede}`;
      if (g.language === "ru") expect(text, g.slug).toMatch(/[а-яё]/i);
      if (g.language === "tr") expect(text, g.slug).not.toMatch(/[а-яё]/i);
    }
  });

  it("never promises a job, a visa or placement, and never states a pay figure or count", () => {
    const all = JSON.stringify([WORKER_GUIDES, GUIDE_CHROME.ru, GUIDE_CHROME.tr]);
    expect(JSON.stringify(WORKER_GUIDES)).not.toMatch(/гарантир/i);
    expect(JSON.stringify(WORKER_GUIDES)).not.toMatch(/garanti/i);
    // The FAQ asks the question only to answer it: no.
    expect(GUIDE_CHROME.ru.faq.find((f) => /гарантир/.test(f.q))?.a).toMatch(/^Нет\./);
    expect(GUIDE_CHROME.tr.faq.find((f) => /garanti/.test(f.q))?.a).toMatch(/^Hayır\./);
    expect(all).not.toMatch(/€\s?\d|\d\s?(€|eur\b|евро)/i);
    expect(all).not.toMatch(/(?<![\p{L}\p{N}_])demos?(?![\p{L}\p{N}_])/iu);
  });

  it("the Turkish page names the real UI languages and never claims a Turkish UI", () => {
    const names: Record<string, string> = {
      en: "İngilizce",
      de: "Almanca",
      pl: "Lehçe",
      nl: "Felemenkçe",
      ru: "Rusça",
      lt: "Litvanca",
    };
    const answer = GUIDE_CHROME.tr.faq.map((f) => f.a).join(" ");
    for (const l of activeLocales) expect(answer, l).toContain(names[l]);
    expect(answer).toContain("Türkçe arayüz henüz yok");
    expect(GUIDE_CHROME.tr.uiLanguageNote).toBeTruthy();
  });
});

describe("worker guides — hreflang, canonical and sitemap agree", () => {
  it("hreflang uses the CONTENT language and is reciprocal", () => {
    for (const g of WORKER_GUIDES) {
      const langs = guideHreflang(g);
      expect(langs[g.language]).toBe(guideUrl(g));
      expect(Object.keys(langs)).not.toContain("x-default");
      for (const [lang, url] of Object.entries(langs)) {
        const other = WORKER_GUIDES.find((o) => guideUrl(o) === url);
        expect(other?.language).toBe(lang);
        expect(guideHreflang(other!)[g.language]).toBe(guideUrl(g));
      }
    }
  });

  it("the sitemap lists every guide exactly once, on the apex, with its own cluster", () => {
    const entries = sitemap();
    for (const g of WORKER_GUIDES) {
      const hits = entries.filter((e) => e.url === guideUrl(g));
      expect(hits.length, g.slug).toBe(1);
      expect(hits[0]!.url.startsWith("https://labourmarket.ai/")).toBe(true);
      expect(hits[0]!.alternates?.languages).toEqual(guideHreflang(g));
    }
  });

  it("llms.txt points AI crawlers at every guide by its real URL", () => {
    const txt = buildLlmsTxt();
    for (const g of WORKER_GUIDES) expect(txt).toContain(`(${guideUrl(g)})`);
  });
});
