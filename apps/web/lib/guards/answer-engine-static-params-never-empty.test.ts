/**
 * GUARD — the answer pages' static params are never empty for a routed locale.
 *
 * Production 404 of 2026-11-15: every /questions/category/* and
 * /questions/<slug> page returned 404 in every locale. Cause: the `[locale]`
 * layout sets `dynamicParams = false`, and Next 15.5 pre-renders NO path for a
 * nested dynamic route when its generateStaticParams returns `[]` for even one
 * parent locale (that locale's params pass through incomplete, so "all params
 * generated" is false). Swedish became routed with 0 published answers, and
 * the build went from 348 pre-rendered question pages to 0.
 *
 * The rule: both pages take their params from `staticCategoryParams` /
 * `staticSlugParams`, which return a placeholder that 404s when a locale has
 * nothing published.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeLocales } from "@/lib/i18n/config";
import {
  publishedCategories,
  publishedInCategory,
  resolveSlug,
  staticCategoryParams,
  staticSlugParams,
} from "@/lib/answer-engine/publishing";

const PAGES = join(__dirname, "../../app/[locale]/(marketing)/questions");

describe("answer pages: static params never empty", () => {
  for (const locale of activeLocales) {
    it(`${locale}: category and slug params are non-empty`, () => {
      expect(staticCategoryParams(locale).length).toBeGreaterThan(0);
      expect(staticSlugParams(locale).length).toBeGreaterThan(0);
    });

    it(`${locale}: a placeholder param is one the page refuses (404)`, () => {
      if (publishedCategories(locale).length === 0) {
        for (const { category } of staticCategoryParams(locale)) {
          expect(publishedInCategory(category, locale)).toHaveLength(0);
        }
      }
      for (const { slug } of staticSlugParams(locale)) {
        // Every param is either a real published answer or refused.
        const resolved = resolveSlug(slug, locale);
        if (resolved === null) expect(staticSlugParams(locale)).toHaveLength(1);
      }
    });
  }

  it("both pages read the never-empty helpers", () => {
    const category = readFileSync(join(PAGES, "category/[category]/page.tsx"), "utf8");
    const slug = readFileSync(join(PAGES, "[slug]/page.tsx"), "utf8");
    expect(category).toMatch(/return staticCategoryParams\(/);
    expect(slug).toMatch(/return staticSlugParams\(/);
  });
});
