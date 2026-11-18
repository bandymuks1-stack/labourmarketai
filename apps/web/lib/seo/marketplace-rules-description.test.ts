import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activeLocales } from "@/lib/i18n/config";
import { BRAND_SEO } from "./metadata";

/**
 * Head-tag pass 2026-11-12: `/legal/marketplace-rules` had no description of
 * its own, so all six locales repeated the home page's.
 */
describe("/legal/marketplace-rules has its own meta description", () => {
  const page = readFileSync(
    join(process.cwd(), "app", "[locale]", "(marketing)", "legal", "marketplace-rules", "page.tsx"),
    "utf8",
  );

  it("the page hands its opening line to the metadata builder", () => {
    expect(page).toContain('description: t("intro")');
  });

  it("that line exists, fits a search result and is not the home description", () => {
    for (const locale of activeLocales) {
      const messages = JSON.parse(
        readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"),
      ) as { legal: { marketplaceRules: { intro: string } } };
      const intro = messages.legal.marketplaceRules.intro;
      expect(intro.length, locale).toBeGreaterThanOrEqual(70);
      expect(intro.length, locale).toBeLessThanOrEqual(170);
      expect(intro, locale).not.toBe(BRAND_SEO[locale].description);
    }
  });
});
