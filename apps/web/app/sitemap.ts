import type { MetadataRoute } from "next";
import { activeLocales } from "@/lib/i18n/config";
import { localizedUrl, hreflangAlternates } from "@/lib/seo/metadata";
import { SUPPORTED_COUNTRIES } from "@/lib/labour-market/country-evidence";
import { isVisionPublic } from "@/lib/config/vision-publication";
import { publishedCategories } from "@/lib/answer-engine/publishing";

/**
 * /sitemap.xml — only public, indexable marketing pages, on the apex
 * (https://labourmarket.ai). Every entry is emitted per active locale
 * (lt / en / ru) and carries hreflang alternates so Google maps the
 * localized versions to each other. No app / dashboard / auth / preview
 * URLs, no localhost, no app subdomain (enforced by the SEO guard).
 */

/** Public marketing paths (after the /{locale} segment). "" = locale home. */
const STATIC_PATHS: readonly string[] = [
  "",
  "/for-workers",
  "/for-companies",
  "/for-agencies",
  "/work-abroad",
  "/work-opportunities",
  "/skills",
  "/professions",
  "/company-need",
  "/worker-intake",
  // Free CV builder — worker acquisition entry (beta train v2 §12).
  "/create-cv",
  // The public job board. It shipped live with the anonymous projection
  // (migration 20260818140000) but was never advertised here, so the largest
  // public surface the product owns — 39,241 live ads — had no crawler entry
  // point at all. The individual /jobs/[id] pages are far too many for this
  // hand-maintained list and ride /jobs-sitemap.xml instead.
  "/jobs",
  "/labour-market",
  "/match-preview",
  "/pricing",
  // Public work & project cost calculator (European Calculator v1).
  "/calculators/project-cost",
  // Project explanation page (CR train WAGON 2).
  "/about",
  "/legal/privacy",
  "/legal/terms",
  "/legal/cookies",
  // Footer-linked legal page was discoverable but unlisted (audit F-N4).
  "/legal/marketplace-rules",
  // Compliance explanation pack (CR train WAGON 2).
  "/legal/data-protection",
  "/legal/data-access",
  // Canonical legal notice / imprint (legal-entity truth v1).
  "/legal/legal-notice",
  // Answer-engine hub. llms.txt advertised it and every answer page
  // breadcrumbs to it, but no sitemap listed it (SEO/GEO gap, 2026-09-20).
  // Individual answers ride /questions-sitemap.xml.
  "/questions",
];

/** `/vision` follows its publication flag: while the page emits
 *  noindex,nofollow the sitemap must not advertise it (audit F-N3 —
 *  contradictory crawler signals). The owner's one-line flag flip makes it
 *  reappear here with no further edits. */
const FLAGGED_PATHS: readonly string[] = isVisionPublic() ? ["/vision"] : [];

/**
 * Answer-engine category pages, e.g. /questions/category/skills_competencies.
 * Derived from the publishing layer, NEVER from the full ANSWER_CATEGORIES
 * list: the category route 404s in a locale with no published answer, so a
 * hard-coded list would advertise dead URLs. Emitted per locale where the
 * category is published; the hreflang cluster is limited to the same set.
 */
function answerCategoryEntries(): MetadataRoute.Sitemap {
  const byCategory = new Map<string, (typeof activeLocales)[number][]>();
  for (const locale of activeLocales) {
    for (const category of publishedCategories(locale)) {
      const list = byCategory.get(category) ?? [];
      list.push(locale);
      byCategory.set(category, list);
    }
  }
  const entries: MetadataRoute.Sitemap = [];
  for (const [category, publishedIn] of byCategory) {
    const path = `/questions/category/${category}`;
    const languages: Record<string, string> = {};
    for (const locale of publishedIn) languages[locale] = localizedUrl(locale, path);
    for (const locale of publishedIn) {
      entries.push({
        url: localizedUrl(locale, path),
        changeFrequency: "monthly",
        priority: 0.6,
        alternates: { languages },
      });
    }
  }
  return entries;
}

/** Per-country labour-market evidence pages, e.g. /labour-market/lt. */
const COUNTRY_PATHS: readonly string[] = SUPPORTED_COUNTRIES.map(
  (c) => `/labour-market/${c.toLowerCase()}`,
);

/** Core cross-sector audience pages — prioritised over secondary pages. */
const CORE_PATHS: readonly string[] = [
  "/for-workers",
  "/for-companies",
  "/for-agencies",
  "/labour-market",
  "/company-need",
  "/worker-intake",
  "/create-cv",
  "/work-opportunities",
  "/skills",
  "/professions",
  // Highest-intent public surface: real vacancies a visitor can search.
  "/jobs",
];

function priorityFor(path: string): number {
  if (path === "") return 1;
  if (CORE_PATHS.includes(path)) return 0.8;
  if (path.startsWith("/legal")) return 0.3;
  return 0.7;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...STATIC_PATHS, ...FLAGGED_PATHS, ...COUNTRY_PATHS];
  const entries: MetadataRoute.Sitemap = [];

  for (const path of paths) {
    const languages = hreflangAlternates(path);
    const priority = priorityFor(path);
    for (const locale of activeLocales) {
      entries.push({
        url: localizedUrl(locale, path),
        changeFrequency: path === "" ? "weekly" : "monthly",
        priority,
        alternates: { languages },
      });
    }
  }

  entries.push(...answerCategoryEntries());

  return entries;
}
