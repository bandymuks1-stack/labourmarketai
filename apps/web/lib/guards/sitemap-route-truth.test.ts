import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sitemap_ from "@/app/sitemap";
import { activeLocales } from "@/lib/i18n/config";
import { publishedCategories } from "@/lib/answer-engine/publishing";
import { ANSWER_CATEGORY_KEYS } from "@/lib/answer-engine/contract";
import { localizedUrl } from "@/lib/seo/metadata";

/**
 * Sitemap route-truth guard (findings F-N3 / F-N4, consolidation train
 * 2026-07-02).
 *
 * Contract:
 *   - `/vision` never sits unconditionally in the sitemap while its page is
 *     flag-gated to noindex — it must ride `isVisionPublic()` so the crawler
 *     signals can't contradict each other.
 *   - `/legal/marketplace-rules` (footer-linked) is listed alongside the
 *     other legal pages.
 *   - `/questions` (the answer-engine hub llms.txt advertises) is listed, and
 *     the category pages are listed ONLY where they are published — the
 *     category route 404s in a locale with no published answer, so the full
 *     ANSWER_CATEGORIES list must never be hard-coded (SEO/GEO gap, 2026-09-20).
 */

const APP = join(process.cwd());
const sitemap = readFileSync(join(APP, "app/sitemap.ts"), "utf-8");

let cached: ReturnType<typeof sitemapRoute> | undefined;
const sitemapRoute = sitemap_;
const sitemapEntries = () => (cached ??= sitemapRoute());

describe("sitemap matches route reality", () => {
  it("vision entry is gated by the publication flag, not hardcoded", () => {
    expect(sitemap).toMatch(/isVisionPublic\(\)\s*\?\s*\["\/vision"\]/);
    // No unconditional listing left behind.
    const staticBlock = sitemap.match(
      /STATIC_PATHS: readonly string\[\] = \[([\s\S]*?)\];/,
    )?.[1];
    expect(staticBlock).toBeTruthy();
    expect(staticBlock).not.toContain('"/vision"');
  });

  it("marketplace-rules is listed with the other legal pages", () => {
    expect(sitemap).toContain('"/legal/marketplace-rules"');
  });

  it("the /questions hub is listed for every active locale", () => {
    expect(sitemap).toContain('"/questions"');
    const urls = new Set(sitemapEntries().map((e) => String(e.url)));
    for (const locale of activeLocales) {
      expect(urls.has(localizedUrl(locale, "/questions")), `${locale} hub`).toBe(true);
    }
  });

  it("category pages are derived from the publishing layer, never hard-coded", () => {
    expect(sitemap).toMatch(/publishedCategories\(/);
    expect(sitemap).not.toContain('"/questions/category/');
    const urls = new Set(sitemapEntries().map((e) => String(e.url)));
    let listed = 0;
    for (const locale of activeLocales) {
      const published = new Set<string>(publishedCategories(locale));
      for (const category of ANSWER_CATEGORY_KEYS) {
        const url = localizedUrl(locale, `/questions/category/${category}`);
        expect(urls.has(url), `${locale} ${category}`).toBe(published.has(category));
        if (published.has(category)) listed++;
      }
    }
    expect(listed).toBeGreaterThan(0);
  });

  it("category hreflang clusters name only published locales", () => {
    for (const e of sitemapEntries()) {
      const m = /\/([a-z]{2})\/questions\/category\/([a-z_]+)$/.exec(String(e.url));
      if (!m) continue;
      const langs = e.alternates?.languages ?? {};
      for (const locale of Object.keys(langs)) {
        expect(publishedCategories(locale as (typeof activeLocales)[number]), `${m[2]} ${locale}`).toContain(m[2]);
      }
    }
  });
});
